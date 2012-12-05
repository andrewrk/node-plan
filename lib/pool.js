var os = require('os');

module.exports = Pool;

function Pool() {
  // set this to limit the number of simultaneous workers
  // set to a reasonable default
  this.workerCap = os.cpus().length;
  this.workerCount = 0;
  this.queuedJobs = [];
}

Pool.prototype.queue = function(cb){
  this.queuedJobs.push(cb);
  this.flush();
};

Pool.prototype.flush = function(){
  var self = this;
  while (self.queuedJobs.length && self.workerCount < self.workerCap) {
    self.workerCount += 1;
    self.queuedJobs.shift()(onComplete);
  }
  function onComplete(){
    self.workerCount -= 1;
    self.flush();
  }
};
