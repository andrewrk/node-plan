# node-plan

WORK IN PROGRESS. NOT READY FOR USE.

Execute a complicated dependency graph of tasks with smooth progress events.

## Usage

### Create tasks

```js

var s3 = require('s3')
  , path = require('path');

var s3DowloadTask = {
  start: function(done) {
    var self = this;
    var client = s3.createClient({
      key: "s3 key",
      secret: "s3 secret",
      bucket: "s3 bucket"
    });
    this.info.bucket = this.settings.s3_bucket;
    this.emit('update');
    var s3_url = this.context.s3_url;
    delete this.context.s3_url;
    var ext = path.extname(s3_url);
    this.context.temp_path = this.context.makeTemp({
      suffix: ext
    });
    var downloader = client.download(s3_url, this.context.temp_path);
    downloader.on('error', done);
    downloader.on('progress', function(amount_done, amount_total){
      self.info.amount_done = amount_done;
      self.info.amount_total = amount_total;
      self.emit('progress');
    });
    downloader.on('end', done);
  },
};
```

### Execute a plan

```js
var Plan = require('planner').Plan;

var plan = new Plan();
plan.addTask(task);
plan.addDependency(task, task2);
plan.on('error', function(err) {
  console.log("error:", err);
});
plan.on('progress', function(amountDone, amountTotal) {
  console.log("progress", amountDone, amountTotal);
});
plan.on('update', function(task) {
  console.log("update", task.info);
});
plan.on('end', function() {
  console.log("done");
});
plan.start();
```

## Documentation

### Creating a Task

### Executing a Plan
