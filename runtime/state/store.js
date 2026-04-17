import { promises as fs } from "fs";
import path from "path";

async function writeAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, filePath);
}

export function createStateStore({ protocol, stateDir = path.join("agent", "state") }) {
  const root = protocol === "prime" ? path.join(stateDir, "prime") : path.join(stateDir, "jobs");
  const file = (id = "runtime") => path.join(root, `${id}.json`);

  return {
    async read(id = "runtime") {
      try { return JSON.parse(await fs.readFile(file(id), "utf8")); }
      catch (err) { if (err.code === "ENOENT") return null; throw err; }
    },
    async write(state, id = state?.id ?? state?.jobId ?? state?.procurementId ?? "runtime") {
      const next = { ...state, updatedAt: new Date().toISOString() };
      await writeAtomic(file(id), next);
      return next;
    },
    async getOrCreate(initialState = {}) {
      const id = initialState?.id ?? initialState?.jobId ?? initialState?.procurementId ?? "runtime";
      const current = await this.read(id);
      if (current) return current;
      const created = { ...initialState, id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await this.write(created, id);
      return created;
    }
  };
}
