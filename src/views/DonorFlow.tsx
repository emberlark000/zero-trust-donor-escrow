import { useMemo, useState } from 'react'
import type {
  ChemicalHistoryKind,
  CountryCode,
  DonorInterview,
  Lot,
  ProofFileMeta,
  TextureClass,
} from '../lib/types'
import { ALLOWLIST, COUNTRIES, REJECT_DEMO, isAllowlisted } from '../lib/countries'
import { FileProofUpload } from '../components/FileProofUpload'
import { StatusTimeline } from '../components/StatusTimeline'
import { ProvenanceCard } from '../components/ProvenanceCard'
import { acceptOffer, advanceState, hasRequiredCutVideo } from '../lib/escrow'
import { appendAudit } from '../lib/audit'
import { getLot, mintLotId, upsertLot } from '../lib/storage'
import { defaultQcChecklist } from '../lib/qcDefaults'
import {
  chemicalKindLabel,
  computeDonorScore,
  DEFAULT_WEIGHT_GRAMS,
  defaultChemicalStatement,
  toAgeBand,
} from '../lib/donorScore'

type Step = 'quiz' | 'interview' | 'offer' | 'precut' | 'lot' | 'cut' | 'ship' | 'timeline'

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
  const [weightGrams, setWeightGrams] = useState(DEFAULT_WEIGHT_GRAMS)
  const [healthOk, setHealthOk] = useState(false)
  const [quizError, setQuizError] = useState('')
  const [proofs, setProofs] = useState<ProofFileMeta[]>([])
  const [lot, setLot] = useState<Lot | null>(null)
  const [tracking, setTracking] = useState('')
  const [resumeId, setResumeId] = useState('')
  const [msg, setMsg] = useState('')

  // Interview fields (before offer locked)
  const [statedAge, setStatedAge] = useState<number | ''>('')
  const [chemicalKind, setChemicalKind] = useState<ChemicalHistoryKind>('near_virgin')
  const [chemicalStatement, setChemicalStatement] = useState(
    defaultChemicalStatement('near_virgin'),
  )
  const [ethnicityAncestry, setEthnicityAncestry] = useState('')
  const [ethnicityPublicOptIn, setEthnicityPublicOptIn] = useState(false)
  const [textureClass, setTextureClass] = useState<TextureClass | ''>('')
  const [andreWalkerType, setAndreWalkerType] = useState('')
  const [interviewError, setInterviewError] = useState('')

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
      healthOk
    )
  }, [alias, contact, otpOk, country, lengthCm, healthOk])

  const interviewDraft: DonorInterview | null = useMemo(() => {
    if (!country || statedAge === '') return null
    return {
      statedAge: Number(statedAge),
      ageBand: toAgeBand(Number(statedAge)),
      chemicalKind,
      chemicalStatement: chemicalStatement.trim(),
      countryOfOrigin: country,
      ethnicityAncestry: ethnicityAncestry.trim(),
      ethnicityPublicOptIn,
      textureClass: (textureClass || 'straight') as TextureClass,
      andreWalkerType: andreWalkerType.trim() || undefined,
    }
  }, [
    country,
    statedAge,
    chemicalKind,
    chemicalStatement,
    ethnicityAncestry,
    ethnicityPublicOptIn,
    textureClass,
    andreWalkerType,
  ])

  const liveScore = useMemo(() => {
    if (!interviewDraft || !country) return null
    return computeDonorScore({
      interview: interviewDraft,
      lengthCm,
      country,
      proofs,
      weightGrams,
    })
  }, [interviewDraft, lengthCm, country, proofs, weightGrams])

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

  function goInterview() {
    setQuizError('')
    if (!quizReady || !country || !isAllowlisted(country)) {
      setQuizError('Complete eligibility with an allowlisted country.')
      return
    }
    setStep('interview')
  }

  async function lockOffer() {
    setInterviewError('')
    if (!country || !isAllowlisted(country) || !interviewDraft) {
      setInterviewError('Complete the structured interview.')
      return
    }
    if (Number(statedAge) < 18) {
      setInterviewError('Age must be ≥ 18. No offer.')
      return
    }
    if (!textureClass) {
      setInterviewError('Texture class required for product matching.')
      return
    }
    if (!ethnicityAncestry.trim()) {
      setInterviewError('Ethnicity / ancestry (self-described) required for fiber matching — not KYC.')
      return
    }
    if (!chemicalStatement.trim()) {
      setInterviewError('Chemical near-virginity statement required.')
      return
    }

    const interview: DonorInterview = {
      ...interviewDraft,
      textureClass,
      ageBand: toAgeBand(Number(statedAge)),
    }
    const score = computeDonorScore({
      interview,
      lengthCm,
      country,
      proofs,
      weightGrams,
    })
    if (score.gated || score.tier === 'none' || score.offerAmountLocal <= 0) {
      setInterviewError(
        score.gateReason ||
          `Score ${score.total} is below offer threshold (<50). No offer locked.`,
      )
      return
    }

    const virgin =
      chemicalKind === 'near_virgin' || chemicalKind === 'heat_only'
    const newLot: Lot = {
      lotId: mintLotId(country),
      alias: alias.trim(),
      contact: contact.trim(),
      country,
      lengthCm,
      weightGrams,
      virgin,
      age18Plus: true,
      chemicalHistory: chemicalKind,
      interview,
      donorScore: score,
      escrowState: 'offered',
      offerAmountLocal: score.offerAmountLocal,
      currency: 'GBP',
      platformFeePct: 8,
      proofs: proofs.filter((p) => p.kind === 'interview_video' || p.kind === 'interview_audio'),
      timestamps: { created: new Date().toISOString() },
      escrowSim: {
        brandWallet: 75000,
        escrowHold: 0,
        donorPaid: 0,
        brandRefunded: 0,
        txRefs: [],
      },
      qc: { items: defaultQcChecklist() },
    }
    upsertLot(newLot)
    await appendAudit(
      alias.trim(),
      'lot.offer_locked_from_score',
      `Score ${score.total} (${score.scoreBand}) → ${score.tierLabel} → £${score.offerAmountLocal} GBP (${weightGrams}g · base £${score.baseAmountLocal}/kg × ${(weightGrams / 1000).toFixed(3)}kg × ${score.multiplier}). Local payout still simulated rail.`,
      newLot.lotId,
    )
    setLot(newLot)
    setStep('offer')
    setMsg(
      `Offer locked from donor score ${score.total}. Review breakdown, then accept with pre-cut proof.`,
    )
    onAudit()
  }

  async function submitPrecut() {
    if (!lot) return
    const need = proofs.filter((p) => p.kind === 'precut_video' || p.kind === 'precut_photo')
    if (need.length < 2) {
      setMsg('Upload pre-cut video + photo stubs before continuing.')
      return
    }
    const merged = [...lot.proofs]
    for (const n of need) {
      if (!merged.find((p) => p.kind === n.kind)) merged.push(n)
    }
    // Recompute score with precut present (cut still missing until later)
    const interview = lot.interview!
    const score = computeDonorScore({
      interview,
      lengthCm: lot.lengthCm,
      country: lot.country,
      proofs: merged,
      weightGrams: lot.weightGrams ?? DEFAULT_WEIGHT_GRAMS,
    })
    // Keep locked offer amount (already accepted tier); refresh breakdown for honesty/precut pts display
    let next: Lot = {
      ...lot,
      proofs: merged,
      donorScore: { ...score, offerAmountLocal: lot.offerAmountLocal, tier: lot.donorScore!.tier, tierLabel: lot.donorScore!.tierLabel, multiplier: lot.donorScore!.multiplier },
    }
    next = await acceptOffer(next, lot.alias)
    setLot(next)
    setProofs(merged)
    setStep('lot')
    setMsg('Lot ID issued. Escrow funded on accept (simulation).')
    onAudit()
  }

  async function submitCut() {
    if (!lot) return
    const cutVideo = proofs.find((p) => p.kind === 'cut_video')
    const seal = proofs.find((p) => p.kind === 'seal_photo')
    if (!cutVideo) {
      setMsg('Cut video is REQUIRED — cannot submit proof / ship without it.')
      return
    }
    if (!seal) {
      setMsg('Seal photo with lot ID is required.')
      return
    }
    const merged = [...lot.proofs]
    for (const c of [cutVideo, seal]) {
      if (!merged.find((p) => p.kind === c.kind)) merged.push(c)
    }
    const interview = lot.interview!
    const score = computeDonorScore({
      interview,
      lengthCm: lot.lengthCm,
      country: lot.country,
      proofs: merged,
      weightGrams: lot.weightGrams ?? DEFAULT_WEIGHT_GRAMS,
    })
    let next: Lot = {
      ...lot,
      proofs: merged,
      donorScore: {
        ...score,
        offerAmountLocal: lot.offerAmountLocal,
        tier: lot.donorScore?.tier ?? score.tier,
        tierLabel: lot.donorScore?.tierLabel ?? score.tierLabel,
        multiplier: lot.donorScore?.multiplier ?? score.multiplier,
      },
    }
    upsertLot(next)
    if (!hasRequiredCutVideo(next)) {
      setMsg('Cut video is REQUIRED — blocked.')
      return
    }
    try {
      next = await advanceState(
        next,
        'proof_submitted',
        lot.alias,
        'Cut video (required) + seal proof hashed and submitted',
      )
    } catch (e) {
      setMsg(String(e))
      return
    }
    setLot(next)
    setProofs(merged)
    setStep('ship')
    onAudit()
  }

  async function submitShip() {
    if (!lot || !tracking.trim()) {
      setMsg('Tracking number required.')
      return
    }
    if (!hasRequiredCutVideo(lot)) {
      setMsg('Cannot ship without cut video.')
      return
    }
    let next: Lot = { ...lot, trackingNumber: tracking.trim() }
    upsertLot(next)
    try {
      next = await advanceState(next, 'shipped', lot.alias, `Shipped with tracking ${tracking.trim()}`)
    } catch (e) {
      setMsg(String(e))
      return
    }
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
    setCountry(found.country)
    setLengthCm(found.lengthCm)
    setWeightGrams(found.weightGrams ?? DEFAULT_WEIGHT_GRAMS)
    if (found.interview) {
      setStatedAge(found.interview.statedAge)
      setChemicalKind(found.interview.chemicalKind)
      setChemicalStatement(found.interview.chemicalStatement)
      setEthnicityAncestry(found.interview.ethnicityAncestry)
      setEthnicityPublicOptIn(found.interview.ethnicityPublicOptIn)
      setTextureClass(found.interview.textureClass)
      setAndreWalkerType(found.interview.andreWalkerType || '')
    }
    if (found.escrowState === 'offered') setStep('offer')
    else if (found.escrowState === 'accepted') setStep('cut')
    else if (found.escrowState === 'proof_submitted') setStep('ship')
    else setStep('timeline')
    setMsg(`Resumed ${found.lotId}`)
  }

  return (
    <div className="view">
      <header className="view-head">
        <h2>Donor flow</h2>
        <p className="muted">
          Eligibility → structured interview → score/offer → pre-cut → lot ID → cut video (required) →
          tracking
        </p>
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
          <p className="muted small">
            Identity firewall: alias + OTP only — no legal name, passport, SSN, or DOB-as-ID.
          </p>
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
            <p className="warn">
              Myanmar is allowlisted but flagged <strong>high-risk</strong> — country score factor is
              capped lower, and Financial applies a ×0.85 rate haircut (£222.39/kg base vs £261.63).
            </p>
          )}

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
            Weight (grams) — planning ponytail mass for £ offer
            <input
              type="number"
              min={20}
              max={500}
              step={1}
              value={weightGrams}
              onChange={(e) => setWeightGrams(Math.max(1, Number(e.target.value) || DEFAULT_WEIGHT_GRAMS))}
            />
          </label>
          <p className="muted small">
            Default {DEFAULT_WEIGHT_GRAMS} g (0.1 kg). Offer = round(base £/kg × kg × tier). Local payout remains a
            simulated rail; UI shows planning GBP.
          </p>
          <label className="check">
            <input type="checkbox" checked={healthOk} onChange={(e) => setHealthOk(e.target.checked)} />
            Basic health OK to ship (no active scalp infection known)
          </label>

          {quizError && <p className="error">{quizError}</p>}
          <button type="button" className="btn primary" disabled={!quizReady} onClick={goInterview}>
            Continue to structured interview
          </button>
        </section>
      )}

      {step === 'interview' && (
        <section className="panel">
          <h3>2. Structured interview (before offer locked)</h3>
          <p className="muted">
            Product matching + score — not KYC. Stated age only (no date of birth as identity). Ethnicity
            for fiber matching; public card shows texture + region unless you opt in.
          </p>

          <div className="grid-2">
            <label>
              Stated age (number, must be ≥ 18)
              <input
                type="number"
                min={1}
                max={120}
                value={statedAge}
                onChange={(e) =>
                  setStatedAge(e.target.value === '' ? '' : Number(e.target.value))
                }
                placeholder="e.g. 28"
              />
            </label>
            <label>
              Age band (derived — not DOB)
              <input
                readOnly
                value={statedAge === '' ? '—' : toAgeBand(Number(statedAge))}
              />
            </label>
          </div>
          {statedAge !== '' && Number(statedAge) < 18 && (
            <p className="error">Under 18 — no offer (gate).</p>
          )}

          <label>
            Chemical near-virginity (template)
            <select
              value={chemicalKind}
              onChange={(e) => {
                const k = e.target.value as ChemicalHistoryKind
                setChemicalKind(k)
                setChemicalStatement(defaultChemicalStatement(k))
              }}
            >
              {(
                [
                  'near_virgin',
                  'heat_only',
                  'semi_permanent',
                  'previously_colored',
                  'previously_bleached',
                  'keratin_other',
                ] as ChemicalHistoryKind[]
              ).map((k) => (
                <option key={k} value={k}>
                  {chemicalKindLabel(k)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Chemical statement (verbatim for QC compare)
            <textarea
              rows={3}
              value={chemicalStatement}
              onChange={(e) => setChemicalStatement(e.target.value)}
            />
          </label>

          <div className="grid-2">
            <label>
              Ethnicity / ancestry (self-described — intake / brand)
              <input
                value={ethnicityAncestry}
                onChange={(e) => setEthnicityAncestry(e.target.value)}
                placeholder="e.g. Tamil, Khmer, Polish…"
              />
            </label>
            <label>
              Hair texture class
              <select
                value={textureClass}
                onChange={(e) => setTextureClass(e.target.value as TextureClass | '')}
              >
                <option value="">Select…</option>
                <option value="straight">Straight</option>
                <option value="wavy">Wavy</option>
                <option value="curly">Curly</option>
                <option value="coily">Coily</option>
              </select>
            </label>
          </div>
          <label>
            Andre Walker–style type (optional)
            <input
              value={andreWalkerType}
              onChange={(e) => setAndreWalkerType(e.target.value)}
              placeholder="e.g. 1B, 2A, 3C"
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={ethnicityPublicOptIn}
              onChange={(e) => setEthnicityPublicOptIn(e.target.checked)}
            />
            Opt in: show raw ethnicity on public provenance (default off — texture + region only)
          </label>

          <h4>Interview media (optional but preferred)</h4>
          <p className="muted small">
            Short video or audio interview scores honesty/completeness bonus when hashed as{' '}
            <code>interview_video</code> / <code>interview_audio</code>.
          </p>
          <FileProofUpload
            kind="interview_video"
            label="Interview video (preferred)"
            onHashed={addProof}
          />
          <FileProofUpload
            kind="interview_audio"
            label="Interview audio (alternative)"
            accept="audio/*,video/*"
            onHashed={addProof}
          />

          {liveScore && (
            <div className="score-box">
              <h4>
                Live donor score preview:{' '}
                <strong>
                  {liveScore.gated ? '—' : liveScore.total}/100
                </strong>{' '}
                · {liveScore.tierLabel}
              </h4>
              {countryInfo?.highRisk && (
                <p className="warn">High-risk country — country factor capped lower.</p>
              )}
              <ul className="score-breakdown">
                {liveScore.breakdown.map((b) => (
                  <li key={b.factor}>
                    <span>
                      {b.factor}{' '}
                      <em>
                        {b.points}/{b.max || 'gate'}
                      </em>
                    </span>
                    <span className="muted small">{b.note}</span>
                  </li>
                ))}
              </ul>
              {!liveScore.gated && liveScore.tier !== 'none' && countryInfo && (
                <p className="offer-box">
                  Projected offer if locked now:{' '}
                  <strong>£{liveScore.offerAmountLocal.toFixed(2)}</strong>{' '}
                  (base £{liveScore.baseAmountLocal}/kg × {(weightGrams / 1000).toFixed(3)} kg ×{' '}
                  {liveScore.multiplier}). Escrow funds only on accept; pays only on QC pass. Local
                  payout is a simulated rail — this sim shows planning £.
                </p>
              )}
            </div>
          )}

          {interviewError && <p className="error">{interviewError}</p>}
          <div className="row">
            <button type="button" className="btn ghost" onClick={() => setStep('quiz')}>
              Back
            </button>
            <button type="button" className="btn primary" onClick={lockOffer}>
              Lock offer from score
            </button>
          </div>
        </section>
      )}

      {step === 'offer' && lot?.donorScore && (
        <section className="panel">
          <h3>3. Score → tier → offer (review before accept)</h3>
          <p>
            Lot draft <code>{lot.lotId}</code> · Score{' '}
            <strong>{lot.donorScore.total}</strong> ({lot.donorScore.scoreBand}) →{' '}
            <strong>{lot.donorScore.tierLabel}</strong>
          </p>
          <ul className="score-breakdown">
            {lot.donorScore.breakdown.map((b) => (
              <li key={b.factor}>
                <span>
                  {b.factor}:{' '}
                  <strong>
                    {b.points}/{b.max || 'gate'}
                  </strong>
                </span>
                <span className="muted small">{b.note}</span>
              </li>
            ))}
          </ul>
          <p className="offer-box">
            Locked offer:{' '}
            <strong>£{lot.offerAmountLocal.toFixed(2)}</strong> GBP ({lot.weightGrams ?? DEFAULT_WEIGHT_GRAMS}{' '}
            g · base £{lot.donorScore.baseAmountLocal}/kg × tier {lot.donorScore.multiplier}). 8% platform
            fee disclosed. QC fail can still zero out pay regardless of score. Local payout = simulated
            rail.
          </p>
          {COUNTRIES[lot.country].highRisk && (
            <p className="warn">Myanmar / high-risk corridor badge — elevated intake review.</p>
          )}
          <button type="button" className="btn primary" onClick={() => setStep('precut')}>
            Continue to pre-cut proof &amp; accept
          </button>
        </section>
      )}

      {step === 'precut' && lot && (
        <section className="panel">
          <h3>4. Pre-cut proof pack</h3>
          <p className="muted">
            Evidence only — never trust claim alone. Face optional / privacy mode OK if scalp + length
            clear.
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
          <h3>5. Lot ID issued</h3>
          <p className="lot-hero">
            <code>{lot.lotId}</code>
          </p>
          <p>
            Escrow state: <span className={`pill state-${lot.escrowState}`}>{lot.escrowState}</span>
            {lot.donorScore && (
              <>
                {' '}
                · Score band <span className="pill">{lot.donorScore.scoreBand}</span>
              </>
            )}
          </p>
          <p className="muted">
            SIMULATION: brand funded £{lot.offerAmountLocal.toFixed(2)} GBP into escrow hold. Print/affix
            lot ID on sealed bag. Next: cut video is <strong>required</strong>. Local payout remains a
            simulated rail.
          </p>
          <StatusTimeline state={lot.escrowState} />
          <button type="button" className="btn primary" onClick={() => setStep('cut')}>
            Continue to cut proof
          </button>
        </section>
      )}

      {step === 'cut' && lot && (
        <section className="panel">
          <h3>6. Cut proof — cut video REQUIRED</h3>
          <p className="warn">
            Without cut video you cannot reach <code>proof_submitted</code> or ship.
          </p>
          <FileProofUpload
            kind="cut_video"
            label="Short video of the cut (REQUIRED)"
            onHashed={addProof}
          />
          <FileProofUpload
            kind="seal_photo"
            label="Sealed bag with lot ID sticker photo (required to ship)"
            onHashed={addProof}
          />
          <button type="button" className="btn primary" onClick={submitCut}>
            Submit cut proof
          </button>
        </section>
      )}

      {step === 'ship' && lot && (
        <section className="panel">
          <h3>7. Ship + tracking</h3>
          <label>
            Tracking number (required)
            <input
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="e.g. RR123456789IN"
            />
          </label>
          <button type="button" className="btn primary" onClick={submitShip}>
            Mark shipped
          </button>
        </section>
      )}

      {step === 'timeline' && lot && (
        <section className="panel">
          <h3>8. Status timeline</h3>
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
              <li>
                Hold: £{lot.escrowSim.escrowHold} GBP
              </li>
              <li>
                Donor paid: £{lot.escrowSim.donorPaid} GBP
              </li>
              <li>
                Brand refunded: £{lot.escrowSim.brandRefunded} GBP
              </li>
            </ul>
            <p className="muted small">
              Paid only on QC pass. No cash-on-ship. Amounts are planning £; local payout is a simulated
              rail.
            </p>
          </div>
          <ProvenanceCard lot={lot} />
        </section>
      )}
    </div>
  )
}
