# V1 test pipelines

These pipelines are for local/dry-run validation of AGIJobManager v1 processing using
`AGIJobManager-v1-test-job.md` as the input spec.

## Runner

```bash
node agent/Job-v1/run_test_job_pipeline.js --job-id v1_990001 --job-md AGIJobManager-v1-test-job.md
```

Add `--skip-submit` to stop after `validate`.

## Expected state

- Seeds `agent/state/jobs/<job_id>.json` as `assigned`
- Runs `execute` -> `validate` -> `submit`
- Produces unsigned completion package only (no on-chain broadcast)
