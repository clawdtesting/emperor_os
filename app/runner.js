import { routeProtocol } from "../runtime/engine/protocol-router.js";
import { runPipeline } from "../runtime/engine/pipeline-runner.js";
import { createStageContext } from "../runtime/engine/stage-context.js";
import { v1Pipeline } from "../protocols/v1/pipeline.js";
import { primePipeline } from "../protocols/prime/pipeline.js";

export async function runRuntimeItem(input) {
  const { protocol } = routeProtocol(input, { v1: v1Pipeline, prime: primePipeline });
  const id = String(input.jobId ?? input.procurementId ?? input.id ?? "runtime");
  const context = createStageContext({
    protocol,
    id,
    stateDir: input.stateDir,
    artifactRoot: input.artifactRoot
  });

  const pipeline = protocol === "prime" ? primePipeline : v1Pipeline;
  const initialState = protocol === "prime"
    ? { id, procurementId: id, status: input.initialStatus ?? "DISCOVERED" }
    : { id, jobId: id, status: input.initialStatus ?? "DISCOVERED" };

  return runPipeline({ context, pipeline, input: { ...input, initialState } });
}
