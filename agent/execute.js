// ./agent/execute.js
import "dotenv/config";
import { buildBrief } from "./build-brief.js";
import { buildPrompt } from "./templates.js";
import { validateOutput } from "./validate.js";
import { claimJobStageIdempotency, listAllJobStates, setJobState } from "./state.js";
import { ensureJobArtifactDir, getJobArtifactPaths, writeJson, writeText } from "./artifact-manager.js";
import { llmCall } from "../config/llm_router.js";

export async function execute() {
  const jobs = await listAllJobStates();
  const assigned = jobs.filter((j) => j.status === "assigned");

  if (assigned.length === 0) {
    console.log("[execute] no assigned jobs");
    return;
  }

  for (const job of assigned) {
    try {
      const claim = await claimJobStageIdempotency(
        job.jobId,
        "execute",
        `execute:${job.jobId}:${job.assignedAt ?? job.updatedAt ?? "na"}`
      );
      if (!claim.claimed) {
        console.log(`[execute] idempotency skip for ${job.jobId}`);
        continue;
      }

      await ensureJobArtifactDir(job.jobId);
      const artifactPaths = getJobArtifactPaths(job.jobId);

      const brief = buildBrief(job);
      await writeJson(artifactPaths.brief, brief);

      const normalizedSpec = {
        title: brief.title,
        goal: brief.goal,
        category: brief.category,
        audience: brief.audience,
        tone: brief.tone,
        constraints: brief.constraints,
        required_sections: brief.required_sections,
        context: brief.context
      };

      await writeJson(artifactPaths.normalizedSpec, normalizedSpec);

      const prompt = await buildPrompt(brief);
      const { content: markdown } = await llmCall(
        [{ role: "user", content: prompt }],
        { max_tokens: 8192 }
      );

      const validation = validateOutput(markdown, brief);
      await writeJson(artifactPaths.executionValidation, validation);

      if (!validation.ok) {
        await setJobState(job.jobId, {
          status: "failed",
          failReason: `artifact validation failed: ${validation.errors.join("; ")}`
        });

        console.log(`[execute] validation failed for ${job.jobId}: ${validation.errors.join(" | ")}`);
        continue;
      }

      await writeText(artifactPaths.deliverable, markdown);

      // Artifact-first boundary: state advances only after the full execute artifact bundle is durable.
      await setJobState(job.jobId, {
        status: "deliverable_ready",
        artifactDir: artifactPaths.dir,
        artifactPath: artifactPaths.deliverable,
        briefPath: artifactPaths.brief,
        executionValidationPath: artifactPaths.executionValidation,
        executedAt: new Date().toISOString(),
        attempts: {
          ...job.attempts,
          execute: (job.attempts?.execute ?? 0) + 1
        }
      });

      console.log(`[execute] built artifact for ${job.jobId}`);
    } catch (err) {
      await setJobState(job.jobId, {
        status: "failed",
        failReason: `execution error: ${err.message}`
      });
      console.error(`[execute] job ${job.jobId} failed:`, err.message);
    }
  }
}
