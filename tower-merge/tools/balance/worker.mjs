// Worker thread entry: registers the tsx loader, then serves run jobs posted by jobs.ts.
import { parentPort } from 'node:worker_threads';
import { register } from 'tsx/esm/api';

register();
const { runJob } = await import('./jobs.ts');
parentPort.on('message', ({ idx, job }) => {
  try {
    parentPort.postMessage({ idx, rec: runJob(job) });
  } catch (e) {
    parentPort.postMessage({ idx, error: e instanceof Error ? e.stack ?? e.message : String(e) });
  }
});
