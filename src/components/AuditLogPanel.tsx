import { useEffect, useState } from 'react'
import { downloadAuditJson, loadAudit } from '../lib/audit'
import type { AuditEntry } from '../lib/types'

export function AuditLogPanel({ refreshKey }: { refreshKey?: number }) {
  const [entries, setEntries] = useState<AuditEntry[]>([])

  useEffect(() => {
    setEntries(loadAudit().slice().reverse())
  }, [refreshKey])

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Append-only audit log</h3>
        <button type="button" className="btn ghost" onClick={() => downloadAuditJson()}>
          Download JSON
        </button>
      </div>
      <p className="muted small">
        Chained SHA-256 hashes in localStorage. Prior entries are never rewritten by this app.
      </p>
      {entries.length === 0 ? (
        <p className="muted">No events yet.</p>
      ) : (
        <ul className="audit-list">
          {entries.map((e) => (
            <li key={e.id}>
              <div className="audit-meta">
                <time>{e.at}</time>
                <span className="pill">{e.action}</span>
                {e.lotId && <code>{e.lotId}</code>}
              </div>
              <div>
                <strong>{e.actor}</strong> — {e.detail}
              </div>
              <code className="tiny">hash:{e.entryHash.slice(0, 20)}… ← {e.prevHash.slice(0, 12)}…</code>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
