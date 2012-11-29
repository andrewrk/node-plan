var Task, sox, TranscodeTask;
Task = require('../task');
sox = require('sox');
module.exports = TranscodeTask = (function(superclass){
  TranscodeTask.displayName = 'TranscodeTask';
  var prototype = extend$(TranscodeTask, superclass).prototype, constructor = TranscodeTask;
  function TranscodeTask(){
    var ref$;
    superclass.apply(this, arguments);
    this.cpu_bound = true;
    ref$ = this.info;
    ref$.src = {
      duration: null,
      bitRate: null,
      sampleRate: null,
      sampleCount: null,
      channelCount: null,
      format: null
    };
    ref$.dest = {
      duration: null,
      bitRate: null,
      sampleRate: null,
      sampleCount: null,
      channelCount: null,
      format: null
    };
  }
  prototype.start = function(){
    var dest_ext, temp_audio_file, ref$, temp_path, transcode, this$ = this;
    superclass.prototype.start.apply(this, arguments);
    dest_ext = '.' + this.settings.format.toLowerCase();
    temp_audio_file = this.context.makeTemp({
      suffix: dest_ext
    });
    temp_path = (ref$ = this.context).temp_path, delete ref$.temp_path;
    transcode = sox.transcode(temp_path, temp_audio_file, this.settings);
    transcode.on('error', function(err){
      this$.end(err);
    });
    transcode.on('progress', function(amount_done, amount_total){
      this$.info.amount_done = amount_done;
      this$.info.amount_total = amount_total;
      this$.emit('progress');
    });
    transcode.on('src', function(info){
      this$.info.src = info;
      this$.emit('update');
    });
    transcode.on('dest', function(info){
      this$.info.dest = info;
      this$.emit('update');
    });
    transcode.on('end', function(){
      this$.context.temp_path = temp_audio_file;
      this$.end();
    });
    transcode.start();
  };
  return TranscodeTask;
}(Task));
function extend$(sub, sup){
  function fun(){} fun.prototype = (sub.superclass = sup).prototype;
  (sub.prototype = new fun).constructor = sub;
  if (typeof sup.extended == 'function') sup.extended(sub);
  return sub;
}