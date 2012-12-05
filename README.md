[![Build Status](https://secure.travis-ci.org/superjoe30/node-plan.png?branch=master)](https://travis-ci.org/superjoe30/node-plan)

# node-plan

Execute a complicated dependency graph of tasks with smooth progress events.

## Usage

### Create tasks

See `examples/`.

### Execute a plan

```js
var Plan = require('plan');
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
context = {blah: "foo"};
plan.start(context);
```

## Documentation

### Creating a Task

#### context

#### options

#### emitting update events

#### emitting progress events

#### CPU Bound Tasks

### Executing a Plan
