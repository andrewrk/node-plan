var EventEmitter, makeUuid, Task;
EventEmitter = require('events').EventEmitter;
makeUuid = require('node-uuid').v4;
module.exports = Task = (function(superclass){
  Task.displayName = 'Task';
  var prototype = extend$(Task, superclass).prototype, constructor = Task;
  function Task(settings){
    var this$ = this;
    this.settings = settings;
    this.settings == null && (this.settings = {});
    this.info = {
      start_date: null,
      end_date: null,
      state: 'queued',
      amount_done: 0,
      amount_total: null,
      type: null
    };
    this.id = makeUuid();
    this.cpu_bound = false;
    this.context = null;
    this.on('progress', function(){
      this$.emit('update');
    });
  }
  prototype.start = function(context){
    this.context = context;
    this.info.state = 'processing';
    this.info.start_date = new Date();
    this.emit('update');
  };
  prototype.end = function(err){
    var ref$;
    this.info.state = 'complete';
    this.info.end_date = new Date();
    (ref$ = this.info).amount_total == null && (ref$.amount_total = 1);
    this.info.amount_done = this.info.amount_total;
    this.emit('progress');
    if (err) {
      this.emit('error', err);
    } else {
      this.emit('end', this.context);
    }
  };
  return Task;
}(EventEmitter));
function extend$(sub, sup){
  function fun(){} fun.prototype = (sub.superclass = sup).prototype;
  (sub.prototype = new fun).constructor = sub;
  if (typeof sup.extended == 'function') sup.extended(sub);
  return sub;
}
