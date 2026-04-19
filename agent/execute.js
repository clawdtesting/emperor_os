// ./agent/execute.js
import "dotenv/config";
import { buildBrief } from "./build-brief.js";
import { buildPrompt } from "./templates.js";
import { validateOutput } from "./validate.js";
import { claimJobStageIdempotency, listAllJobStates, setJobState } from "./state.js";
import { ensureJobArtifactDir, getJobArtifactPaths, writeJson, writeText } from "./artifact-manager.js";
import { llmCall } from "../config/llm_router.js";
import { searchArchive } from "./prime-retrieval.js";

function buildRetrievalKeywords(job, brief) {
  const out = new Set();
  const pushWords = (value) => {
    const raw = String(value ?? "").toLowerCase();
    for (const token of raw.split(/[^a-z0-9_]+/)) {
      if (token && token.length >= 4) out.add(token);
    }
  };

  pushWords(job?.title);
  pushWords(job?.category);
  pushWords(brief?.title);
  pushWords(brief?.goal);
  for (const section of brief?.required_sections ?? []) pushWords(section);

  return Array.from(out).slice(0, 20);
}

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

      const retrievalKeywords = buildRetrievalKeywords(job, brief);
      const archiveHits = await searchArchive({
        phase: "completion",
        keywords: retrievalKeywords,
        maxResults: 5,
      });
      const retrievalPacket = {
        schema: "emperor-os/v1-retrieval-packet/v1",
        jobId: String(job.jobId),
        phase: "execution",
        searchedAt: new Date().toISOString(),
        keywords: retrievalKeywords,
        resultsFound: archiveHits.length,
        items: archiveHits.map((hit) => ({
          archiveId: hit.id,
          title: hit.title,
          summary: hit.summary,
          phase: hit.phase,
          tags: Array.isArray(hit.tags) ? hit.tags : [],
          relevanceScore: hit._score,
          sourceArtifactPath: hit.sourceArtifactPath ?? null,
          artifactPath: hit.artifactPath ?? null,
          wasAccepted: hit.wasAccepted ?? null,
          qualityScore: hit.qualityScore ?? hit.outcomeScore ?? null,
        })),
      };
      await writeJson(artifactPaths.retrievalPacket, retrievalPacket);

      const prompt = await buildPrompt(brief, retrievalPacket);
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
        retrievalPacketPath: artifactPaths.retrievalPacket,
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
