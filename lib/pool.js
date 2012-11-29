var os = require('os');

module.exports = Pool;

function Pool() {
  this.worker_cap = os.cpus().length;
  this.worker_count = 0;
  this.queued_jobs = [];
}

Pool.prototype.queue = function(cb){
  this.queued_jobs.push(cb);
  this.flush();
};

Pool.prototype.flush = function(){
  var self = this;
  while (self.queued_jobs.length && self.worker_count < self.worker_cap) {
    self.worker_count += 1;
    self.queued_jobs.shift()(onComplete);
  }
  function onComplete(){
    self.worker_count -= 1;
    self.flush();
  }
};
