var Plan = require('../')
  , assert = require('assert');

var smoothTask = {
  start: function(done) {
    var self = this;
    self.exports.amountTotal = 30;
    var interval = setInterval(function() {
      self.exports.amountDone += 1;
      if (self.exports.amountDone === 30) {
        clearInterval(interval);
        done();
      } else {
        self.emit('progress');
      }
    }, 10);
  }
};

var fastTask = {
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
        done();
      });
    }, 10);
  },
};

var errorTask = {
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
        done(new Error("errorTask - this error is expected"));
      }
    }, 10);
  }
};

describe("plan", function() {
  it("a plan which is a single task", function(done) {
    var plan = new Plan();
    var task = Plan.createTask(smoothTask);
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
  it("has access to task settings", function(done) {
    assert.fail();
  });
  it("error task should return an error", function(done) {
    assert.fail();
  });
  it("running a single task", function(done) {
    // settings should be observed
    assert.fail();
  });
  it("running 2 sequential tasks", function(done) {
    // context should be passed
    assert.fail();
  });
  it("a task with 2 dependencies", function(done) {
    // both dependencies should be complete
    assert.fail();
  });
  it("smooth progress on 2nd try with tasks that do not emit progress", function(done) {
    assert.fail();
  });
  it("emits progress even when no tasks are emitting progress", function(done) {
    assert.fail();
  });
  it("heuristics take plan id into account", function(done) {
    assert.fail();
  });
  it("limits cpu_bound tasks to 1 per processor core", function(done) {
    assert.fail();
  });
});
