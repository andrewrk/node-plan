var Task, imagemagick, path, ThumbnailTask;
Task = require('../task');
imagemagick = require('imagemagick');
path = require('path');
module.exports = ThumbnailTask = (function(superclass){
  ThumbnailTask.displayName = 'ThumbnailTask';
  var prototype = extend$(ThumbnailTask, superclass).prototype, constructor = ThumbnailTask;
  function ThumbnailTask(){
    var ref$;
    superclass.apply(this, arguments);
    this.cpu_bound = true;
    (ref$ = this.settings).format == null && (ref$.format = 'png');
  }
  prototype.start = function(){
    var ref$, temp_path, dest_ext, temp_img_file, options, method, this$ = this;
    superclass.prototype.start.apply(this, arguments);
    temp_path = (ref$ = this.context).temp_path, delete ref$.temp_path;
    dest_ext = '.' + this.settings.format.toLowerCase();
    temp_img_file = this.context.makeTemp({
      suffix: dest_ext
    });
    options = {
      srcPath: temp_path,
      dstPath: temp_img_file,
      quality: this.settings.quality,
      format: this.settings.format,
      progressive: this.settings.progressive,
      width: this.settings.width,
      height: this.settings.height,
      strip: this.settings.strip,
      filter: this.settings.filter,
      sharpening: this.settings.sharpening,
      gravity: this.settings.gravity
    };
    method = this.settings.crop
      ? imagemagick.crop
      : imagemagick.resize;
    method(options, function(err){
      if (err) {
        this$.end(err);
      } else {
        this$.context.temp_path = temp_img_file;
        this$.end();
      }
    });
  };
  return ThumbnailTask;
}(Task));
function extend$(sub, sup){
  function fun(){} fun.prototype = (sub.superclass = sup).prototype;
  (sub.prototype = new fun).constructor = sub;
  if (typeof sup.extended == 'function') sup.extended(sub);
  return sub;
}