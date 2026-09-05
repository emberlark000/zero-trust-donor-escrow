import type { Lot } from './types'

const LOTS_KEY = 'zt_donor_escrow_lots_v1'

export function loadLots(): Lot[] {
  try {
    const raw = localStorage.getItem(LOTS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Lot[]
  } catch {
    return []
  }
}

export function saveLots(lots: Lot[]): void {
  localStorage.setItem(LOTS_KEY, JSON.stringify(lots))
}

export function getLot(lotId: string): Lot | undefined {
  return loadLots().find((l) => l.lotId === lotId)
}

export function upsertLot(lot: Lot): void {
  const lots = loadLots()
  const i = lots.findIndex((l) => l.lotId === lot.lotId)
  if (i >= 0) lots[i] = lot
  else lots.push(lot)
  saveLots(lots)
}

export function clearLotsForDemo(): void {
  localStorage.removeItem(LOTS_KEY)
}

export function mintLotId(country: string): string {
  const ts = Date.now().toString(36).toUpperCase()
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `LOT-${country}-${ts}-${rnd}`
}

export function simTxRef(kind: string): string {
  return `SIM-${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}
