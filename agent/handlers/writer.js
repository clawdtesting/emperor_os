#!/usr/bin/env node
/**
 * writer.js — Generate deliverable content for an AGI Alpha job
 *
 * Stdin:  Single job object (hydrated + analyzed)
 * Stdout: JSON { content: "string", filename: "string", format: "string" }
 * Exit:   Always 0
 *
 * Env: ANTHROPIC_API_KEY, ANTHROPIC_MODEL
 */
"use strict";

const { chat } = require("./llm");

const SYSTEM = `You are an expert technical writer and autonomous AI agent working for EmpireOS.
You produce high-quality deliverables for on-chain job specifications.
Your output will be pinned to IPFS and submitted for validator review on Ethereum mainnet.

Rules:
- Write complete, polished, publication-ready content
- Match the exact format and scope specified in the job
- Be accurate — do not invent facts about the protocol
- Write from the perspective of a capable autonomous AI agent
- Minimum length: meet or exceed any word count requirements
- No placeholders, no "TODO", no incomplete sections`;

function buildPrompt(job) {
  const props = job.spec?.properties || {};
  return `You are completing this AGI Alpha on-chain job. Produce the full deliverable now.

JOB TITLE: ${job.title}
CATEGORY: ${job.category}
PAYOUT: ${job.payout_agialpha} AGIALPHA

SUMMARY:
${job.summary}

DELIVERABLES REQUIRED:
${(job.deliverables || []).map((d, i) => `${i + 1}. ${d}`).join("\n")}

ACCEPTANCE CRITERIA:
${(props.acceptanceCriteria || []).map((c, i) => `${i + 1}. ${c}`).join("\n")}

FULL DETAILS:
${props.details || job.summary}

Produce the complete deliverable now. Output the full content — do not summarize or truncate.`;
}

function inferFilename(job) {
  const cat = (job.category || "").toLowerCase();
  if (cat.includes("press")) return "press-release.md";
  if (cat.includes("art") || cat.includes("image")) return "description.md";
  if (cat.includes("doc") || cat.includes("guide")) return "guide.md";
  if (cat.includes("dev") || cat.includes("code") || cat.includes("cli")) return "deliverable.js";
  if (cat.includes("creative") || cat.includes("content")) return "post.md";
  return "deliverable.md";
}

async function main() {
  const chunks = [];
  await new Promise((resolve, reject) => {
    process.stdin.on("data", c => chunks.push(c));
    process.stdin.on("end", resolve);
    process.stdin.on("error", reject);
  });

  let job;
  try {
    job = JSON.parse(Buffer.concat(chunks).toString().trim());
  } catch (e) {
    process.stderr.write(`[writer] stdin parse error: ${e.message}\n`);
    process.stdout.write(JSON.stringify({ error: e.message, content: null }));
    return;
  }

  process.stderr.write(`[writer] Writing deliverable for job ${job.jobId}: "${job.title}"\n`);

  const prompt = buildPrompt(job);
  const filename = inferFilename(job);

  let content;
  try {
    content = await chat(SYSTEM, prompt, { maxTokens: 4096 });
    process.stderr.write(`[writer] Generated ${content.length} chars\n`);
  } catch (e) {
    process.stderr.write(`[writer] LLM error: ${e.message}\n`);
    process.stdout.write(JSON.stringify({ error: e.message, content: null }));
    return;
  }

  const result = {
    jobId:    job.jobId,
    title:    job.title,
    filename,
    format:   filename.endsWith(".md") ? "markdown" : "javascript",
    content,
    length:   content.length,
    generated_at: new Date().toISOString(),
  };

  process.stdout.write(JSON.stringify(result));
  process.stderr.write(`[writer] Done — ${filename} (${content.length} chars)\n`);
}

main().catch(e => {
  process.stderr.write(`[writer] Unexpected error: ${e.message}\n`);
  process.stdout.write(JSON.stringify({ error: e.message, content: null }));
});
