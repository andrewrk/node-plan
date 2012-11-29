var EventEmitter, Batch, Pool, assert, Plan;
EventEmitter = require('events').EventEmitter;
Batch = require('batch');
Pool = require('./pool');
assert = require('assert');
module.exports = Plan = (function(superclass){
  Plan.displayName = 'Plan';
  var ratios, RATIO_SMOOTHNESS, pool, prototype = extend$(Plan, superclass).prototype, constructor = Plan;
  ratios = {};
  RATIO_SMOOTHNESS = 0.4;
  pool = new Pool();
  constructor.setWorkerCap = function(count){
    pool.worker_cap = count;
  };
  function Plan(plan_id){
    this.plan_id = plan_id;
    this.task_table = {};
    this.start_tasks = {};
    this.dependencies = {};
  }
  prototype.addTask = function(task){
    this.task_table[task.id] = task;
    this.start_tasks[task.id] = task;
  };
  prototype.addDependency = function(target_task, dependency_task){
    var ref$, key$;
    delete this.start_tasks[dependency_task.id];
    this.task_table[dependency_task.id] = dependency_task;
    ((ref$ = this.dependencies)[key$ = target_task.id] || (ref$[key$] = {}))[dependency_task.id] = dependency_task;
  };
  prototype.start = function(context){
    var this$ = this;
    startBatch(this.start_tasks, context, function(err, results){
      if (err) {
        this$.emit('error', err);
      } else {
        this$.emit('end', results);
      }
    });
    function startBatch(task_table, context, cb){
      var new_context, batch, id, task;
      new_context = import$({}, context);
      batch = new Batch();
      for (id in task_table) {
        task = task_table[id];
        batch.push(fnToExecuteTask(id, task));
      }
      batch.end(function(err, results_list){
        var i$, len$, results;
        if (err) {
          cb(err);
        } else {
          for (i$ = 0, len$ = results_list.length; i$ < len$; ++i$) {
            results = results_list[i$];
            import$(new_context, results);
          }
          cb(null, new_context);
        }
      });
      function fnToExecuteTask(id, task){
        return function(cb){
          var new_context;
          new_context = import$({}, context);
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
            var deps;
            if ((deps = this$.dependencies[id]) != null) {
              startBatch(deps, new_context, doneExecutingBatch);
            } else {
              queueStartSingle(task, new_context, doneExecutingSingle);
            }
            function doneExecutingBatch(err, results){
              if (err) {
                cb(err);
              } else {
                queueStartSingle(task, import$(new_context, results), doneExecutingSingle);
              }
            }
            function doneExecutingSingle(err, results){
              if (err) {
                cb(err);
              } else {
                cb(null, import$(new_context, results));
              }
            }
          }
        };
      }
    }
    function queueStartSingle(task, context, cb){
      if (task.cpu_bound) {
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
        var percent;
        percent = totalProgress(this$.start_tasks);
        this$.emit('progress', percent, 1);
      });
      task.on('update', function(){
        this$.emit('update', task);
      });
      task.on('error', function(err){
        cb(err);
      });
      task.on('end', function(results){
        compileHeuristics(task);
        cb(null, results);
      });
      task.start(context);
    }
    function compileHeuristics(task){
      var ratio, amount_total, duration, time_ratio, deps, sum, count, dep_id, dep, dep_amount_total, total_ratio;
      ratio = ratioAtTask(task);
      amount_total = task.info.amount_total;
      duration = taskDuration(task);
      time_ratio = duration / amount_total;
      if (ratio.time != null) {
        ratio.time = ratio.time * RATIO_SMOOTHNESS + (1.0 - RATIO_SMOOTHNESS) * time_ratio;
      } else {
        ratio.time = time_ratio;
      }
      if ((deps = this$.dependencies[task.id]) != null) {
        sum = 0;
        count = 0;
        for (dep_id in deps) {
          dep = deps[dep_id];
          sum += dep.info.amount_total;
          count += 1;
        }
        dep_amount_total = sum / count;
        total_ratio = amount_total / dep_amount_total;
        if (ratio.total != null) {
          ratio.total = ratio.total * RATIO_SMOOTHNESS + (1.0 - RATIO_SMOOTHNESS) * total_ratio;
        } else {
          ratio.total = total_ratio;
        }
      }
    }
    function totalProgress(task_group){
      var chain, est_total_duration, i$, len$, est_duration, total_amount_done, ref$, amount_done, amount_total, portion;
      chain = gatherProgressInfo(task_group);
      est_total_duration = 0;
      for (i$ = 0, len$ = chain.length; i$ < len$; ++i$) {
        est_duration = chain[i$].est_duration;
        est_total_duration += est_duration;
      }
      total_amount_done = 0;
      for (i$ = 0, len$ = chain.length; i$ < len$; ++i$) {
        ref$ = chain[i$], est_duration = ref$.est_duration, amount_done = ref$.amount_done, amount_total = ref$.amount_total;
        portion = est_duration / est_total_duration;
        total_amount_done += portion * (amount_done / amount_total);
      }
      return total_amount_done;
    }
    function gatherProgressInfo(task_group){
      var worst, task_id, task, current, deps, chain;
      worst = null;
      for (task_id in task_group) {
        task = task_group[task_id];
        current = {
          info: infoAtTask(task),
          task: task
        };
        worst == null && (worst = current);
        if (current.info.time_left > worst.info.time_left) {
          worst = current;
        }
      }
      if ((deps = this$.dependencies[worst.task.id]) != null) {
        chain = gatherProgressInfo(deps);
      } else {
        chain = [];
      }
      chain.push(worst.info);
      return chain;
    }
    function taskDuration(task){
      return (task.info.end_date - task.info.start_date) / 1000;
    }
    function infoAtTask(task){
      var ratio, time_passed, progress, est_duration, time_left, total_ratio, deps, worst, dep_id, dep, amount_total, dep_amt_total, amt_total;
      if (task.state === 'complete') {
        return {
          amount_done: task.info.amount_done,
          amount_total: task.info.amount_total,
          est_duration: taskDuration(task),
          time_left: 0
        };
      }
      ratio = ratioAtTask(task);
      if (task.info.amount_total != null) {
        if (task.info.amount_done > 0) {
          time_passed = (new Date() - task.info.start_date) / 1000;
          progress = task.info.amount_done / task.info.amount_total;
          est_duration = time_passed / progress;
          time_left = est_duration - time_passed;
        } else if (ratio.time != null) {
          est_duration = ratio.time * task.info.amount_total;
          time_left = est_duration;
        } else {
          est_duration = 1;
          time_left = 1;
        }
        return {
          amount_done: task.info.amount_done,
          amount_total: task.info.amount_total,
          est_duration: est_duration,
          time_left: time_left
        };
      }
      if ((total_ratio = ratio.total) != null) {
        if ((deps = this$.dependencies[task.id]) != null) {
          worst = null;
          for (dep_id in deps) {
            dep = deps[dep_id];
            amount_total = infoAtTask(dep).amount_total;
            worst == null && (worst = amount_total);
            if (amount_total > worst) {
              worst = amount_total;
            }
          }
          dep_amt_total = worst;
        } else {
          dep_amt_total = 1;
        }
        amt_total = total_ratio * dep_amt_total;
        est_duration = ratio.time * amt_total;
        return {
          amount_done: 0,
          amount_total: amt_total,
          est_duration: est_duration,
          time_left: est_duration
        };
      }
      return {
        amount_done: 0,
        amount_total: 1,
        est_duration: 1,
        time_left: 1
      };
    }
    function ratioAtTask(task){
      var key;
      key = this$.plan_id + "\n" + task.name;
      return ratios[key] || (ratios[key] = {});
    }
  };
  return Plan;
}(EventEmitter));
function extend$(sub, sup){
  function fun(){} fun.prototype = (sub.superclass = sup).prototype;
  (sub.prototype = new fun).constructor = sub;
  if (typeof sup.extended == 'function') sup.extended(sub);
  return sub;
}
function import$(obj, src){
  var own = {}.hasOwnProperty;
  for (var key in src) if (own.call(src, key)) obj[key] = src[key];
  return obj;
}