#!/usr/bin/env node
import { runRuntimeItem } from "./runner.js";

const arg = process.argv[2] ? JSON.parse(process.argv[2]) : { protocol: "v1", jobId: "cli" };
runRuntimeItem(arg)
  .then((state) => {
    console.log(JSON.stringify(state, null, 2));
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
