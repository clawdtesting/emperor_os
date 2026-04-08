// ./agent/publish.js
import path from "path";
import { uploadToIpfs } from "./mcp.js";
import { listAllJobStates, setJobState, rawJobId } from "./state.js";
import { CONFIG, requireEnv } from "./config.js";
import { getJobArtifactPaths, readText, writeJson } from "./artifact-manager.js";

async function uploadTextFileToIpfs(filePath) {
  const raw = await readText(filePath);

  const uploaded = await uploadToIpfs(
    CONFIG.PINATA_JWT,
    { content: raw },
    path.basename(filePath)
  );

  if (!uploaded?.ipfsUri) {
    throw new Error(`[publish] upload_to_ipfs did not return ipfsUri for ${filePath}`);
  }

  return uploaded;
}

export async function publish() {
  requireEnv("PINATA_JWT", CONFIG.PINATA_JWT);

  const jobs = await listAllJobStates();
  const ready = jobs.filter((j) => j.status === "deliverable_ready" && !j.deliverableIpfs);

  if (ready.length === 0) {
    console.log("[publish] no deliverable-ready unpublished jobs");
    return;
  }

  for (const job of ready) {
    const artifactPaths = getJobArtifactPaths(job.jobId);
    const deliverableUpload = await uploadTextFileToIpfs(artifactPaths.deliverable);

    const publishManifest = {
      kind: "publish-manifest",
      generatedAt: new Date().toISOString(),
      jobId: rawJobId(job.jobId),
      publicArtifacts: [
        {
          name: path.basename(artifactPaths.deliverable),
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

    console.log(`[publish] published deliverable for ${job.jobId}`);
  }
}
