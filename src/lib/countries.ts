import type { CountryCode } from './types'

export interface CountryInfo {
  code: CountryCode
  name: string
  allowlisted: boolean
  highRisk: boolean
  /** Relative country-risk score points (0–20). MM capped lower. */
  riskPoints: number
  currency: string
  payoutHint: string
  rejectReason?: string
}

/** Allowlist for this ticket: IN, KH, MM (high-risk), PL. Reject BR/PE/VN. */
export const COUNTRIES: Record<CountryCode, CountryInfo> = {
  IN: {
    code: 'IN',
    name: 'India',
    allowlisted: true,
    highRisk: false,
    riskPoints: 18,
    currency: 'GBP',
    payoutHint: 'Planning £ — local INR payout via simulated rail',
  },
  KH: {
    code: 'KH',
    name: 'Cambodia',
    allowlisted: true,
    highRisk: false,
    riskPoints: 12,
    currency: 'GBP',
    payoutHint: 'Planning £ — local USD/KHR payout via simulated rail',
  },
  MM: {
    code: 'MM',
    name: 'Myanmar',
    allowlisted: true,
    highRisk: true,
    riskPoints: 6,
    currency: 'GBP',
    payoutHint: 'Planning £ — local MMK payout via simulated rail — HIGH OPERATIONAL RISK',
  },
  PL: {
    code: 'PL',
    name: 'Poland (E. Europe placeholder)',
    allowlisted: true,
    highRisk: false,
    riskPoints: 18,
    currency: 'GBP',
    payoutHint: 'Planning £ — local PLN payout via simulated rail',
  },
  BR: {
    code: 'BR',
    name: 'Brazil',
    allowlisted: false,
    highRisk: false,
    riskPoints: 0,
    currency: 'BRL',
    payoutHint: 'n/a',
    rejectReason: 'Texture-label geography — not a real origin target for this ticket',
  },
  PE: {
    code: 'PE',
    name: 'Peru',
    allowlisted: false,
    highRisk: false,
    riskPoints: 0,
    currency: 'PEN',
    payoutHint: 'n/a',
    rejectReason: 'Marketing category — not a documented donor basin for this ticket',
  },
  VN: {
    code: 'VN',
    name: 'Vietnam',
    allowlisted: false,
    highRisk: false,
    riskPoints: 0,
    currency: 'VND',
    payoutHint: 'n/a',
    rejectReason: 'Out of scope for this ticket (no Vietnam path)',
  },
}

export const ALLOWLIST: CountryCode[] = ['IN', 'KH', 'MM', 'PL']
export const REJECT_DEMO: CountryCode[] = ['BR', 'PE', 'VN']

export function isAllowlisted(code: CountryCode): boolean {
  return COUNTRIES[code]?.allowlisted === true
}
