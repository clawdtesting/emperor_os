import { join } from 'path'

export function getAssignedJobRunnerScriptPath(workspaceRoot) {
  return join(String(workspaceRoot || ''), 'agent', 'Job-v1', 'run_assigned_job_pipeline.js')
}

export function buildAssignedJobRunner({ workspaceRoot, jobFile, jobId } = {}) {
  const scriptPath = getAssignedJobRunnerScriptPath(workspaceRoot)
  const args = [scriptPath, '--job-file', String(jobFile || '')]
  if (jobId != null && String(jobId).trim()) {
    args.push('--job-id', String(jobId).trim())
  }
  return {
    command: 'node',
    scriptPath,
    args,
  }
}
