var EventEmitter = require('events').EventEmitter
  , Batch = require('batch')
  , assert = require('assert')
  , util = require('util')
  , makeUuid = require('node-uuid').v4
  , Pool = require('./pool')
  , Task = require('./task')

module.exports = Plan;

var ratios = {};
var RATIO_SMOOTHNESS = 0.4;
var PROGRESS_INTERVAL = 1000;
var pool = new Pool();

function Plan(planId) {
  EventEmitter.call(this);

  this.planId = planId || makeUuid();
  this.taskTable = {};
  this.startTasks = {};
  this.dependencies = {};
}

util.inherits(Plan, EventEmitter);

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
    if (err) {
      self.emit('error', err);
    } else {
      self.emit('end', results);
    }
  });

  var emitProgressTimeout = null;
  function emitProgress() {
    var percent = totalProgress(self.startTasks);
    self.emit('progress', percent, 1);

    if (emitProgressTimeout) clearTimeout(emitProgressTimeout);
    emitProgressTimeout = setTimeout(emitProgress, PROGRESS_INTERVAL);
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
      if (err) {
        cb(err);
      } else {
        resultsList.forEach(function(results) {
          extend(newContext, results);
        });
        cb(null, newContext);
      }
    });
    function fnToExecuteTask(id, task){
      return function(cb){
        var newContext = extend({}, context);
        if (task.state === 'started') {
          task.on('error', function(err){
            return cb(err);
          });
          task.on('end', function(results){
            return doneExecutingSingle(null, results);
          });
        } else {
          executeTask(cb);
        }
        function executeTask(cb){
          var deps = self.dependencies[id];
          if (deps != null) {
            startBatch(deps, newContext, doneExecutingBatch);
          } else {
            queueStartSingle(task, newContext, doneExecutingSingle);
          }
          function doneExecutingBatch(err, results){
            if (err) {
              cb(err);
            } else {
              queueStartSingle(task, extend(newContext, results), doneExecutingSingle);
            }
          }
          function doneExecutingSingle(err, results){
            if (err) {
              cb(err);
            } else {
              cb(null, extend(newContext, results));
            }
          }
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
      cb(err);
    });
    task.on('end', function(results){
      compileHeuristics(task);
      cb(null, results);
    });
    task.start(context);
    emitProgress();
  }
  function compileHeuristics(task){
    var ratio = ratioAtTask(task);
    var amountTotal = task.exports.amountTotal;
    var duration = taskDuration(task);
    var timeRatio = duration / amountTotal;
    if (ratio.time != null) {
      ratio.time = ratio.time * RATIO_SMOOTHNESS + (1.0 - RATIO_SMOOTHNESS) * timeRatio;
    } else {
      ratio.time = timeRatio;
    }
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
    var estDuration, amountDone, amountTotal, portion;
    chain.forEach(function(chainItem) {
      estDuration = chainItem.estDuration;
      amountDone = chainItem.amountDone;
      amountTotal = chainItem.amountTotal;
      portion = estDuration / estTotalDuration;
      totalAmountDone += portion * (amountDone / amountTotal);
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
    if (task.state === 'complete') {
      return {
        amountDone: task.exports.amountDone,
        amountTotal: task.exports.amountTotal,
        estDuration: taskDuration(task),
        timeLeft: 0
      };
    }
    ratio = ratioAtTask(task);
    if (task.exports.amountTotal != null) {
      if (task.exports.amountDone > 0) {
        timePassed = (new Date() - task.exports.startDate) / 1000;
        progress = task.exports.amountDone / task.exports.amountTotal;
        estDuration = timePassed / progress;
        timeLeft = estDuration - timePassed;
      } else if (ratio.time != null) {
        estDuration = ratio.time * task.exports.amountTotal;
        timeLeft = estDuration;
      } else {
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

var own = {}.hasOwnProperty;
function extend(obj, src){
  for (var key in src) {
    if (own.call(src, key)) obj[key] = src[key];
  }
  return obj;
}
