import { useState } from 'react'
import type { ProofFileMeta } from '../lib/types'
import { proofContentHash } from '../lib/hash'

interface Props {
  kind: ProofFileMeta['kind']
  label: string
  accept?: string
  onHashed: (meta: ProofFileMeta) => void
}

/** Stub file upload — stores name/size/type + SHA-256 of those fields (no bytes persisted). */
export function FileProofUpload({ kind, label, accept = 'image/*,video/*', onHashed }: Props) {
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState<ProofFileMeta | null>(null)

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const sha256 = await proofContentHash(file.name, file.size, file.type, kind)
      const meta: ProofFileMeta = {
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        sha256,
        uploadedAt: new Date().toISOString(),
        kind,
      }
      setLast(meta)
      onHashed(meta)
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  return (
    <div className="proof-upload">
      <label>
        <span className="proof-label">{label}</span>
        <input type="file" accept={accept} onChange={onChange} disabled={busy} />
      </label>
      {busy && <p className="muted">Hashing…</p>}
      {last && (
        <div className="hash-box">
          <div>
            <strong>{last.name}</strong> ({last.size} bytes)
          </div>
          <code title="SHA-256 of name|size|type|kind (stub — file bytes not stored)">
            sha256:{last.sha256.slice(0, 16)}…{last.sha256.slice(-8)}
          </code>
        </div>
      )}
    </div>
  )
}
