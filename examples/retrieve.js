var Task, s3, path, RetrieveTask;
Task = require('../task');
s3 = require('s3-client');
path = require('path');
module.exports = RetrieveTask = (function(superclass){
  RetrieveTask.displayName = 'RetrieveTask';
  var prototype = extend$(RetrieveTask, superclass).prototype, constructor = RetrieveTask;
  function RetrieveTask(){
    superclass.apply(this, arguments);
  }
  prototype.start = function(){
    var client, ref$, s3_url, ext, downloader, this$ = this;
    superclass.prototype.start.apply(this, arguments);
    client = s3.createClient({
      key: this.settings.s3_key,
      secret: this.settings.s3_secret,
      bucket: this.settings.s3_bucket
    });
    this.exports.bucket = this.settings.s3_bucket;
    this.emit('update');
    s3_url = (ref$ = this.context).s3_url, delete ref$.s3_url;
    ext = path.extname(s3_url);
    this.context.temp_path = this.context.makeTemp({
      suffix: ext
    });
    downloader = client.download(s3_url, this.context.temp_path);
    downloader.on('error', function(err){
      this$.end(err);
    });
    downloader.on('progress', function(amount_done, amount_total){
      this$.exports.amount_done = amount_done;
      this$.exports.amount_total = amount_total;
      this$.emit('progress');
    });
    downloader.on('end', function(){
      this$.end();
    });
  };
  return RetrieveTask;
}(Task));
function extend$(sub, sup){
  function fun(){} fun.prototype = (sub.superclass = sup).prototype;
  (sub.prototype = new fun).constructor = sub;
  if (typeof sup.extended == 'function') sup.extended(sub);
  return sub;
}
