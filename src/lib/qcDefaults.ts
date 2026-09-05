import type { QcChecklistItem } from './types'

/** Intake QC checklist — fail any critical → qc_fail. */
export function defaultQcChecklist(): QcChecklistItem[] {
  return [
    { id: 'cuticle', label: 'Single cuticle direction / aligned cut feel', critical: true, pass: null },
    { id: 'length', label: 'Length distribution matches pre-cut proof', critical: true, pass: null },
    { id: 'weight', label: 'Weight vs expected for length/density', critical: true, pass: null },
    { id: 'chemical', label: 'No strong chemical odor; porosity spot OK', critical: true, pass: null },
    {
      id: 'chemical_statement',
      label: 'Chemical signs consistent with donor near-virginity statement',
      critical: true,
      pass: null,
    },
    {
      id: 'texture_match',
      label:
        'Texture expectations not wildly mismatched (fraud flag only — e.g. synthetic / wrong fiber)',
      critical: true,
      pass: null,
    },
    { id: 'seal', label: 'Bag seal + lot ID match', critical: true, pass: null },
    { id: 'tracking', label: 'Tracking number match', critical: true, pass: null },
    { id: 'no_waste', label: 'No shed/comb waste / mixed dump', critical: true, pass: null },
    { id: 'human', label: 'Human hair (not synthetic/animal)', critical: true, pass: null },
    { id: 'mold_lice', label: 'No mold / lice', critical: true, pass: null },
    { id: 'photo_hash', label: 'Received-hair photo hash stored', critical: false, pass: null },
  ]
}
