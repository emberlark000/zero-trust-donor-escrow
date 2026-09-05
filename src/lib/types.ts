/** Escrow state machine — pay only on qc_pass. */
export type EscrowState =
  | 'offered'
  | 'accepted'
  | 'proof_submitted'
  | 'shipped'
  | 'received'
  | 'qc_pass'
  | 'qc_fail'
  | 'paid'
  | 'refunded'
  | 'disputed'

export type CountryCode = 'IN' | 'KH' | 'MM' | 'PL' | 'BR' | 'PE' | 'VN'

export interface ProofFileMeta {
  name: string
  size: number
  type: string
  sha256: string
  uploadedAt: string
  kind: 'precut_video' | 'precut_photo' | 'cut_video' | 'seal_photo' | 'received_photo' | 'other'
}

export interface QcChecklistItem {
  id: string
  label: string
  critical: boolean
  pass: boolean | null
}

export interface DualControlOverride {
  reviewerA: string
  reviewerB: string
  reason: string
  at: string
}

export interface Lot {
  lotId: string
  alias: string
  contact: string /** email or phone — OTP mock only */
  country: CountryCode
  lengthCm: number
  virgin: boolean
  age18Plus: boolean
  chemicalHistory: string
  escrowState: EscrowState
  offerAmountLocal: number
  currency: string
  platformFeePct: number
  fundedAt?: string
  trackingNumber?: string
  proofs: ProofFileMeta[]
  qc?: {
    items: QcChecklistItem[]
    decidedAt?: string
    decidedBy?: string
    override?: DualControlOverride
  }
  timestamps: {
    created: string
    accepted?: string
    proofSubmitted?: string
    shipped?: string
    received?: string
    qcDecided?: string
    paidOrRefunded?: string
  }
  escrowSim: {
    brandWallet: number
    escrowHold: number
    donorPaid: number
    brandRefunded: number
    txRefs: string[]
  }
}

export interface AuditEntry {
  id: string
  at: string
  actor: string
  action: string
  lotId?: string
  detail: string
  prevHash: string
  entryHash: string
}

export type Role = 'donor' | 'intake' | 'public'
