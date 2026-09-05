import { useMemo, useState } from 'react'
import type { CountryCode, Lot, ProofFileMeta } from '../lib/types'
import { ALLOWLIST, COUNTRIES, REJECT_DEMO, isAllowlisted } from '../lib/countries'
import { FileProofUpload } from '../components/FileProofUpload'
import { StatusTimeline } from '../components/StatusTimeline'
import { ProvenanceCard } from '../components/ProvenanceCard'
import { acceptOffer, advanceState } from '../lib/escrow'
import { appendAudit } from '../lib/audit'
import { getLot, mintLotId, upsertLot } from '../lib/storage'
import { defaultQcChecklist } from '../lib/qcDefaults'

type Step =
  | 'quiz'
  | 'precut'
  | 'lot'
  | 'cut'
  | 'ship'
  | 'timeline'

const OFFER_BY_COUNTRY: Record<string, number> = {
  IN: 8500,
  KH: 45,
  MM: 80000,
  PL: 180,
}

interface Props {
  onAudit: () => void
}

export function DonorFlow({ onAudit }: Props) {
  const [step, setStep] = useState<Step>('quiz')
  const [alias, setAlias] = useState('')
  const [contact, setContact] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState('')
  const [otpOk, setOtpOk] = useState(false)
  const [country, setCountry] = useState<CountryCode | ''>('')
  const [lengthCm, setLengthCm] = useState(40)
  const [virgin, setVirgin] = useState(true)
  const [chemicalHistory, setChemicalHistory] = useState('none')
  const [age18, setAge18] = useState(false)
  const [healthOk, setHealthOk] = useState(false)
  const [quizError, setQuizError] = useState('')
  const [proofs, setProofs] = useState<ProofFileMeta[]>([])
  const [lot, setLot] = useState<Lot | null>(null)
  const [tracking, setTracking] = useState('')
  const [resumeId, setResumeId] = useState('')
  const [msg, setMsg] = useState('')

  const countryInfo = country ? COUNTRIES[country] : null
  const rejected = country && !isAllowlisted(country)

  const quizReady = useMemo(() => {
    return (
      alias.trim().length >= 2 &&
      contact.trim().length >= 5 &&
      otpOk &&
      country &&
      isAllowlisted(country) &&
      lengthCm >= 25 &&
      age18 &&
      healthOk
    )
  }, [alias, contact, otpOk, country, lengthCm, age18, healthOk])

  function addProof(meta: ProofFileMeta) {
    setProofs((p) => [...p.filter((x) => x.kind !== meta.kind), meta])
  }

  async function sendOtp() {
    if (!contact.trim()) return
    setOtpSent(true)
    setMsg('SIMULATION: OTP sent. Enter demo code 123456')
    await appendAudit('system', 'auth.otp_mock_sent', `OTP mock to ${contact.trim()} (no real SMS/email)`)
    onAudit()
  }

  function verifyOtp() {
    if (otp.trim() === '123456') {
      setOtpOk(true)
      setMsg('OTP verified (mock)')
    } else {
      setMsg('Invalid OTP — use 123456 for this demo')
    }
  }

  async function startLot() {
    setQuizError('')
    if (!quizReady || !country || !isAllowlisted(country)) {
      setQuizError('Complete eligibility with an allowlisted country.')
      return
    }
    const amount = OFFER_BY_COUNTRY[country] ?? 100
    const info = COUNTRIES[country]
    const newLot: Lot = {
      lotId: mintLotId(country),
      alias: alias.trim(),
      contact: contact.trim(),
      country,
      lengthCm,
      virgin,
      age18Plus: age18,
      chemicalHistory,
      escrowState: 'offered',
      offerAmountLocal: amount,
      currency: info.currency,
      platformFeePct: 8,
      proofs: [],
      timestamps: { created: new Date().toISOString() },
      escrowSim: {
        brandWallet: 100000,
        escrowHold: 0,
        donorPaid: 0,
        brandRefunded: 0,
        txRefs: [],
      },
      qc: { items: defaultQcChecklist() },
    }
    upsertLot(newLot)
    await appendAudit(alias.trim(), 'lot.created_offer', `Offer ${amount} ${info.currency}`, newLot.lotId)
    setLot(newLot)
    setStep('precut')
    onAudit()
  }

  async function submitPrecut() {
    if (!lot) return
    const need = proofs.filter((p) => p.kind === 'precut_video' || p.kind === 'precut_photo')
    if (need.length < 2) {
      setMsg('Upload pre-cut video + photo stubs before continuing.')
      return
    }
    let next = { ...lot, proofs: [...lot.proofs, ...need.filter((n) => !lot.proofs.find((p) => p.kind === n.kind))] }
    // Fund on accept
    next = await acceptOffer(next, lot.alias)
    setLot(next)
    setStep('lot')
    setMsg('Lot ID issued. Escrow funded on accept (simulation).')
    onAudit()
  }

  async function submitCut() {
    if (!lot) return
    const cut = proofs.filter((p) => p.kind === 'cut_video' || p.kind === 'seal_photo')
    if (cut.length < 2) {
      setMsg('Upload cut video + sealed bag photo stubs.')
      return
    }
    const merged = [...lot.proofs]
    for (const c of cut) {
      if (!merged.find((p) => p.kind === c.kind)) merged.push(c)
    }
    let next: Lot = { ...lot, proofs: merged }
    upsertLot(next)
    next = await advanceState(next, 'proof_submitted', lot.alias, 'Cut + seal proof stubs hashed and submitted')
    setLot(next)
    setStep('ship')
    onAudit()
  }

  async function submitShip() {
    if (!lot || !tracking.trim()) {
      setMsg('Tracking number required.')
      return
    }
    let next: Lot = { ...lot, trackingNumber: tracking.trim() }
    upsertLot(next)
    next = await advanceState(next, 'shipped', lot.alias, `Shipped with tracking ${tracking.trim()}`)
    setLot(next)
    setStep('timeline')
    setMsg('Shipped. Waiting for intake to mark received + QC.')
    onAudit()
  }

  function resume() {
    const found = getLot(resumeId.trim())
    if (!found) {
      setMsg('Lot not found in localStorage.')
      return
    }
    setLot(found)
    setAlias(found.alias)
    setProofs(found.proofs)
    if (found.escrowState === 'offered') setStep('precut')
    else if (found.escrowState === 'accepted') setStep('cut')
    else if (found.escrowState === 'proof_submitted') setStep('ship')
    else setStep('timeline')
    setMsg(`Resumed ${found.lotId}`)
  }

  return (
    <div className="view">
      <header className="view-head">
        <h2>Donor flow</h2>
        <p className="muted">Eligibility → pre-cut proof → lot ID → cut proof → tracking → status</p>
      </header>

      <div className="resume-bar">
        <input
          placeholder="Resume lot ID"
          value={resumeId}
          onChange={(e) => setResumeId(e.target.value)}
        />
        <button type="button" className="btn ghost" onClick={resume}>
          Resume
        </button>
      </div>

      {msg && <p className="flash">{msg}</p>}

      {step === 'quiz' && (
        <section className="panel">
          <h3>1. Eligibility quiz</h3>
          <div className="grid-2">
            <label>
              Alias (no legal name)
              <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="e.g. lotus_42" />
            </label>
            <label>
              Email or phone (OTP mock)
              <input
                value={contact}
                onChange={(e) => {
                  setContact(e.target.value)
                  setOtpOk(false)
                }}
                placeholder="you@example.com or +…"
              />
            </label>
          </div>
          <div className="row">
            <button type="button" className="btn" onClick={sendOtp} disabled={!contact.trim()}>
              Send OTP (mock)
            </button>
            {otpSent && (
              <>
                <input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="OTP"
                  style={{ maxWidth: 120 }}
                />
                <button type="button" className="btn ghost" onClick={verifyOtp}>
                  Verify
                </button>
                {otpOk && <span className="ok">✓ verified</span>}
              </>
            )}
          </div>

          <label>
            Shipping country
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value as CountryCode | '')}
            >
              <option value="">Select…</option>
              <optgroup label="Allowlisted">
                {ALLOWLIST.map((c) => (
                  <option key={c} value={c}>
                    {COUNTRIES[c].name}
                    {COUNTRIES[c].highRisk ? ' ⚠ high-risk' : ''}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Rejected for this ticket">
                {REJECT_DEMO.map((c) => (
                  <option key={c} value={c}>
                    {COUNTRIES[c].name} (rejected)
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          {rejected && countryInfo && (
            <p className="error">Country rejected: {countryInfo.rejectReason}</p>
          )}
          {country === 'MM' && (
            <p className="warn">Myanmar is allowlisted but flagged high operational risk for intake.</p>
          )}

          <div className="grid-2">
            <label>
              Length (cm)
              <input
                type="number"
                min={25}
                max={120}
                value={lengthCm}
                onChange={(e) => setLengthCm(Number(e.target.value))}
              />
            </label>
            <label>
              Chemical history
              <select value={chemicalHistory} onChange={(e) => setChemicalHistory(e.target.value)}>
                <option value="none">None / virgin</option>
                <option value="henna">Henna only</option>
                <option value="color">Colored / bleached (disclose)</option>
                <option value="relaxer">Chemical relaxer</option>
              </select>
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={virgin} onChange={(e) => setVirgin(e.target.checked)} />
            Virgin / no chemical processing (claim — verified at QC)
          </label>
          <label className="check">
            <input type="checkbox" checked={age18} onChange={(e) => setAge18(e.target.checked)} />
            I confirm I am 18+
          </label>
          <label className="check">
            <input type="checkbox" checked={healthOk} onChange={(e) => setHealthOk(e.target.checked)} />
            Basic health OK to ship (no active scalp infection known)
          </label>

          {countryInfo?.allowlisted && (
            <p className="offer-box">
              Simulated offer on accept: <strong>
                {OFFER_BY_COUNTRY[country!] ?? '—'} {countryInfo.currency}
              </strong>{' '}
              (8% platform fee disclosed). Escrow holds until QC pass. Payout hint:{' '}
              {countryInfo.payoutHint}
            </p>
          )}

          {quizError && <p className="error">{quizError}</p>}
          <button type="button" className="btn primary" disabled={!quizReady} onClick={startLot}>
            Continue to pre-cut proof
          </button>
        </section>
      )}

      {step === 'precut' && lot && (
        <section className="panel">
          <h3>2. Pre-cut proof pack</h3>
          <p className="muted">
            Evidence only — never trust claim alone. Face optional / privacy mode OK if scalp + length clear.
          </p>
          <FileProofUpload
            kind="precut_video"
            label="Timestamped video: full head, scalp, length vs ruler"
            onHashed={addProof}
          />
          <FileProofUpload
            kind="precut_photo"
            label="Photo: hair tied in single ponytail at agreed point"
            onHashed={addProof}
          />
          <button type="button" className="btn primary" onClick={submitPrecut}>
            Accept offer &amp; issue lot ID (funds escrow)
          </button>
        </section>
      )}

      {step === 'lot' && lot && (
        <section className="panel">
          <h3>3. Lot ID issued</h3>
          <p className="lot-hero">
            <code>{lot.lotId}</code>
          </p>
          <p>
            Escrow state: <span className={`pill state-${lot.escrowState}`}>{lot.escrowState}</span>
          </p>
          <p className="muted">
            SIMULATION: brand funded {lot.offerAmountLocal} {lot.currency} into escrow hold. Print/affix lot
            ID on sealed bag. Ship to country intake hub (address held by ops — not stored in this demo).
          </p>
          <StatusTimeline state={lot.escrowState} />
          <button type="button" className="btn primary" onClick={() => setStep('cut')}>
            Continue to cut proof
          </button>
        </section>
      )}

      {step === 'cut' && lot && (
        <section className="panel">
          <h3>4. Cut proof</h3>
          <FileProofUpload kind="cut_video" label="Short video of the cut" onHashed={addProof} />
          <FileProofUpload
            kind="seal_photo"
            label="Sealed bag with lot ID sticker photo"
            onHashed={addProof}
          />
          <button type="button" className="btn primary" onClick={submitCut}>
            Submit cut proof
          </button>
        </section>
      )}

      {step === 'ship' && lot && (
        <section className="panel">
          <h3>5. Ship + tracking</h3>
          <label>
            Tracking number (required)
            <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="e.g. RR123456789IN" />
          </label>
          <button type="button" className="btn primary" onClick={submitShip}>
            Mark shipped
          </button>
        </section>
      )}

      {step === 'timeline' && lot && (
        <section className="panel">
          <h3>6. Status timeline</h3>
          <p>
            Lot <code>{lot.lotId}</code> — refresh by resuming after intake QC.
          </p>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              const fresh = getLot(lot.lotId)
              if (fresh) setLot(fresh)
            }}
          >
            Refresh status
          </button>
          <StatusTimeline state={lot.escrowState} />
          <div className="money-sim">
            <h4>Escrow simulation</h4>
            <ul>
              <li>Hold: {lot.escrowSim.escrowHold} {lot.currency}</li>
              <li>Donor paid: {lot.escrowSim.donorPaid} {lot.currency}</li>
              <li>Brand refunded: {lot.escrowSim.brandRefunded} {lot.currency}</li>
            </ul>
            <p className="muted small">Paid only on QC pass. No cash-on-ship.</p>
          </div>
          <ProvenanceCard lot={lot} />
        </section>
      )}
    </div>
  )
}
