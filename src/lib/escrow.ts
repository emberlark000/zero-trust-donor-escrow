import type { DualControlOverride, EscrowState, Lot, QcChecklistItem } from './types'
import { appendAudit } from './audit'
import { simTxRef, upsertLot } from './storage'

/** Valid forward transitions (disputed can branch from several late states). */
const TRANSITIONS: Partial<Record<EscrowState, EscrowState[]>> = {
  offered: ['accepted'],
  accepted: ['proof_submitted'],
  proof_submitted: ['shipped'],
  shipped: ['received'],
  received: ['qc_pass', 'qc_fail'],
  qc_pass: ['paid', 'disputed'],
  qc_fail: ['refunded', 'disputed', 'qc_pass'], // qc_pass only via dual-control override
  paid: ['disputed'],
  refunded: ['disputed'],
  disputed: ['qc_pass', 'qc_fail', 'paid', 'refunded'],
}

export function canTransition(from: EscrowState, to: EscrowState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

export function hasRequiredCutVideo(lot: Lot): boolean {
  return lot.proofs.some((p) => p.kind === 'cut_video' && !!p.sha256)
}

export function hasRequiredSealPhoto(lot: Lot): boolean {
  return lot.proofs.some((p) => p.kind === 'seal_photo' && !!p.sha256)
}

/**
 * Brand funds escrow on accept (simulation).
 * Release to donor ONLY on qc_pass → paid.
 * Refund to brand on qc_fail → refunded.
 */
export async function acceptOffer(lot: Lot, actor: string): Promise<Lot> {
  if (lot.escrowState !== 'offered') throw new Error('Offer not in offered state')
  if (!lot.donorScore || lot.donorScore.gated || lot.donorScore.tier === 'none') {
    throw new Error('Cannot accept: no valid donor-score offer')
  }
  if (lot.offerAmountLocal <= 0) throw new Error('Cannot accept: offer amount is zero')
  const fee = Math.round(lot.offerAmountLocal * (lot.platformFeePct / 100) * 100) / 100
  const hold = lot.offerAmountLocal
  const next: Lot = {
    ...lot,
    escrowState: 'accepted',
    fundedAt: new Date().toISOString(),
    timestamps: { ...lot.timestamps, accepted: new Date().toISOString() },
    escrowSim: {
      ...lot.escrowSim,
      brandWallet: lot.escrowSim.brandWallet - hold,
      escrowHold: hold,
      txRefs: [
        ...lot.escrowSim.txRefs,
        simTxRef('FUND'),
        `SIM-FEE-DISCLOSED:${fee}${lot.currency}`,
      ],
    },
  }
  upsertLot(next)
  await appendAudit(
    actor,
    'escrow.fund_on_accept',
    `SIMULATION: brand funded escrow ${hold} ${lot.currency} (platform fee disclosed ${fee}). Score ${lot.donorScore.total} → ${lot.donorScore.tierLabel}. Hold until QC pass.`,
    lot.lotId,
  )
  return next
}

export async function advanceState(
  lot: Lot,
  to: EscrowState,
  actor: string,
  detail: string,
): Promise<Lot> {
  if (!canTransition(lot.escrowState, to)) {
    throw new Error(`Illegal transition ${lot.escrowState} → ${to}`)
  }
  // Hard block: cut video required for proof_submitted / ship path
  if (to === 'proof_submitted' && !hasRequiredCutVideo(lot)) {
    throw new Error('Cut video is REQUIRED — cannot reach proof_submitted without cut video hash')
  }
  if (to === 'shipped') {
    if (!hasRequiredCutVideo(lot)) {
      throw new Error('Cannot ship without cut video proof')
    }
    if (!hasRequiredSealPhoto(lot)) {
      throw new Error('Cannot ship without seal photo')
    }
  }

  const ts = new Date().toISOString()
  const timestamps = { ...lot.timestamps }
  if (to === 'proof_submitted') timestamps.proofSubmitted = ts
  if (to === 'shipped') timestamps.shipped = ts
  if (to === 'received') timestamps.received = ts
  if (to === 'qc_pass' || to === 'qc_fail') timestamps.qcDecided = ts
  if (to === 'paid' || to === 'refunded') timestamps.paidOrRefunded = ts

  const next: Lot = { ...lot, escrowState: to, timestamps }
  upsertLot(next)
  await appendAudit(actor, `escrow.transition.${to}`, detail, lot.lotId)
  return next
}

export function evaluateQc(items: QcChecklistItem[]): 'qc_pass' | 'qc_fail' {
  const criticalFail = items.some((i) => i.critical && i.pass === false)
  const incomplete = items.some((i) => i.pass === null)
  if (incomplete) throw new Error('QC checklist incomplete')
  return criticalFail ? 'qc_fail' : 'qc_pass'
}

/** Release escrow to donor — only after qc_pass. */
export async function releasePayment(lot: Lot, actor: string): Promise<Lot> {
  if (lot.escrowState !== 'qc_pass') {
    throw new Error('Cannot release: escrow requires qc_pass')
  }
  const hold = lot.escrowSim.escrowHold
  const next: Lot = {
    ...lot,
    escrowState: 'paid',
    timestamps: { ...lot.timestamps, paidOrRefunded: new Date().toISOString() },
    escrowSim: {
      ...lot.escrowSim,
      escrowHold: 0,
      donorPaid: lot.escrowSim.donorPaid + hold,
      txRefs: [...lot.escrowSim.txRefs, simTxRef('RELEASE')],
    },
  }
  upsertLot(next)
  await appendAudit(
    actor,
    'escrow.release_to_donor',
    `SIMULATION: released ${hold} ${lot.currency} to donor payout rail after qc_pass.`,
    lot.lotId,
  )
  return next
}

/** Refund brand on qc_fail. */
export async function refundBrand(lot: Lot, actor: string): Promise<Lot> {
  if (lot.escrowState !== 'qc_fail') {
    throw new Error('Cannot refund: expected qc_fail')
  }
  const hold = lot.escrowSim.escrowHold
  const next: Lot = {
    ...lot,
    escrowState: 'refunded',
    timestamps: { ...lot.timestamps, paidOrRefunded: new Date().toISOString() },
    escrowSim: {
      ...lot.escrowSim,
      escrowHold: 0,
      brandWallet: lot.escrowSim.brandWallet + hold,
      brandRefunded: lot.escrowSim.brandRefunded + hold,
      txRefs: [...lot.escrowSim.txRefs, simTxRef('REFUND')],
    },
  }
  upsertLot(next)
  await appendAudit(
    actor,
    'escrow.refund_to_brand',
    `SIMULATION: refunded ${hold} ${lot.currency} to brand after qc_fail.`,
    lot.lotId,
  )
  return next
}

/**
 * Dual-control override: qc_fail → qc_pass.
 * Requires two distinct reviewer aliases + reason; fully logged.
 */
export async function dualControlOverrideToPass(
  lot: Lot,
  override: DualControlOverride,
): Promise<Lot> {
  if (lot.escrowState !== 'qc_fail' && lot.escrowState !== 'disputed') {
    throw new Error('Override only from qc_fail or disputed')
  }
  if (!override.reviewerA.trim() || !override.reviewerB.trim()) {
    throw new Error('Two reviewers required')
  }
  if (override.reviewerA.trim().toLowerCase() === override.reviewerB.trim().toLowerCase()) {
    throw new Error('Reviewers must be distinct (dual control)')
  }
  if (!override.reason.trim()) throw new Error('Override reason required')

  const next: Lot = {
    ...lot,
    escrowState: 'qc_pass',
    timestamps: { ...lot.timestamps, qcDecided: override.at },
    qc: {
      ...(lot.qc ?? { items: [] }),
      items: lot.qc?.items ?? [],
      decidedAt: override.at,
      decidedBy: `${override.reviewerA}+${override.reviewerB}`,
      override,
    },
  }
  upsertLot(next)
  await appendAudit(
    `${override.reviewerA}|${override.reviewerB}`,
    'qc.dual_control_override_fail_to_pass',
    `DUAL-CONTROL OVERRIDE logged. Reason: ${override.reason}. Funds still held until explicit release.`,
    lot.lotId,
  )
  return next
}
