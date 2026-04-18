import { routeProtocol } from "../runtime/engine/protocol-router.js";
import { runPipeline } from "../runtime/engine/pipeline-runner.js";
import { createStageContext } from "../runtime/engine/stage-context.js";
import { v1Pipeline } from "../protocols/v1/pipeline.js";
import { v2Pipeline } from "../protocols/v2/pipeline.js";
import { primePipeline } from "../protocols/prime/pipeline.js";

const PIPELINES = { v1: v1Pipeline, v2: v2Pipeline, prime: primePipeline };

export async function runRuntimeItem(input) {
  const { protocol } = routeProtocol(input, PIPELINES);
  const id = String(input.jobId ?? input.procurementId ?? input.id ?? "runtime");
  const context = createStageContext({
    protocol,
    id,
    stateDir: input.stateDir,
    artifactRoot: input.artifactRoot
  });

  const pipeline = PIPELINES[protocol];
  const initialState = protocol === "prime"
    ? { id, procurementId: id, status: input.initialStatus ?? "DISCOVERED" }
    : { id, jobId: id, status: input.initialStatus ?? "DISCOVERED" };

  return runPipeline({ context, pipeline, input: { ...input, initialState } });
}
