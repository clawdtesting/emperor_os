import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AgentMemory } from '@/lib/types/domain';

const DATA_DIR = process.env.RELAY_DATA_DIR ?? path.join(process.cwd(), '.data');
const MEMORY_DIR = path.join(DATA_DIR, 'memory');

function memoryPath(myAgentId: string, peerAgentId: string): string {
  return path.join(MEMORY_DIR, `${myAgentId}-${peerAgentId}.json`);
}

export async function readMemory(myAgentId: string, peerAgentId: string): Promise<AgentMemory | null> {
  await fs.mkdir(MEMORY_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(memoryPath(myAgentId, peerAgentId), 'utf8');
    return JSON.parse(raw) as AgentMemory;
  } catch {
    return null;
  }
}

export async function writeMemory(memory: AgentMemory): Promise<void> {
  await fs.mkdir(MEMORY_DIR, { recursive: true });
  const filePath = memoryPath(memory.myAgentId, memory.peerAgentId);
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(memory, null, 2), 'utf8');
  await fs.rename(tmp, filePath);
}
