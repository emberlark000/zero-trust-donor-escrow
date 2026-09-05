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

export type ChemicalHistoryKind =
  | 'near_virgin'
  | 'heat_only'
  | 'semi_permanent'
  | 'previously_colored'
  | 'previously_bleached'
  | 'keratin_other'

export type TextureClass = 'straight' | 'wavy' | 'curly' | 'coily'

export type OfferTier = 'none' | 'base' | 'mid' | 'high' | 'top'

export interface ProofFileMeta {
  name: string
  size: number
  type: string
  sha256: string
  uploadedAt: string
  kind:
    | 'precut_video'
    | 'precut_photo'
    | 'cut_video'
    | 'seal_photo'
    | 'received_photo'
    | 'interview_video'
    | 'interview_audio'
    | 'other'
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

/** Structured interview — product matching, not KYC. No DOB-as-ID. */
export interface DonorInterview {
  statedAge: number
  ageBand: string
  chemicalKind: ChemicalHistoryKind
  chemicalStatement: string
  countryOfOrigin: CountryCode
  ethnicityAncestry: string
  ethnicityPublicOptIn: boolean
  textureClass: TextureClass
  andreWalkerType?: string
}

export interface ScoreBreakdownLine {
  factor: string
  points: number
  max: number
  note: string
}

export interface DonorScoreResult {
  total: number
  gated: boolean
  gateReason?: string
  breakdown: ScoreBreakdownLine[]
  tier: OfferTier
  tierLabel: string
  multiplier: number
  offerAmountLocal: number
  baseAmountLocal: number
  scoreBand: string
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
  interview?: DonorInterview
  donorScore?: DonorScoreResult
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
