[![Build Status](https://secure.travis-ci.org/superjoe30/node-plan.png?branch=master)](https://travis-ci.org/superjoe30/node-plan)

# node-plan

Execute a complicated dependency graph of tasks with smooth progress events.

## Usage

### Create tasks

Here are some examples:

 * [waveform](https://github.com/superjoe30/node-plan-waveform)
 * [callback](https://github.com/superjoe30/node-plan-callback)
 * [s3-upload](https://github.com/superjoe30/node-plan-s3-upload)
 * [s3-download](https://github.com/superjoe30/node-plan-s3-download)
 * [thumbnail](https://github.com/superjoe30/node-plan-thumbnail)
 * [transcode](https://github.com/superjoe30/node-plan-transcode)

### Execute a plan

In this example, we will download a song from s3, generate a waveform image
and preview audio, and upload each generated thing to s3, all the while
reporting smooth and accurate processing progress to the end user.

```js
var Plan = require('plan')
  , WaveformTask = require('plan-waveform')
  , TranscodeTask = require('plan-transcode')
  , UploadS3Task = require('plan-s3-upload')
  , DownloadS3Task = require('plan-s3-download')

var downloadTask = Plan.createTask(DownloadS3Task, "download", {
  s3Key: '...',
  s3Bucket: '...',
  s3Secret: '...',
})
var waveformTask = Plan.createTask(WaveformTask, "waveform", {
  width: 1000,
  height: 200,
});
var previewTask = Plan.createTask(TranscodeTask, "preview", {
  format: 'mp3'
});
var uploadWaveformTask = Plan.createTask(UploadS3Task, "upload-waveform", {
  url: "/{uuid}/waveform{ext}"
  s3Key: '...',
  s3Bucket: '...',
  s3Secret: '...',
})
var uploadPreviewTask = Plan.createTask(UploadS3Task, "upload-preview", {
  s3Key: '...',
  s3Bucket: '...',
  s3Secret: '...',
})

// planId is used to index progress statistics. Same with the 2nd parameter
// to `Plan.createTask` above. Next time we run the same planId, node-plan
// uses the gathered stats to inform the progress events, so that they will
// be much more accurate and smooth.
var planId = "process-audio";

var plan = new Plan(planId);
plan.addTask(uploadPreviewTask);
plan.addDependency(uploadPreviewTask, previewTask);
plan.addDependency(previewTask, downloadTask);
plan.addTask(uploadWaveformTask);
plan.addDependency(uploadWaveformTask, waveformTask);
plan.addDependency(waveformTask, downloadTask);
plan.on('error', function(err, task) {
  console.log("task", task.name, "error", err);
});
plan.on('progress', function(amountDone, amountTotal) {
  console.log("progress", amountDone, amountTotal);
});
plan.on('update', function(task) {
  console.log("update", task.exports);
});
plan.on('end', function(context) {
  console.log("done", context);
});
var context = {
  s3Url: '/the/file/to/download',
  makeTemp: require('temp').path
};
plan.start(context);
```

## Documentation

### Creating a Task Definition

```js
var TaskDefinition = {};
```

#### start

```js
TaskDefinition.start = function(done) {
  ...
};
```

`start` is your main entry point. When you are finished processing, call 
`done`. In this scope, `this` points to the task instance.

If your task encounters an error, call done with the error object as
the first parameter.

#### context

`context` acts as your input as well as your output. Sometimes it makes
sense to delete the parameter that you are using; sometimes it does not.

Access `context` via `this.context` in the `start` function.

#### exports

`exports` is output that is tied to the task instance and is not passed to
the next task in the dependency graph.

There are some special fields on `exports` that you should be wary of:

Fields you should write to:

 * `exports.amountTotal` - as soon as you find out how long executing this
   task is going to take, set `amountTotal`. If the task is unable to emit
   progress, node-plan will guess based on previous statistics.
 * `exports.amountDone` - this number will change based on progress whereas
   `amountTotal` should not.

Whenever you update `amountDone` or `amountTotal`, you should emit a
`progress` event: `this.emit('progress')`. Don't worry about emitting
an `update` event for this case.

Fields you should not write to:

 * `exports.startDate` - the date the task instance started
 * `exports.endDate` - the date the task instance completed
 * `exports.state` - one of ['queued', 'skipped', 'processing', 'complete']
   * `queued` - this task has not yet been started
   * `skipped` - this task has been skipped, because one or more of its
     dependencies emitted an error, and `ignoreDependencyErrors` is not 
     set to `true`.
   * `processing` - this task is currently in progress
   * `complete` - this task has completed, possibly unsuccessfully.

You are free to add as many other `exports` fields as you wish.

Whenever you change something in `exports`, you should emit a `update`
event: `this.emit('update')`.

Access `exports` via `this.exports` in the `start` function.

#### options

`options` are per-task-instance configuration values. It is the third
parameter of `Plan.createTask(definition, name, options)`.

Access `options` via `this.options` in the `start` function.

#### CPU Bound Tasks

If your task spawns a CPU-intensive process and waits for it to complete,
you should mark your task as `cpuBound`:

```js
TaskDefinition.cpuBound = true;
```

node-plan pools all `cpuBound` tasks, defaulting to a worker count equal
to the number of CPU cores on your machine.

### Executing a Plan

#### new Plan(planId)

`planId` is used for the progress heuristics. when you're building a
similar plan, use the same `planId` and progress events will use
past statistics for accuracy and smoothness.

#### Plan.setWorkerCap(count)

Set this to limit the number of simultaneous CPU-bound tasks.

#### Plan.createTask(definition, name, options)

 * `definition` - task definition described above
 * `name` - a string, used to store statistics data. If you're doing a similar
   task, use the same name.
 * `options` - an object which is passed to the task instance to configure it.
   In addition to the options which the task definition recognizes, all tasks
   have these additional built-in options:
   * `ignoreDependencyErrors` - if set to true, the task will execute even if
     one or more of its dependencies did not suceed. default false.

#### Plan.prototype.addTask(task)

This adds a root node to the dependency graph. If you imagine a tree, where
the plan instance itself is the root node, `addTask` adds a task to the root node.

#### Plan.prototype.addDependency(targetTask, dependencyTask)

This is how you specify dependencies. `dependencyTask` becomes a leaf node of
`targetTask`.

#### Plan.prototype.start(context)

Executes the plan. `context` is cloned and passed to all leaf nodes. Task
instances modify `context` and pass a clone to the next task in the tree.

#### Plan 'end' event (context)

The plan has completed executing successfully. `context` is a merged result
object of the tasks that were added with `addTask`.

#### Plan 'error' event (err)

One or more tasks returned an error. `err` is the error object.

#### Plan 'progress' event (amountDone, amountTotal)

Tells you how far along the execution of the plan is.

#### Plan 'update' event

Occurs when a task instance's `exports` have updated.
