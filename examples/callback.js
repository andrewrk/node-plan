var Task, http, https, parseUrl, CallbackTask;
Task = require('../task');
http = require('http');
https = require('https');
parseUrl = require('url').parse;
module.exports = CallbackTask = (function(superclass){
  CallbackTask.displayName = 'CallbackTask';
  var prototype = extend$(CallbackTask, superclass).prototype, constructor = CallbackTask;
  function CallbackTask(){
    superclass.apply(this, arguments);
  }
  prototype.start = function(){
    var ref$, data, opts, http_module, req, this$ = this;
    superclass.prototype.start.apply(this, arguments);
    this.exports.url = (ref$ = this.context).callback_url, delete ref$.callback_url;
    if (this.exports.url == null) {
      this.end(new Error("no callback url in context"));
      return;
    }
    this.emit('update');
    data = JSON.stringify(this.context.job);
    opts = (ref$ = parseUrl(this.exports.url), ref$.method = 'POST', ref$.agent = false, ref$.headers = {
      'content-length': data.length,
      'content-type': 'application/json'
    }, ref$);
    http_module = opts.protocol === 'https:' ? https : http;
    req = http_module.request(opts, function(resp){
      resp.on('error', function(err){
        var my_err;
        my_err = new Error("error calling callback at " + this$.exports.url + ": " + err.stack);
        my_err.internal = err;
        this$.end(my_err);
      });
      resp.on('end', function(){
        var my_err;
        if (resp.statusCode === 200) {
          this$.end();
        } else {
          my_err = new Error("callback returned http code " + resp.statusCode + " from " + this$.exports.url);
          my_err.internal = err;
          this$.end(my_err);
        }
      });
    });
    req.on('error', function(err){
      var my_err;
      my_err = new Error("unable to call callback at " + this$.exports.url + ": " + err.stack);
      my_err.internal = err;
      this$.end(my_err);
    });
    req.write(data);
    req.end();
  };
  return CallbackTask;
}(Task));
function extend$(sub, sup){
  function fun(){} fun.prototype = (sub.superclass = sup).prototype;
  (sub.prototype = new fun).constructor = sub;
  if (typeof sup.extended == 'function') sup.extended(sub);
  return sub;
}
