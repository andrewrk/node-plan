var EventEmitter = require('events').EventEmitter
  , makeUuid = require('node-uuid').v4
  , util = require('util')

module.exports = Task;

function Task(settings) {
  EventEmitter.call(this);

  var self = this;
  self.settings = settings || {};
  self.info = {
    startDate: null,
    endDate: null,
    state: 'queued',
    amountDone: 0,
    amountTotal: null,
    type: null
  };
  self.id = makeUuid();
  self.cpuBound = false;
  self.context = null;
  self.on('progress', function(){
    self.emit('update');
  });
}

util.inherits(Task, EventEmitter);


Task.prototype.start = function(context){
  this.context = context;
  this.info.state = 'processing';
  this.info.startDate = new Date();
  this.emit('update');
};

Task.prototype.end = function(err){
  this.info.state = 'complete';
  this.info.endDate = new Date();
  if (this.info.amountTotal == null) this.info.amountTotal = 1;
  this.info.amountDone = this.info.amountTotal;
  this.emit('progress');
  if (err) {
    this.emit('error', err);
  } else {
    this.emit('end', this.context);
  }
};
