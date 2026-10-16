require('dotenv').config({ path: __dirname + '/.env' });
const { Worker } = require('bullmq');
const { createRedis } = require('./redis');
const { CODE_RUN_QUEUE } = require('./codeRunQueue');
const { runOnJudge0 } = require('./judge0');

// Runs as its own process (`npm run worker`), so code execution can be scaled
// and restarted independently of the socket server.
const worker = new Worker(CODE_RUN_QUEUE, (job) => runOnJudge0(job.data), {
  connection: createRedis(),
  concurrency: 5,                         // at most 5 Judge0 runs at once per worker
  limiter: { max: 20, duration: 1000 },   // and at most 20 jobs per second overall
});

worker.on('ready', () => console.log('Code-run worker ready'));
worker.on('failed', (job, err) => console.error(`Code run ${job?.id} failed:`, err.message));
