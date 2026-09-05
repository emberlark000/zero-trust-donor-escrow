import type {
  ChemicalHistoryKind,
  CountryCode,
  DonorInterview,
  DonorScoreResult,
  OfferTier,
  ProofFileMeta,
  ScoreBreakdownLine,
} from './types'
import { COUNTRIES } from './countries'

/**
 * GBP planning base £/kg by country (Financial 2026-09-05).
 * IN/KH/PL = 261.63; MM = 222.39 (×0.85 ops/risk haircut).
 * Tiers multiply 1.0 / 1.25 / 1.5 / 1.8 on country base.
 */
export const BASE_GBP_PER_KG: Record<string, number> = {
  IN: 261.63,
  KH: 261.63,
  PL: 261.63,
  MM: 222.39,
}

/** Default planning ponytail weight when donor has not entered grams. */
export const DEFAULT_WEIGHT_GRAMS = 100

/** @deprecated Use BASE_GBP_PER_KG — kept as alias for any stray imports. */
export const BASE_OFFER_BY_COUNTRY = BASE_GBP_PER_KG

export function gramsToKg(weightGrams: number): number {
  return Math.max(0, weightGrams) / 1000
}

/** offerAmount = round(base£/kg × estimatedKg × tierMultiplier, 2) */
export function computeOfferGbp(
  country: string,
  weightGrams: number,
  tierMultiplier: number,
): { basePerKg: number; estimatedKg: number; offerAmount: number } {
  const basePerKg = BASE_GBP_PER_KG[country] ?? 261.63
  const estimatedKg = gramsToKg(weightGrams)
  const offerAmount =
    tierMultiplier <= 0
      ? 0
      : Math.round(basePerKg * estimatedKg * tierMultiplier * 100) / 100
  return { basePerKg, estimatedKg, offerAmount }
}

/** Country risk points 0–20. MM capped lower (high-risk). */
export const COUNTRY_RISK_POINTS: Record<CountryCode, number> = {
  IN: 18, // temple-culture individual donor — higher
  PL: 18, // scarce E. Europe — higher
  KH: 12, // medium
  MM: 6, // capped lower (high-risk corridor)
  BR: 0,
  PE: 0,
  VN: 0,
}

export const SCORE_WEIGHTS = {
  chemicalNearVirgin: 30,
  chemicalHonestyReserved: 10,
  cutVideo: 15,
  precutVideo: 10,
  sealPhoto: 5,
  ethnicityTexture: 10,
  countryRisk: 20,
  lengthBand: 10,
} as const

function ageBand(age: number): string {
  if (age < 18) return 'under_18'
  if (age <= 24) return '18-24'
  if (age <= 34) return '25-34'
  if (age <= 44) return '35-44'
  if (age <= 54) return '45-54'
  return '55+'
}

export function toAgeBand(age: number): string {
  return ageBand(age)
}

function chemicalPoints(kind: ChemicalHistoryKind): { points: number; note: string } {
  switch (kind) {
    case 'near_virgin':
      return { points: 30, note: 'Near-virgin (no bleach, no permanent color)' }
    case 'heat_only':
      return { points: 24, note: 'Heat styling only — disclosed; still high if honest' }
    case 'semi_permanent':
      return { points: 16, note: 'Semi-permanent disclosed honestly' }
    case 'previously_colored':
      return { points: 8, note: 'Previously colored — lower near-virgin score' }
    case 'previously_bleached':
      return { points: 0, note: 'Previously bleached — not near-virgin' }
    case 'keratin_other':
      return { points: 6, note: 'Keratin / other chemical — disclosed' }
    default:
      return { points: 0, note: 'Unknown chemical history' }
  }
}

function lengthPoints(cm: number): { points: number; note: string } {
  if (cm >= 70) return { points: 10, note: '≥70 cm rare length' }
  if (cm >= 60) return { points: 8, note: '≥60 cm' }
  if (cm >= 50) return { points: 5, note: '≥50 cm' }
  if (cm >= 40) return { points: 2, note: '≥40 cm' }
  return { points: 0, note: 'Under 40 cm' }
}

