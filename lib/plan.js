var EventEmitter = require('events').EventEmitter
  , Batch = require('batch')
  , assert = require('assert')
  , util = require('util')
  , makeUuid = require('node-uuid').v4
  , Pool = require('./pool')
  , Task = require('./task')
  , extend = require('./extend')

module.exports = Plan;

// per-plan-id-and-task-class running average ratio of `amountTotal` from
// `progress` event to job duration in seconds. we keep this information in
// order to provide an accurate measurement of progress by comparing it to
// the ratio of other tasks and computing what portion of the overall
// progress should be allocated to each task.
var ratios = {};

// every time we get new metric, use this amount of the old average and
// 1.0 - x of the new metric
var RATIO_SMOOTHNESS = 0.4;

// how often to emit progress events, minimum and maximum. If not enough
// natural progress events come through, we interpolate based on current
// time. if too many come in, we should probably rate limit, but that's
// not yet implemented.
var PROGRESS_MIN_INTERVAL = 1000;

// this helps us cap the number of simultaneous cpu-bound tasks
var pool = new Pool();

// planId is used for the progress heuristics. when you're building a
// similar plan, use the same planId and over time you'll get smoother
// progress indication.
function Plan(planId) {
  EventEmitter.call(this);

  this.planId = planId || makeUuid();
  this.taskTable = {};
  this.startTasks = {};
  this.dependencies = {};
}

util.inherits(Plan, EventEmitter);

// you can set this to limit the number of simultaneous CPU-bound tasks
Plan.setWorkerCap = function(count) {
  pool.workerCap = count;
};

Plan.createTask = function(definition, name, options) {
  return new Task(definition, name, options);
};

Plan.prototype.addTask = function(task) {
  this.taskTable[task.id] = task;
  this.startTasks[task.id] = task;
};

Plan.prototype.addDependency = function(targetTask, dependencyTask){
  delete this.startTasks[dependencyTask.id];
  this.taskTable[dependencyTask.id] = dependencyTask;

  this.dependencies[targetTask.id] = this.dependencies[targetTask.id] || {};
  this.dependencies[targetTask.id][dependencyTask.id] = dependencyTask;
};

