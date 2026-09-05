import { useEffect, useState } from 'react'
import type { DualControlOverride, Lot, QcChecklistItem } from '../lib/types'
import { COUNTRIES } from '../lib/countries'
import { loadLots, upsertLot } from '../lib/storage'
import {
  advanceState,
  dualControlOverrideToPass,
  evaluateQc,
  refundBrand,
  releasePayment,
} from '../lib/escrow'
import { appendAudit } from '../lib/audit'
import { StatusTimeline } from '../components/StatusTimeline'
import { FileProofUpload } from '../components/FileProofUpload'
import { AuditLogPanel } from '../components/AuditLogPanel'
import { defaultQcChecklist } from '../lib/qcDefaults'

interface Props {
  actor: string
  auditKey: number
  onAudit: () => void
}

export function IntakeAdmin({ actor, auditKey, onAudit }: Props) {
  const [lots, setLots] = useState<Lot[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [items, setItems] = useState<QcChecklistItem[]>([])
  const [revA, setRevA] = useState('')
  const [revB, setRevB] = useState('')
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  function refresh() {
    setLots(loadLots())
  }

  useEffect(() => {
    refresh()
  }, [auditKey])

  const selected = lots.find((l) => l.lotId === selectedId) ?? null

  useEffect(() => {
    if (selected?.qc?.items?.length) setItems(selected.qc.items.map((i) => ({ ...i })))
    else if (selected) setItems(defaultQcChecklist())
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  function setItem(id: string, pass: boolean) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, pass } : i)))
  }

  async function markReceived() {
    if (!selected || selected.escrowState !== 'shipped') return
    setErr('')
    try {
      const next = await advanceState(selected, 'received', actor, 'Intake scanned lot ID; custody at hub')
      upsertLot(next)
      setOk('Marked received')
      refresh()
      setSelectedId(next.lotId)
      onAudit()
    } catch (e) {
      setErr(String(e))
    }
  }

  async function runQc() {
    if (!selected || selected.escrowState !== 'received') {
      setErr('Lot must be in received state')
      return
    }
    setErr('')
    try {
      const decision = evaluateQc(items)
      const withQc: Lot = {
        ...selected,
        qc: { items, decidedAt: new Date().toISOString(), decidedBy: actor },
      }
      let next = await advanceState(
        withQc,
        decision,
        actor,
        decision === 'qc_pass'
          ? 'All critical QC items passed'
          : 'Critical QC item(s) failed → qc_fail; no pay',
      )
      upsertLot(next)
      setOk(`QC decision: ${decision}`)
      refresh()
      setSelectedId(next.lotId)
      onAudit()
    } catch (e) {
      setErr(String(e))
    }
  }

  async function doRelease() {
    if (!selected) return
    setErr('')
    try {
      const next = await releasePayment(selected, actor)
      setOk('SIMULATION: escrow released to donor')
      refresh()
      setSelectedId(next.lotId)
      onAudit()
    } catch (e) {
      setErr(String(e))
    }
  }

  async function doRefund() {
    if (!selected) return
    setErr('')
    try {
      const next = await refundBrand(selected, actor)
      setOk('SIMULATION: escrow refunded to brand')
      refresh()
      setSelectedId(next.lotId)
      onAudit()
    } catch (e) {
      setErr(String(e))
    }
  }

  async function doOverride() {
    if (!selected) return
    setErr('')
    try {
      const override: DualControlOverride = {
        reviewerA: revA,
        reviewerB: revB,
        reason,
        at: new Date().toISOString(),
      }
      const next = await dualControlOverrideToPass(selected, override)
      setOk('Dual-control override logged: qc_fail → qc_pass (still must release to pay)')
      refresh()
      setSelectedId(next.lotId)
      onAudit()
    } catch (e) {
      setErr(String(e))
    }
  }

  async function openDispute() {
    if (!selected) return
    if (!['qc_pass', 'qc_fail', 'paid', 'refunded'].includes(selected.escrowState)) {
      setErr('Dispute from late states only')
      return
    }
    const next = await advanceState(selected, 'disputed', actor, 'Dispute opened — human review queue')
    refresh()
    setSelectedId(next.lotId)
    onAudit()
  }

  return (
    <div className="view">
      <header className="view-head">
        <h2>Intake / Admin QC</h2>
        <p className="muted">
          Actor: <strong>{actor}</strong> — pay only on QC pass; dual-control override required for
          fail→pass
        </p>
      </header>

      <section className="panel">
        <div className="panel-head">
          <h3>Lots</h3>
          <button type="button" className="btn ghost" onClick={refresh}>
            Refresh
          </button>
        </div>
        {lots.length === 0 ? (
          <p className="muted">No lots yet — complete a donor flow first.</p>
        ) : (
          <table className="lot-table">
            <thead>
              <tr>
                <th>Lot</th>
                <th>Country</th>
                <th>State</th>
                <th>Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lots.map((l) => {
                const c = COUNTRIES[l.country]
                return (
                  <tr key={l.lotId} className={l.lotId === selectedId ? 'selected' : ''}>
                    <td>
                      <code>{l.lotId}</code>
                    </td>
                    <td>
                      {c.name}
                      {c.highRisk && <span className="badge risk">HIGH-RISK</span>}
                    </td>
                    <td>
                      <span className={`pill state-${l.escrowState}`}>{l.escrowState}</span>
                    </td>
                    <td>
                      {l.offerAmountLocal} {l.currency}
                    </td>
                    <td>
                      <button type="button" className="btn ghost" onClick={() => setSelectedId(l.lotId)}>
                        Open
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {selected && (
        <section className="panel">
          <h3>Lot detail — {selected.lotId}</h3>
          {COUNTRIES[selected.country].highRisk && (
            <div className="risk-banner">
              ⚠ Myanmar / high-risk corridor — elevated dual-review recommended before release.
            </div>
          )}
          <StatusTimeline state={selected.escrowState} />
          <p>
            Alias: <strong>{selected.alias}</strong> · Tracking:{' '}
            <code>{selected.trackingNumber || '—'}</code>
          </p>
          <div className="money-sim">
            <ul>
              <li>Escrow hold: {selected.escrowSim.escrowHold}</li>
              <li>Donor paid: {selected.escrowSim.donorPaid}</li>
              <li>Brand refunded: {selected.escrowSim.brandRefunded}</li>
              <li>Brand wallet (sim): {selected.escrowSim.brandWallet}</li>
            </ul>
          </div>

          <div className="row wrap">
            {selected.escrowState === 'shipped' && (
              <button type="button" className="btn primary" onClick={markReceived}>
                Mark received
              </button>
            )}
            {selected.escrowState === 'qc_pass' && (
              <button type="button" className="btn primary" onClick={doRelease}>
                Release escrow → paid
              </button>
            )}
            {selected.escrowState === 'qc_fail' && (
              <button type="button" className="btn danger" onClick={doRefund}>
                Refund brand
              </button>
            )}
            <button type="button" className="btn ghost" onClick={openDispute}>
              Open dispute
            </button>
          </div>

          {selected.escrowState === 'received' && (
            <>
              <h4>QC checklist (fail any critical → qc_fail)</h4>
              <FileProofUpload
                kind="received_photo"
                label="Photo of received hair (hash stored)"
                onHashed={async (meta) => {
                  const next = {
                    ...selected,
                    proofs: [...selected.proofs.filter((p) => p.kind !== 'received_photo'), meta],
                  }
                  upsertLot(next)
                  await appendAudit(actor, 'proof.received_photo_hashed', meta.sha256, selected.lotId)
                  setItems((prev) =>
                    prev.map((i) => (i.id === 'photo_hash' ? { ...i, pass: true } : i)),
                  )
                  refresh()
                  onAudit()
                }}
              />
              <ul className="qc-list">
                {items.map((i) => (
                  <li key={i.id}>
                    <span>
                      {i.label} {i.critical && <em className="crit">critical</em>}
                    </span>
                    <span className="qc-btns">
                      <button
                        type="button"
                        className={i.pass === true ? 'btn ok-btn' : 'btn ghost'}
                        onClick={() => setItem(i.id, true)}
                      >
                        Pass
                      </button>
                      <button
                        type="button"
                        className={i.pass === false ? 'btn danger' : 'btn ghost'}
                        onClick={() => setItem(i.id, false)}
                      >
                        Fail
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              <button type="button" className="btn primary" onClick={runQc}>
                Submit QC decision
              </button>
            </>
          )}

          {(selected.escrowState === 'qc_fail' || selected.escrowState === 'disputed') && (
            <div className="override-box">
              <h4>Dual-control override (qc_fail → qc_pass)</h4>
              <p className="muted small">Two distinct reviewers + reason. Fully audit-logged.</p>
              <div className="grid-2">
                <label>
                  Reviewer A alias
                  <input value={revA} onChange={(e) => setRevA(e.target.value)} />
                </label>
                <label>
                  Reviewer B alias
                  <input value={revB} onChange={(e) => setRevB(e.target.value)} />
                </label>
              </div>
              <label>
                Reason
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
              </label>
              <button type="button" className="btn warn-btn" onClick={doOverride}>
                Log override → qc_pass
              </button>
            </div>
          )}

          {selected.qc?.override && (
            <p className="flash">
              Override on file: {selected.qc.override.reviewerA} + {selected.qc.override.reviewerB} —{' '}
              {selected.qc.override.reason}
            </p>
          )}

          {err && <p className="error">{err}</p>}
          {ok && <p className="ok">{ok}</p>}
        </section>
      )}

      <AuditLogPanel refreshKey={auditKey} />
    </div>
  )
}
