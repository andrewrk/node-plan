var Plan = require('../')
  , assert = require('assert');

var SmoothTask = {
  start: function(done) {
    var self = this;
    self.exports.amountTotal = 30;
    var interval = setInterval(function() {
      self.exports.amountDone += 1;
      if (self.exports.amountDone === 30) {
        clearInterval(interval);
        self.exports.complete = true;
        done();
      } else {
        self.emit('progress');
      }
    }, 10);
  }
};

var DelayTask = {
  start: function(done) {
    var self = this;
    setTimeout(function() {
      self.exports.amountTotal = self.options.timeout;
      self.emit('progress');
      setTimeout(function() {
        done();
      }, self.options.timeout);
    }, 10);
  }
};

var FastTask = {
  exports: {
    foo: {
      bar: "abcd"
    },
    derp: true,
    amountTotal: 2,
  },
  start: function(done) {
    var self = this;
    self.exports.derp = "hi";
    self.emit('update');
    setTimeout(function() {
      self.amountDone = 1;
      self.emit('progress');
      setTimeout(function() {
        self.exports.complete = true;
        done();
      });
    }, 10);
  },
};

var SyncTask = {
  start: function(done) {
    this.context.foo = "foo2";
    this.context.tails = this.options.tails;
    this.exports.sonic = this.options.sonic || "zebra";
    done();
  }
};

var ErrorTask = {
  exports: {
    amountTotal: 20
  },
  start: function(done) {
    var self = this;
    var interval = setInterval(function() {
      self.exports.amountDone += 1;
      self.emit('progress');
      if (self.exports.amountDone === 10) {
        clearInterval(interval);
        var err = new Error("ErrorTask - this error is expected");
        err.isErrorTask = true;
        done(err);
      }
    }, 10);
  }
};

var SetNumberTask = {
  start: function(done) {
    this.context[this.options.field] = this.options.value;
    done();
  }
};

var SumTask = {
  start: function(done) {
    this.context.result = this.context.a + this.context.b;
    done();
  }
};

