var EventEmitter = require('events').EventEmitter
  , makeUuid = require('node-uuid').v4
  , util = require('util')

module.exports = Task;

function Task(taskDefinition, settings) {
  var self = this;

  EventEmitter.call(self);

  self.taskDefinition = taskDefinition;
  self.settings = settings || {};
  self.cpuBound = !!taskDefinition.cpuBound;
  self.id = makeUuid();
  self.context = null;

  self.exports = taskDefinition.exports || {};
  self.exports.startDate = null;
  self.exports.endDate = null;
  self.exports.state = 'queued';
  self.exports.amountDone = 0;
  self.exports.amountTotal = null;

  self.on('progress', function(){
    self.emit('update');
  });
}

util.inherits(Task, EventEmitter);

Task.prototype.start = function(context){
  var self = this;

  self.context = context;
  self.exports.state = 'processing';
  self.exports.startDate = new Date();
  self.emit('update');
  self.taskDefinition.start.call(self, end);

  function end(err) {
    self.exports.state = 'complete';
    self.exports.endDate = new Date();
    if (self.exports.amountTotal == null) self.exports.amountTotal = 1;
    self.exports.amountDone = self.exports.amountTotal;
    self.emit('progress');
    if (err) {
      self.emit('error', err);
    } else {
      self.emit('end', self.context);
    }
  }
};
