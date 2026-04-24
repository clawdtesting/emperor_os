import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface TenantBindingFile {
  operatorId: string;
  agentId: string;
  createdAt: string;
  updatedAt: string;
}

function bindingPath(identityDir: string): string {
  return join(identityDir, 'tenant-binding.json');
}

export function enforceTenantBinding(identityDir: string, operatorId: string, agentId: string): void {
  const path = bindingPath(identityDir);
  const now = new Date().toISOString();

  if (existsSync(path)) {
    const existing = JSON.parse(readFileSync(path, 'utf8')) as TenantBindingFile;
    if (existing.operatorId !== operatorId) {
      throw new Error(
        `Tenant binding mismatch: expected operatorId ${existing.operatorId}, got ${operatorId}. ` +
        'Refusing to run with mixed operator tenancy.'
      );
    }
    if (existing.agentId !== agentId) {
      throw new Error(
        `Tenant binding mismatch: expected agentId ${existing.agentId}, got ${agentId}. ` +
        'Refusing to run with mixed identity tenancy.'
      );
    }
    existing.updatedAt = now;
    writeFileSync(path, JSON.stringify(existing, null, 2), { encoding: 'utf8', mode: 0o600 });
    chmodSync(path, 0o600);
    return;
  }

  const payload: TenantBindingFile = {
    operatorId,
    agentId,
    createdAt: now,
    updatedAt: now
  };
  writeFileSync(path, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 });
  chmodSync(path, 0o600);
}

