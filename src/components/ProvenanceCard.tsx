import type { Lot } from '../lib/types'
import { COUNTRIES } from '../lib/countries'

/** Public lot scan — no home address / face. */
export function ProvenanceCard({ lot }: { lot: Lot }) {
  const country = COUNTRIES[lot.country]
  const proofHashes = lot.proofs.map((p) => p.sha256.slice(0, 12))

  return (
    <article className="provenance-card">
      <header>
        <h2>Lot provenance</h2>
        <code className="lot-badge">{lot.lotId}</code>
      </header>
      <dl className="prov-grid">
        <div>
          <dt>Country / region</dt>
          <dd>
            {country.name}
            {country.highRisk && <span className="badge risk">High-risk corridor</span>}
          </dd>
        </div>
        <div>
          <dt>Escrow / QC status</dt>
          <dd>
            <span className={`pill state-${lot.escrowState}`}>{lot.escrowState}</span>
          </dd>
        </div>
        <div>
          <dt>Length (declared)</dt>
          <dd>{lot.lengthCm} cm</dd>
        </div>
        <div>
          <dt>Virgin / chemical</dt>
          <dd>
            {lot.virgin ? 'Virgin claimed' : 'Chemical history disclosed'}: {lot.chemicalHistory || '—'}
          </dd>
        </div>
        <div>
          <dt>Timestamps</dt>
          <dd>
            <ul className="compact">
              <li>Created: {fmt(lot.timestamps.created)}</li>
              {lot.timestamps.shipped && <li>Shipped: {fmt(lot.timestamps.shipped)}</li>}
              {lot.timestamps.received && <li>Received: {fmt(lot.timestamps.received)}</li>}
              {lot.timestamps.qcDecided && <li>QC: {fmt(lot.timestamps.qcDecided)}</li>}
            </ul>
          </dd>
        </div>
        <div>
          <dt>Proof media hashes (truncated)</dt>
          <dd>
            {proofHashes.length === 0 ? (
              <span className="muted">None yet</span>
            ) : (
              <ul className="compact mono">
                {lot.proofs.map((p) => (
                  <li key={p.sha256}>
                    {p.kind}: {p.sha256.slice(0, 16)}…
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
        <div>
          <dt>Escrow tx refs (simulation)</dt>
          <dd>
            <ul className="compact mono">
              {lot.escrowSim.txRefs.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
      <p className="privacy-note">
        Public record omits donor home address, face, legal name, and payout credentials.
        Alias session ID is not shown on consumer scan.
      </p>
    </article>
  )
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' }) + ' ICT'
  } catch {
    return iso
  }
}
