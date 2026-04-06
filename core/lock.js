// ./agent/lock.js
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCK_PATH = path.join(__dirname, "agent.lock");

async function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err.code === "ESRCH") return false;
    if (err.code === "EPERM") return true;
    throw err;
  }
}

export async function acquireLock() {
  const payload = {
    pid: process.pid,
    startedAt: new Date().toISOString()
  };

  async function writeLockFile() {
    const fh = await fs.open(LOCK_PATH, "wx");
    try {
      await fh.writeFile(JSON.stringify(payload, null, 2), "utf8");
    } finally {
      await fh.close();
    }
  }

  try {
    await writeLockFile();
  } catch (err) {
    if (err.code !== "EEXIST") throw err;

    let existing = null;

    try {
      const raw = await fs.readFile(LOCK_PATH, "utf8");
      existing = JSON.parse(raw);
    } catch {
      existing = null;
    }

    const alive = await processExists(existing?.pid);

    if (alive) {
      throw new Error(`Another agent instance is already running with PID ${existing.pid}`);
    }

    await fs.rm(LOCK_PATH, { force: true });
    await writeLockFile();
  }

  const cleanup = async () => {
    try {
      const raw = await fs.readFile(LOCK_PATH, "utf8");
      const current = JSON.parse(raw);
      if (current.pid === process.pid) {
        await fs.rm(LOCK_PATH, { force: true });
      }
    } catch {
      // ignore cleanup errors
    }
  };

  process.on("SIGINT", async () => {
    await cleanup();
    process.exit(130);
  });

  process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(143);
  });

  process.on("uncaughtException", async (err) => {
    console.error("[lock] uncaught exception:", err);
    await cleanup();
    process.exit(1);
  });

  return {
    lockPath: LOCK_PATH,
    cleanup
  };
}