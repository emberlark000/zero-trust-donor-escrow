import type { AuditEntry } from './types'
import { chainHash } from './hash'

const AUDIT_KEY = 'zt_donor_escrow_audit_v1'
const GENESIS = '0'.repeat(64)

export function loadAudit(): AuditEntry[] {
  try {
    const raw = localStorage.getItem(AUDIT_KEY)
    if (!raw) return []
    return JSON.parse(raw) as AuditEntry[]
  } catch {
    return []
  }
}

function saveAudit(entries: AuditEntry[]): void {
  localStorage.setItem(AUDIT_KEY, JSON.stringify(entries))
}

/** Append-only audit log. Never mutates prior entries. */
export async function appendAudit(
  actor: string,
  action: string,
  detail: string,
  lotId?: string,
): Promise<AuditEntry> {
  const entries = loadAudit()
  const prevHash = entries.length ? entries[entries.length - 1].entryHash : GENESIS
  const at = new Date().toISOString()
  const id = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const payload = JSON.stringify({ id, at, actor, action, lotId, detail })
  const entryHash = await chainHash(prevHash, payload)
  const entry: AuditEntry = { id, at, actor, action, lotId, detail, prevHash, entryHash }
  entries.push(entry)
  saveAudit(entries)
  return entry
}

export function downloadAuditJson(): void {
  const entries = loadAudit()
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `zt-donor-escrow-audit-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function clearAuditForDemo(): void {
  localStorage.removeItem(AUDIT_KEY)
}
