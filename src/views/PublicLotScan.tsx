import { useState } from 'react'
import { getLot } from '../lib/storage'
import { ProvenanceCard } from '../components/ProvenanceCard'
import type { Lot } from '../lib/types'

export function PublicLotScan() {
  const [id, setId] = useState('')
  const [lot, setLot] = useState<Lot | null>(null)
  const [err, setErr] = useState('')

  function scan() {
    setErr('')
    const found = getLot(id.trim())
    if (!found) {
      setLot(null)
      setErr('Lot not found')
      return
    }
    setLot(found)
  }

  return (
    <div className="view">
      <header className="view-head">
        <h2>Public lot scan</h2>
        <p className="muted">Provenance summary only — no home address or face.</p>
      </header>
      <section className="panel">
        <div className="row">
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="LOT-…"
            style={{ flex: 1 }}
          />
          <button type="button" className="btn primary" onClick={scan}>
            Scan
          </button>
        </div>
        {err && <p className="error">{err}</p>}
        {lot && <ProvenanceCard lot={lot} />}
      </section>
    </div>
  )
}
