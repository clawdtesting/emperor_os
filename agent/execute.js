// /home/ubuntu/emperor_OS/.openclaw/workspace/agent/execute.js
import "dotenv/config";
import { buildBrief } from "./build-brief.js";
import { buildPrompt } from "./templates.js";
import { validateOutput } from "./validate.js";
import { claimJobStageIdempotency, listAllJobStates, setJobState } from "./state.js";
import { CONFIG, requireEnv } from "./config.js";
import { ensureJobArtifactDir, getJobArtifactPaths, writeJson, writeText } from "./artifact-manager.js";

async function callClaude(prompt) {
  requireEnv("ANTHROPIC_API_KEY", CONFIG.ANTHROPIC_API_KEY);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": CONFIG.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: CONFIG.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Anthropic HTTP ${res.status}: ${txt.slice(0, 500)}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text?.trim();

  if (!text) {
    throw new Error("Anthropic response contained no output text");
  }

  return text;
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
      await setJobState(job.jobId, {
        status: "working",
        workingAt: new Date().toISOString()
      });

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
      const markdown = await callClaude(prompt);

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