Plan.prototype.start = function(context) {
  var self = this;

  startBatch(self.startTasks, context, function(err, results) {
    // ignore the error. we already emitted it.
    cleanup();
    self.emit('end', results);
  });

  var emitProgressTimeout = null;
  function emitProgress() {
    var percent = totalProgress(self.startTasks);
    self.emit('progress', percent, 1);

    if (emitProgressTimeout) clearTimeout(emitProgressTimeout);
    emitProgressTimeout = setTimeout(emitProgress, PROGRESS_MIN_INTERVAL);
  }

  function cleanup() {
    if (emitProgressTimeout) clearTimeout(emitProgressTimeout);
  }

  function startBatch(taskTable, context, cb){
    var newContext = extend({}, context);
    var batch = new Batch();
    var id, task;
    for (id in taskTable) {
      task = taskTable[id];
      batch.push(fnToExecuteTask(id, task));
    }
    batch.end(function(err, resultsList){
      assert.ifError(err);
      var depErr = null;
      resultsList.forEach(function(results) {
        var err = results.error;
        depErr = depErr || err;
        if (! err) extend(newContext, results.context);
      });
      cb(depErr, newContext);
    });
    function fnToExecuteTask(id, task){
      return function(cb){
        var newContext = extend({}, context);
        if (task.exports.state === 'processing') {
          task.on('error', function(err){
            doneExecutingSingle(err, {});
          });
          task.on('end', function(results){
            doneExecutingSingle(null, results);
          });
        } else {
          executeTask();
        }
        function executeTask(){
          var deps = self.dependencies[id];
          if (deps != null) {
            startBatch(deps, newContext, doneExecutingBatch);
          } else {
            queueStartSingle(task, newContext, doneExecutingSingle);
          }
        }
        function doneExecutingBatch(err, results){
          if (err && !task.options.ignoreDependencyErrors) {
            // a dependency had an error and this task instance is not configured
            // to ignore errors. Skip the task.
            task.exports.state = 'skipped';
            doneExecutingSingle(err, {});
          } else {
            queueStartSingle(task, extend(newContext, results), doneExecutingSingle);
          }
        }
        function doneExecutingSingle(err, resultContext){
          var results = {
            error: err,
            context: extend(newContext, resultContext),
          };
          cb(null, results);
        }
      };
    }
  }
  function queueStartSingle(task, context, cb){
    if (task.cpuBound) {
      pool.queue(function(done){
        startSingle(task, context, function(err, results){
          done();
          cb(err, results);
        });
      });
    } else {
      startSingle(task, context, cb);
    }
  }
  function startSingle(task, context, cb){
    task.on('progress', function(){
      emitProgress();
    });
    task.on('update', function(){
      self.emit('update', task);
    });
    task.on('error', function(err){
      self.emit('error', err, task);
      cb(err, {});
    });
    task.on('end', function(results){
      compileHeuristics(task);
      cb(null, results);
    });
    task.start(context);
    emitProgress();
  }
  function compileHeuristics(task){
    // this function saves 2 things:
    // 1. The average ratio of the task duration to the `amountTotal`
    //    reported by the task's `progress` event.
    // 2. The average ratio of the same `amountTotal` to the average
    //    dependency `amountTotal`.
    var ratio = ratioAtTask(task);
    var amountTotal = task.exports.amountTotal;
    var duration = taskDuration(task);
    assert.ok(amountTotal > 0);
    var timeRatio = duration / amountTotal;
    if (ratio.time != null) {
      // keep a nice smooth average
      ratio.time = ratio.time * RATIO_SMOOTHNESS + (1.0 - RATIO_SMOOTHNESS) * timeRatio;
    } else {
      // first time. just assume it will take this long every time
      ratio.time = timeRatio;
    }

    // these dependencies have all completed since we only call
    // compileHeuristics on tasks which have completed.
    var deps = self.dependencies[task.id];
    var sum, count, depId, dep, depAmountTotal, totalRatio;
    if (deps != null) {
      sum = 0;
      count = 0;
      for (depId in deps) {
        dep = deps[depId];
        sum += dep.exports.amountTotal;
        count += 1;
      }
      assert.ok(count > 0);
      depAmountTotal = sum / count;
      totalRatio = amountTotal / depAmountTotal;
      if (ratio.total != null) {
        ratio.total = ratio.total * RATIO_SMOOTHNESS + (1.0 - RATIO_SMOOTHNESS) * totalRatio;
      } else {
        ratio.total = totalRatio;
      }
    }
  }
  function totalProgress(taskGroup){
    var chain = gatherProgressInfo(taskGroup);
    var estTotalDuration = 0;
    chain.forEach(function(chainItem) {
      estTotalDuration += chainItem.estDuration
    });
    if (estTotalDuration === 0) return 1;
    var totalAmountDone = 0;
    var estDuration, portion, percent;
    chain.forEach(function(chainItem) {
      estDuration = chainItem.estDuration;
      if (estDuration === 0) return;
      portion = estDuration / estTotalDuration;
      percent = (estDuration - chainItem.timeLeft) / estDuration;
      totalAmountDone += portion * percent;
    });
    return totalAmountDone;
  }
  function gatherProgressInfo(taskGroup){
    var worst = null;
    var taskId, task, current;
    for (taskId in taskGroup) {
      task = taskGroup[taskId];
      current = {
        info: infoAtTask(task),
        task: task
      };
      if (worst == null) worst = current;
      if (current.info.timeLeft > worst.info.timeLeft) {
        worst = current;
      }
    }
    var deps = self.dependencies[worst.task.id];
    var chain = deps ? gatherProgressInfo(deps) : [];
    chain.push(worst.info);
    return chain;
  }
  function taskDuration(task){
    return (task.exports.endDate - task.exports.startDate) / 1000;
  }
  function infoAtTask(task){
    var ratio, timePassed, progress, estDuration, timeLeft, totalRatio, deps, worst, depId, dep, amountTotal, depAmtTotal, amtTotal;
    // if the task has completed, we have complete knowledge
    // of the progress state and task duration.
    if (task.exports.state === 'complete') {
      return {
        amountDone: task.exports.amountDone,
        amountTotal: task.exports.amountTotal,
        estDuration: taskDuration(task),
        timeLeft: 0
      };
    }
    // if we actually know the progress, use that.
    // use it to inform our estimated task duration
    ratio = ratioAtTask(task);
    if (task.exports.amountTotal != null) {
      if (task.exports.amountDone > 0) {
        // if we know the amount done, extrapolate based on how much time
        // has passed.
        timePassed = (new Date() - task.exports.startDate) / 1000;
        assert.ok(task.exports.amountTotal > 0);
        progress = task.exports.amountDone / task.exports.amountTotal;
        estDuration = timePassed / progress;
        timeLeft = estDuration - timePassed;
      } else if (ratio.time != null) {
        // if we know the ratio of time to amountTotal, use that to
        // guess the duration.
        timePassed = (new Date() - task.exports.startDate) / 1000;
        estDuration = ratio.time * task.exports.amountTotal;
        timeLeft = estDuration - timePassed;
      } else {
        // we don't have any knowledge. guess
        estDuration = 1;
        timeLeft = 1;
      }
      return {
        amountDone: task.exports.amountDone,
        amountTotal: task.exports.amountTotal,
        estDuration: estDuration,
        timeLeft: timeLeft
      };
    }

    // use our heuristics of how long a job takes based on its
    // dependencies to inform our amountTotal and estDuration.
    totalRatio = ratio.total
    if (totalRatio != null) {
      deps = self.dependencies[task.id];
      if (deps != null) {
        worst = null;
        for (depId in deps) {
          dep = deps[depId];
          amountTotal = infoAtTask(dep).amountTotal;
          if (worst == null) worst = amountTotal;
          if (amountTotal > worst) {
            worst = amountTotal;
          }
        }
        depAmtTotal = worst;
      } else {
        depAmtTotal = 1;
      }
      amtTotal = totalRatio * depAmtTotal;
      estDuration = ratio.time * amtTotal;
      return {
        amountDone: 0,
        amountTotal: amtTotal,
        estDuration: estDuration,
        timeLeft: estDuration
      };
    }
    // we really have no idea. make shit up. next time we'll have data
    // to go by.
    return {
      amountDone: 0,
      amountTotal: 1,
      estDuration: 1,
      timeLeft: 1
    };
  }
  function ratioAtTask(task){
    var key = self.planId + "\n" + task.name;
    return ratios[key] || (ratios[key] = {});
  }
};