function hasKind(proofs: ProofFileMeta[], kind: ProofFileMeta['kind']): boolean {
  return proofs.some((p) => p.kind === kind)
}

function tierFromScore(total: number): {
  tier: OfferTier
  tierLabel: string
  multiplier: number
  scoreBand: string
} {
  if (total < 50) return { tier: 'none', tierLabel: 'No offer', multiplier: 0, scoreBand: '<50' }
  if (total <= 64) return { tier: 'base', tierLabel: 'Base tier', multiplier: 1, scoreBand: '50–64' }
  if (total <= 79) return { tier: 'mid', tierLabel: 'Mid tier (+25%)', multiplier: 1.25, scoreBand: '65–79' }
  if (total <= 89) return { tier: 'high', tierLabel: 'High tier (+50%)', multiplier: 1.5, scoreBand: '80–89' }
  return { tier: 'top', tierLabel: 'Top tier (+80%)', multiplier: 1.8, scoreBand: '90–100' }
}

export interface ScoreInput {
  interview: DonorInterview
  lengthCm: number
  country: CountryCode
  proofs: ProofFileMeta[]
  /** Donor-entered ponytail weight in grams (default 100 g planning weight). */
  weightGrams?: number
  /** When locking offer before cut, pass false so cut/seal don't inflate pre-accept score display incorrectly — still required later. */
  requireCutForScore?: boolean
}

/**
 * Donor score 0–100. Age ≥ 18 is a hard gate (no offer).
 * Cut video is required for proof_submitted; when scoring pre-offer, cut may be absent
 * (points 0) but ethnicity/chemical/age must be complete.
 */
