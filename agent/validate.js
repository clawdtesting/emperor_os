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
  /meta commentary/i
];
const MIN_SUBSTANTIVE_CHARS = 120;

export function isSubstantive(text) {
  const normalized = String(text ?? "").trim();
  return normalized.length >= MIN_SUBSTANTIVE_CHARS && !normalized.includes("*[");
}

export function validateOutput(content, brief) {
  const errors = [];

  if (!content || !String(content).trim()) {
    errors.push("content is empty");
  }

  const normalized = String(content ?? "").trim();

  if (normalized.length < CONFIG.MIN_ARTIFACT_CHARS) {
    errors.push(`content shorter than minimum threshold (${CONFIG.MIN_ARTIFACT_CHARS})`);
  }
  if (!isSubstantive(normalized)) {
    errors.push("content is not substantive");
  }
  if (/\*\[[^\]]{3,}\]\*/.test(normalized)) {
    errors.push("content contains placeholder markers");
  }

  if (!normalized.includes("##")) {
    errors.push("content missing markdown section headings");
  }

  for (const section of brief.required_sections ?? []) {
    if (!normalized.toLowerCase().includes(String(section).toLowerCase())) {
      errors.push(`missing required section: ${section}`);
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
      const publicationValidationPath = artifactPaths.publicationValidation;

      const validationReport = {
        kind: "publication-validation",
        generatedAt: new Date().toISOString(),
        jobId: Number(job.jobId),
        expectedSha256,
        ...verify
      };

      await writeJson(publicationValidationPath, validationReport);

      if (!verify.ok) {
        await setJobState(job.jobId, {
          status: "failed",
          failReason: `ipfs fetch-back verification failed for ${job.deliverableIpfs.ipfsUri}`,
          publicationValidationPath
        });
        console.log(`[validate] verification failed for ${job.jobId}`);
        continue;
      }

      await setJobState(job.jobId, {
        status: "deliverable_ready",
        publicationValidationPath,
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
