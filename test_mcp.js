import { listJobs, getJob } from './agent/mcp.js';

async function test() {
  try {
    console.log('Calling listJobs...');
    const jobs = await listJobs();
    console.log('listJobs result:', JSON.stringify(jobs, null, 2));
    if (jobs && jobs.length > 0) {
      console.log('First job ID:', jobs[0].jobId);
      const job = await getJob(jobs[0].jobId);
      console.log('getJob result for first job:', JSON.stringify(job, null, 2));
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

test();