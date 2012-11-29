var Task, waveform, WaveformTask;
Task = require('../task');
waveform = require('waveform');
module.exports = WaveformTask = (function(superclass){
  WaveformTask.displayName = 'WaveformTask';
  var prototype = extend$(WaveformTask, superclass).prototype, constructor = WaveformTask;
  function WaveformTask(){
    superclass.apply(this, arguments);
    this.cpu_bound = true;
  }
  prototype.start = function(){
    var temp_png_file, waveform_settings, ref$, temp_path, this$ = this;
    superclass.prototype.start.apply(this, arguments);
    temp_png_file = this.context.makeTemp({
      suffix: '.png'
    });
    waveform_settings = {
      width: this.settings.width,
      height: this.settings.height,
      'color-bg': this.settings.colorBg,
      'color-center': this.settings.colorCenter,
      'color-outer': this.settings.colorOuter
    };
    temp_path = (ref$ = this.context).temp_path, delete ref$.temp_path;
    waveform(temp_path, temp_png_file, waveform_settings, function(err){
      if (err) {
        this$.end(err);
      } else {
        this$.context.temp_path = temp_png_file;
        this$.end();
      }
    });
  };
  return WaveformTask;
}(Task));
function extend$(sub, sup){
  function fun(){} fun.prototype = (sub.superclass = sup).prototype;
  (sub.prototype = new fun).constructor = sub;
  if (typeof sup.extended == 'function') sup.extended(sub);
  return sub;
}