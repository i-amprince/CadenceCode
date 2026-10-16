const { Queue, QueueEvents } = require('bullmq');
const { createRedis } = require('./redis');

const CODE_RUN_QUEUE = 'code-runs';
const RUN_TIMEOUT_MS = 60000;

let queue;
let queueEvents;

// Created on first use so worker.js can import CODE_RUN_QUEUE without opening
// producer connections it never uses.
function getQueue() {
  if (!queue) {
    queue = new Queue(CODE_RUN_QUEUE, { connection: createRedis() });
    queueEvents = new QueueEvents(CODE_RUN_QUEUE, { connection: createRedis() });
  }
  return { queue, queueEvents };
}

// The API server only enqueues the job and waits for the worker's result, so a
// slow Judge0 response never blocks the real-time socket server.
async function runCode({ code, languageId }) {
  const { queue, queueEvents } = getQueue();
  const job = await queue.add('run', { code, languageId }, {
    attempts: 2,                                   // one retry for network blips
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { age: 60 },
    removeOnFail: { age: 3600 },
  });
  return job.waitUntilFinished(queueEvents, RUN_TIMEOUT_MS);
}

module.exports = { CODE_RUN_QUEUE, runCode };
