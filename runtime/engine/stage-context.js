import path from "path";
import { createStateStore } from "../state/store.js";
import { createArtifactManager } from "../artifacts/artifact-manager.js";

export function createStageContext({ protocol, id, stateDir, artifactRoot, now = Date.now() }) {
  const stateStore = createStateStore({ protocol, stateDir });
  const artifacts = createArtifactManager({ artifactRoot, protocol, id });
  return {
    protocol,
    id: String(id),
    now,
    paths: {
      stateDir: stateDir ?? path.join("agent", "state"),
      artifactRoot: artifactRoot ?? "artifacts"
    },
    stateStore,
    artifacts
  };
}
