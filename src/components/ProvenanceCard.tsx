import type { Lot } from '../lib/types'
import { COUNTRIES } from '../lib/countries'

/** Public lot scan — no home address / face. Texture + region + score band; raw ethnicity only if opted in. */
export function ProvenanceCard({ lot }: { lot: Lot }) {
  const country = COUNTRIES[lot.country]
  const interview = lot.interview
  const score = lot.donorScore

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
          <dt>Texture class</dt>
          <dd>
            {interview?.textureClass ? (
              <>
                {interview.textureClass}
                {interview.andreWalkerType ? ` · type ${interview.andreWalkerType}` : ''}
              </>
            ) : (
              <span className="muted">Not recorded</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Donor score band</dt>
          <dd>
            {score ? (
              <>
                <span className="pill">{score.scoreBand}</span>{' '}
                <span className="muted small">({score.tierLabel})</span>
              </>
            ) : (
              <span className="muted">—</span>
            )}
          </dd>
        </div>
        {interview?.ethnicityPublicOptIn && interview.ethnicityAncestry && (
          <div>
            <dt>Ethnicity (donor opted in)</dt>
            <dd>{interview.ethnicityAncestry}</dd>
          </div>
        )}
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
          <dt>Chemical statement (summary)</dt>
          <dd>
            {lot.virgin ? 'Near-virgin / heat-only claimed' : 'Chemical history disclosed'}:{' '}
            {lot.chemicalHistory || '—'}
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
            {lot.proofs.length === 0 ? (
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
        Public record omits donor home address, face, legal name, DOB-as-ID, and payout credentials.
        Raw ethnicity is intake-only unless the donor opted into public display. Alias is not shown on
        consumer scan.
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
