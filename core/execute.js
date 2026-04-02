// /home/ubuntu/emperor_OS/.openclaw/workspace/agent/execute.js
import "dotenv/config";
import { buildBrief } from "./build-brief.js";
import { buildPrompt } from "./templates.js";
import { validateOutput } from "./validate.js";
import { listAllJobStates, setJobState } from "./state.js";
import { CONFIG, requireEnv } from "./config.js";
import { ensureJobArtifactDir, getJobArtifactPaths, writeJson, writeText } from "./artifact-manager.js";
import { createRetrievalPacket, extractSteppingStone, extractSearchKeywords } from "../agent/prime-retrieval.js";

async function callOpenAI(prompt) {
  requireEnv("OPENAI_API_KEY", CONFIG.OPENAI_API_KEY);

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${CONFIG.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: CONFIG.OPENAI_MODEL,
      input: prompt
    })
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI HTTP ${res.status}: ${txt.slice(0, 500)}`);
  }

  const data = await res.json();

  let text = "";

  if (typeof data.output_text === "string" && data.output_text.trim()) {
    text = data.output_text.trim();
  } else if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (!item || !Array.isArray(item.content)) continue;
      for (const c of item.content) {
        if (c?.type === "output_text" && typeof c.text === "string") {
          text += c.text;
        }
      }
    }
    text = text.trim();
  }

  if (!text) {
    throw new Error("OpenAI response contained no output text");
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

      let retrievalPacket = null;
      try {
        retrievalPacket = await createRetrievalPacket({
          procurementId: `job_${job.jobId}`,
          phase: brief.category ?? "artifact-bundle",
          searchKeywords: extractSearchKeywords({
            title: brief.title,
            details: brief.goal,
            requirements: brief.required_sections,
            category: brief.category,
          }),
        });
        await writeJson(artifactPaths.retrievalPacket, retrievalPacket);
      } catch (retrievalErr) {
        console.warn(`[execute] retrieval packet generation failed (non-fatal): ${retrievalErr.message}`);
      }

      const prompt = await buildPrompt(brief, retrievalPacket);
      const markdown = await callOpenAI(prompt);

      const validation = validateOutput(markdown, brief);
      await writeJson(artifactPaths.validation, validation);

      if (!validation.ok) {
        await setJobState(job.jobId, {
          status: "failed",
          failReason: `artifact validation failed: ${validation.errors.join("; ")}`
        });

        console.log(`[execute] validation failed for ${job.jobId}: ${validation.errors.join(" | ")}`);
        continue;
      }

      await writeText(artifactPaths.deliverable, markdown);

      // Extract reusable stepping stone from completed deliverable.
      try {
        const title = brief.title ?? `Job ${job.jobId}`;
        await extractSteppingStone({
          procurementId: `job_${job.jobId}`,
          phase:   brief.category ?? "artifact-bundle",
          primitive: {
            jobId:           job.jobId,
            category:        brief.category,
            deliverableType: brief.category,
            contentLength:   markdown.length,
            contentSample:   markdown.slice(0, 400),
            artifactPath:    artifactPaths.deliverable,
          },
          title:   `Deliverable: ${title}`,
          summary: `Completed v1 job ${job.jobId}. Category: ${brief.category ?? "unclassified"}.`,
          tags:    ["v1", brief.category ?? "artifact-bundle", ...extractSearchKeywords(brief)],
        });
        console.log(`[execute] stepping stone extracted for job ${job.jobId}`);
      } catch (extractErr) {
        console.warn(`[execute] stepping stone extraction failed (non-fatal): ${extractErr.message}`);
      }

      await setJobState(job.jobId, {
        status: "deliverable_ready",
        artifactDir: artifactPaths.dir,
        artifactPath: artifactPaths.deliverable,
        briefPath: artifactPaths.brief,
        validationPath: artifactPaths.validation,
        retrievalPacketPath: retrievalPacket ? artifactPaths.retrievalPacket : null,
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
