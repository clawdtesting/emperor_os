import test from 'node:test'
import assert from 'node:assert/strict'

import { buildAssignedJobRunner } from '../../../lib/intake-runner.js'

test('buildAssignedJobRunner uses the plain Node script instead of lobster CLI', () => {
  const result = buildAssignedJobRunner({
    workspaceRoot: '/home/emperor/workspace/emperor_os',
    jobFile: '/tmp/intake-job-77.json',
    jobId: '77',
  })

  assert.equal(result.command, 'node')
  assert.match(result.scriptPath, /agent\/Job-v1\/run_assigned_job_pipeline\.js$/)
  assert.deepEqual(result.args, [
    result.scriptPath,
    '--job-file',
    '/tmp/intake-job-77.json',
    '--job-id',
    '77',
  ])
})