describe("plan", function() {
  it("a single task", function(done) {
    var plan = new Plan("aoeuaoeu");
    var task = Plan.createTask(SmoothTask);
    var info = task.exports;
    plan.addTask(task);
    plan.on('error', done);
    var progress = 0;
    var progressEventCount = 0;
    plan.on('progress', function(amountDone, amountTotal) {
      var newProgress = amountDone / amountTotal;
      assert(newProgress >= progress, "old progress: " + progress + ", new progress: " + newProgress);
      progressEventCount += 1;
      progress = newProgress;
    });
    var updateEventCount = 0;
    plan.on('update', function(updatedTask) {
      updateEventCount += 1;
      assert.strictEqual(updatedTask, task);
      assert.strictEqual(updatedTask.exports, info);
    });
    plan.on('end', function() {
      assert(progressEventCount >= 3);
      assert(updateEventCount >= 2);
      done();
    });
    plan.start();
  });
  it("has access to task options, context, and exports", function(done) {
    var plan = new Plan();
    var task = Plan.createTask(SyncTask, "sync", {sonic: "rock", tails: "ice"});
    var info = task.exports;
    plan.addTask(task);
    plan.on('error', done);
    var progress = 0;
    var progressEventCount = 0;
    plan.on('progress', function(amountDone, amountTotal) {
      var newProgress = amountDone / amountTotal;
      assert(newProgress >= progress, "old progress: " + progress + ", new progress: " + newProgress + ", amountDone: " + amountDone + ", amountTotal: " + amountTotal);
      progressEventCount += 1;
      progress = newProgress;
    });
    var updateEventCount = 0;
    plan.on('update', function(updatedTask) {
      updateEventCount += 1;
      assert.strictEqual(updatedTask, task);
      assert.strictEqual(updatedTask.exports, info);
    });
    plan.on('end', function(results) {
      assert.strictEqual(results.foo, "foo2");
      assert.strictEqual(results.tails, "ice");
      assert.strictEqual(info.sonic, "rock");
      assert.strictEqual(info.amountDone, 1);
      assert.strictEqual(info.amountTotal, 1);
      assert.strictEqual(progressEventCount, 1)
      assert.strictEqual(updateEventCount, 2);
      done();
    });
    plan.start({foo: "hi"});
  });
  it("emits errors", function(done) {
    var plan = new Plan();
    var errorTask = Plan.createTask(ErrorTask);
    var fastTask = Plan.createTask(FastTask);
    var smoothTask = Plan.createTask(SmoothTask);
    plan.addTask(errorTask);
    plan.addDependency(errorTask, fastTask);
    plan.addDependency(fastTask, smoothTask);
    plan.on('error', function(err) {
      assert.ok(err.isErrorTask);
      assert.strictEqual(fastTask.exports.derp, "hi");
      assert.strictEqual(fastTask.exports.complete, true);
      assert.strictEqual(smoothTask.exports.complete, true);
      done();
    });
    plan.on('end', function() {
      assert.fail("not supposed to reach end");
    });
    plan.start();
  });
  it("passes context sequentially", function(done) {
    var plan = new Plan();
    var syncTask = Plan.createTask(SyncTask);
    var fastTask = Plan.createTask(FastTask);
    var smoothTask = Plan.createTask(SmoothTask);
    plan.addTask(syncTask);
    plan.addDependency(syncTask, fastTask);
    plan.addDependency(fastTask, smoothTask);
    plan.on('error', done);
    plan.on('end', function(results) {
      assert.strictEqual(results.eggman, "no");
      done();
    });
    plan.start({eggman: "no"});
  });
  it("a task with 2 dependencies", function(done) {
    var plan = new Plan();
    var setTask1 = Plan.createTask(SetNumberTask, "set1", {field: "a", value: 99});
    var setTask2 = Plan.createTask(SetNumberTask, "set2", {field: "b", value: 11});
    var sumTask = Plan.createTask(SumTask);
    plan.addTask(sumTask);
    plan.addDependency(sumTask, setTask1);
    plan.addDependency(sumTask, setTask2);
    plan.on('end', function(results) {
      assert.strictEqual(results.result, 110);
      done();
    });
    plan.start();
  });
  it("has smooth progress on 2nd try with tasks that do not emit progress", function(done) {
    this.timeout(12000);
    var plan = createPlan();
    plan.on('error', done);
    var done1000 = false;
    var done3000 = false;
    var expectedTimePassed = 4033;
    var debugOutput = "";
    var minDiff = 1, maxDiff = 0, sumDiff = 0;
    function round(n) {
      return Math.round(n * 100) / 100;
    }
    var firstSumDiff;
    plan.on('progress', function(amountDone, amountTotal) {
      if (! done1000 && plan._task1000.exports.amountDone === 1000) {
        done1000 = true;
        debugOutput += "done 1000\n"
      }
      if (! done3000 && plan._task3000.exports.amountDone === 3000) {
        done3000 = true;
        debugOutput += "done 3000\n"
      }
      var timePassed = (new Date()).getTime() - plan._task1000.exports.startDate.getTime();
      var expectedPercent = timePassed / expectedTimePassed;
      var diff = Math.abs(expectedPercent - amountDone);
      if (diff < minDiff) minDiff = diff;
      if (diff > maxDiff) maxDiff = diff;
      sumDiff += diff;
      debugOutput += "expected " + round(expectedPercent) +
        " actual " + round(amountDone) +
        " diff " + round(diff) +
        "\n";
    });
    plan.on('end', function() {
      expectedTimePassed = (new Date()).getTime() - plan._task1000.exports.startDate.getTime();
      plan = createPlan();
      plan.on('error', done);
      var done1000 = false;
      var done3000 = false;
      plan.on('progress', function(amountDone, amountTotal) {
        if (! done1000 && plan._task1000.exports.amountDone === 1000) {
          done1000 = true;
          debugOutput += "done 1000\n";
        }
        if (! done3000 && plan._task3000.exports.amountDone === 3000) {
          done3000 = true;
          debugOutput += "done 3000\n";
        }
        var timePassed = (new Date()).getTime() - plan._task1000.exports.startDate.getTime();
        var expectedPercent = timePassed / expectedTimePassed;
        var diff = Math.abs(expectedPercent - amountDone);
        if (diff < minDiff) minDiff = diff;
        if (diff > maxDiff) maxDiff = diff;
        sumDiff += diff;
        debugOutput += "expected " + round(expectedPercent) +
          " actual " + round(amountDone) +
          " diff " + round(diff) +
          "\n";
      });
      plan.on('end', function() {
        debugOutput += "min diff " + round(minDiff) +
          " max diff " + round(maxDiff) +
          " sum diff " + round(sumDiff) +
          "\n";
        if (sumDiff > firstSumDiff) {
          console.log(debugOutput);
          throw new Error("2nd time was less accurate than first");
        }
        console.log(debugOutput);
        done();
      });
      firstSumDiff = sumDiff;
      debugOutput += " min diff " + round(minDiff) +
        " max diff " + round(maxDiff) +
        " sum diff " + round(sumDiff) +
        "\n";
      minDiff = 1;
      maxDiff = 0;
      sumDiff = 0;
      debugOutput += "\nnew plan\n";
      plan.start();
    });
    plan.start();
    function createPlan() {
      var plan = new Plan("test-smooth-progress");
      var task1000 = Plan.createTask(DelayTask, "delay1000", {timeout: 1000});
      var task3000 = Plan.createTask(DelayTask, "delay3000", {timeout: 3000});
      var fastTask = Plan.createTask(FastTask);
      plan.addTask(fastTask);
      plan.addDependency(fastTask, task3000);
      plan.addDependency(task3000, task1000);
      plan._task1000 = task1000;
      plan._task3000 = task3000;
      plan._fastTask = fastTask;
      return plan;
    }
  });
  it("limits cpu bound tasks to one cpu core", function(done) {
    assert.fail();
  });
});