export function computeDonorScore(input: ScoreInput): DonorScoreResult {
  const { interview, lengthCm, country, proofs } = input
  const weightGrams =
    input.weightGrams != null && input.weightGrams > 0
      ? input.weightGrams
      : DEFAULT_WEIGHT_GRAMS
  const breakdown: ScoreBreakdownLine[] = []
  const { basePerKg } = computeOfferGbp(country, weightGrams, 1)
  const base = basePerKg

  if (!interview.statedAge || interview.statedAge < 18) {
    return {
      total: 0,
      gated: true,
      gateReason: 'Age must be ≥ 18 (statement). No offer.',
      breakdown: [
        {
          factor: 'Age ≥ 18',
          points: 0,
          max: 0,
          note: 'Gate failed — under 18 or missing',
        },
      ],
      tier: 'none',
      tierLabel: 'No offer',
      multiplier: 0,
      offerAmountLocal: 0,
      baseAmountLocal: base,
      scoreBand: 'gated',
      weightGrams,
    }
  }

  breakdown.push({
    factor: 'Age ≥ 18 (statement)',
    points: 0,
    max: 0,
    note: `Stated age ${interview.statedAge} · band ${interview.ageBand || ageBand(interview.statedAge)} — gate passed (not DOB-as-ID)`,
  })

  const chem = chemicalPoints(interview.chemicalKind)
  breakdown.push({
    factor: 'Chemical near-virginity',
    points: chem.points,
    max: SCORE_WEIGHTS.chemicalNearVirgin,
    note: chem.note,
  })

  // Honesty reserved — awarded when interview media present (preferred) as completeness bonus proxy
  const hasInterviewMedia =
    hasKind(proofs, 'interview_video') || hasKind(proofs, 'interview_audio')
  const honestyPts = hasInterviewMedia ? SCORE_WEIGHTS.chemicalHonestyReserved : 0
  breakdown.push({
    factor: 'Honesty / interview media',
    points: honestyPts,
    max: SCORE_WEIGHTS.chemicalHonestyReserved,
    note: hasInterviewMedia
      ? 'Interview media hashed — honesty/completeness bonus'
      : 'No interview media yet (optional but preferred; QC may still claw back)',
  })

  const cutOk = hasKind(proofs, 'cut_video')
  breakdown.push({
    factor: 'Cut video + hash',
    points: cutOk ? SCORE_WEIGHTS.cutVideo : 0,
    max: SCORE_WEIGHTS.cutVideo,
    note: cutOk
      ? 'Cut video present'
      : 'Required before proof_submitted — 0 pts until uploaded (hard block to ship)',
  })

  const precutOk = hasKind(proofs, 'precut_video')
  breakdown.push({
    factor: 'Pre-cut video + length proof',
    points: precutOk ? SCORE_WEIGHTS.precutVideo : 0,
    max: SCORE_WEIGHTS.precutVideo,
    note: precutOk ? 'Pre-cut video present' : 'Required — missing',
  })

  const sealOk = hasKind(proofs, 'seal_photo')
  breakdown.push({
    factor: 'Seal photo with lot ID',
    points: sealOk ? SCORE_WEIGHTS.sealPhoto : 0,
    max: SCORE_WEIGHTS.sealPhoto,
    note: sealOk ? 'Seal photo present' : 'Required to ship — missing until cut step',
  })

  const ethOk =
    !!interview.ethnicityAncestry.trim() &&
    !!interview.textureClass &&
    !!interview.countryOfOrigin
  breakdown.push({
    factor: 'Ethnicity + texture fields',
    points: ethOk ? SCORE_WEIGHTS.ethnicityTexture : 0,
    max: SCORE_WEIGHTS.ethnicityTexture,
    note: ethOk
      ? `Texture ${interview.textureClass}; origin ${interview.countryOfOrigin} (product matching, not KYC)`
      : 'Required for offer — incomplete',
  })

  const countryPts = Math.min(
    SCORE_WEIGHTS.countryRisk,
    COUNTRY_RISK_POINTS[country] ?? 0,
  )
  const cInfo = COUNTRIES[country]
  breakdown.push({
    factor: 'Country risk',
    points: countryPts,
    max: SCORE_WEIGHTS.countryRisk,
    note: cInfo.highRisk
      ? `${cInfo.name}: high-risk — country factor capped lower (${countryPts}/${SCORE_WEIGHTS.countryRisk})`
      : `${cInfo.name}: ${countryPts}/${SCORE_WEIGHTS.countryRisk}`,
  })

  const len = lengthPoints(lengthCm)
  breakdown.push({
    factor: 'Length band',
    points: len.points,
    max: SCORE_WEIGHTS.lengthBand,
    note: len.note,
  })

  let total = breakdown.reduce((s, b) => s + b.points, 0)
  total = Math.min(100, Math.max(0, total))

  if (!ethOk || !interview.chemicalStatement.trim()) {
    return {
      total,
      gated: true,
      gateReason: 'Interview incomplete: need chemical statement, ethnicity + texture for an offer.',
      breakdown,
      tier: 'none',
      tierLabel: 'No offer',
      multiplier: 0,
      offerAmountLocal: 0,
      baseAmountLocal: base,
      scoreBand: 'incomplete',
      weightGrams,
    }
  }

  const { tier, tierLabel, multiplier, scoreBand } = tierFromScore(total)
  const { offerAmount: offerAmountLocal } = computeOfferGbp(
    country,
    weightGrams,
    tier === 'none' ? 0 : multiplier,
  )

  return {
    total,
    gated: false,
    breakdown,
    tier,
    tierLabel,
    multiplier,
    offerAmountLocal,
    baseAmountLocal: base,
    scoreBand,
    weightGrams,
  }
}

export function chemicalKindLabel(kind: ChemicalHistoryKind): string {
  const map: Record<ChemicalHistoryKind, string> = {
    near_virgin: 'Near-virgin (no bleach / no permanent color)',
    heat_only: 'Heat styling only',
    semi_permanent: 'Previously semi-permanent color',
    previously_colored: 'Previously permanently colored',
    previously_bleached: 'Previously bleached',
    keratin_other: 'Keratin or other chemical',
  }
  return map[kind]
}

export function defaultChemicalStatement(kind: ChemicalHistoryKind): string {
  return `I state my hair chemical history as: ${chemicalKindLabel(kind)}. Near-virgin means no bleach and no permanent color.`
}
