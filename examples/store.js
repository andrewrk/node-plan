var Task, path, makeUuid, s3, StoreTask;
Task = require('../task');
path = require('path');
makeUuid = require('node-uuid').v4;
s3 = require('s3-client');
function applyInterpolations(string, interps){
  var name, value, re;
  for (name in interps) {
    value = interps[name];
    re = new RegExp("[^\\$]\\$" + name, "g");
    string = string.replace(re, value);
  }
  return string = string.replace(/\$\$/g, '$');
}
module.exports = StoreTask = (function(superclass){
  StoreTask.displayName = 'StoreTask';
  var prototype = extend$(StoreTask, superclass).prototype, constructor = StoreTask;
  function StoreTask(){
    superclass.apply(this, arguments);
    this.exports.url = null;
  }
  prototype.start = function(){
    var client, ref$, temp_path, uploader, this$ = this;
    superclass.prototype.start.apply(this, arguments);
    client = s3.createClient({
      key: this.settings.s3_key,
      secret: this.settings.s3_secret,
      bucket: this.settings.s3_bucket
    });
    this.exports.bucket = this.settings.s3_bucket;
    temp_path = (ref$ = this.context).temp_path, delete ref$.temp_path;
    this.exports.url = applyInterpolations(this.settings.url, {
      ext: path.extname(temp_path),
      uuid: makeUuid()
    });
    this.emit('update');
    uploader = client.upload(temp_path, this.exports.url);
    uploader.on('error', function(err){
      this$.end(err);
    });
    uploader.on('progress', function(amount_done, amount_total){
      this$.exports.amount_done = amount_done;
      this$.exports.amount_total = amount_total;
      this$.emit('progress');
    });
    uploader.on('end', function(){
      this$.end();
    });
  };
  return StoreTask;
}(Task));
function extend$(sub, sup){
  function fun(){} fun.prototype = (sub.superclass = sup).prototype;
  (sub.prototype = new fun).constructor = sub;
  if (typeof sup.extended == 'function') sup.extended(sub);
  return sub;
}
