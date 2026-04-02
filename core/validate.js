// /home/ubuntu/emperor_OS/.openclaw/workspace/agent/validate.js
import { CONFIG } from "./config.js";
import { listAllJobStates, setJobState } from "./state.js";
import { uploadToIpfs } from "./mcp.js";
import { getJobArtifactPaths, readText, writeJson } from "./artifact-manager.js";
import { sha256Text, verifyIpfsTextHash } from "./ipfs-verify.js";

const FORBIDDEN_PATTERNS = [
  /as an ai/i,
  /i can't/i,
  /i cannot/i,
  /here'?s the final deliverable/i,
  /meta commentary/i,
  // Reject bracket-notation placeholder content (e.g. *[Main analysis results]*)
  /\*\[[^\]]{3,}\]\*/,
];

// Minimum non-placeholder characters required per required section.
const MIN_SECTION_BODY_CHARS = 40;

export function validateOutput(content, brief) {
  const errors = [];

  if (!content || !String(content).trim()) {
    errors.push("content is empty");
  }

  const normalized = String(content ?? "").trim();

  if (normalized.length < CONFIG.MIN_ARTIFACT_CHARS) {
    errors.push(`content shorter than minimum threshold (${CONFIG.MIN_ARTIFACT_CHARS})`);
  }

  if (!normalized.includes("##")) {
    errors.push("content missing markdown section headings");
  }

  for (const section of brief.required_sections ?? []) {
    const sectionLower = String(section).toLowerCase();
    if (!normalized.toLowerCase().includes(sectionLower)) {
      errors.push(`missing required section: ${section}`);
      continue;
    }
    // Require at least MIN_SECTION_BODY_CHARS of non-heading, non-placeholder text
    // in the content following the section heading.
    const headingIdx = normalized.toLowerCase().indexOf(sectionLower);
    const afterHeading = normalized.slice(headingIdx + sectionLower.length, headingIdx + sectionLower.length + 800);
    const stripped = afterHeading.replace(/\*\[[^\]]*\]\*/g, "").replace(/^#+.*/gm, "").trim();
    if (stripped.length < MIN_SECTION_BODY_CHARS) {
      errors.push(`section '${section}' has insufficient substantive content (${stripped.length} chars after stripping placeholders)`);
    }
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(normalized)) {
      errors.push(`forbidden pattern matched: ${pattern}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    length: normalized.length
  };
}

export async function validate() {
  if (!CONFIG.PINATA_JWT) {
    console.log("[validate] PINATA_JWT not set, skipping publication verification step");
    return;
  }

  const jobs = await listAllJobStates();
  const ready = jobs.filter((j) => j.status === "deliverable_ready");

  if (ready.length === 0) {
    console.log("[validate] no deliverable-ready jobs");
    return;
  }

  for (const job of ready) {
    try {
      const artifactPaths = getJobArtifactPaths(job.jobId);

      if (!job.deliverableIpfs?.ipfsUri) {
        const raw = await readText(artifactPaths.deliverable);
        const deliverableUpload = await uploadToIpfs(
          CONFIG.PINATA_JWT,
          { content: raw },
          `job-${job.jobId}-deliverable.md`
        );

        if (!deliverableUpload?.ipfsUri) {
          throw new Error("upload_to_ipfs returned no ipfsUri");
        }

        const publishManifest = {
          kind: "publish-manifest",
          generatedAt: new Date().toISOString(),
          jobId: Number(job.jobId),
          publicArtifacts: [
            {
              name: "deliverable.md",
              uri: deliverableUpload.ipfsUri,
              gatewayURI: deliverableUpload.ipfsUri.replace("ipfs://", "https://ipfs.io/ipfs/")
            }
          ]
        };

        await writeJson(artifactPaths.publishManifest, publishManifest);

        await setJobState(job.jobId, {
          deliverableIpfs: deliverableUpload,
          publishManifestPath: artifactPaths.publishManifest,
          publishedAt: new Date().toISOString()
        });

        job.deliverableIpfs = deliverableUpload;
      }

      const localDeliverable = await readText(artifactPaths.deliverable);
      const expectedSha256 = sha256Text(localDeliverable);
      const verify = await verifyIpfsTextHash(job.deliverableIpfs.ipfsUri, expectedSha256);
      const validationPath = artifactPaths.validation;

      const validationReport = {
        kind: "publication-validation",
        generatedAt: new Date().toISOString(),
        jobId: Number(job.jobId),
        expectedSha256,
        ...verify
      };

      await writeJson(validationPath, validationReport);

      if (!verify.ok) {
        await setJobState(job.jobId, {
          status: "failed",
          failReason: `ipfs fetch-back verification failed for ${job.deliverableIpfs.ipfsUri}`,
          validationPath
        });
        console.log(`[validate] verification failed for ${job.jobId}`);
        continue;
      }

      await setJobState(job.jobId, {
        status: "deliverable_ready",
        validationPath,
        validatedAt: new Date().toISOString()
      });

      console.log(`[validate] verified publication for ${job.jobId}`);
    } catch (err) {
      await setJobState(job.jobId, {
        status: "failed",
        failReason: `validation error: ${err.message}`
      });
      console.error(`[validate] job ${job.jobId} failed:`, err.message);
    }
  }
}
