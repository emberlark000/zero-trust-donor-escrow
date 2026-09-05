import type { EscrowState } from '../lib/types'

const ORDER: EscrowState[] = [
  'offered',
  'accepted',
  'proof_submitted',
  'shipped',
  'received',
  'qc_pass',
  'qc_fail',
  'paid',
  'refunded',
  'disputed',
]

const LABELS: Record<EscrowState, string> = {
  offered: 'Offered',
  accepted: 'Accepted (escrow funded)',
  proof_submitted: 'Proof submitted',
  shipped: 'Shipped',
  received: 'Received',
  qc_pass: 'QC pass',
  qc_fail: 'QC fail',
  paid: 'Paid (donor)',
  refunded: 'Refunded (brand)',
  disputed: 'Disputed',
}

export function StatusTimeline({ state }: { state: EscrowState }) {
  const mainPath: EscrowState[] = [
    'offered',
    'accepted',
    'proof_submitted',
    'shipped',
    'received',
  ]
  const idx = ORDER.indexOf(state)
  const mainIdx =
    state === 'qc_pass' || state === 'qc_fail' || state === 'paid' || state === 'refunded' || state === 'disputed'
      ? mainPath.length
      : Math.min(idx, mainPath.length - 1)

  return (
    <ol className="timeline">
      {mainPath.map((s, i) => {
        const done = i < mainIdx || (i === mainIdx && mainPath.includes(state) && i === idx)
        const current = s === state
        return (
          <li key={s} className={current ? 'current' : done || i < mainIdx ? 'done' : ''}>
            <span className="dot" />
            <span>{LABELS[s]}</span>
          </li>
        )
      })}
      {(state === 'qc_pass' || state === 'paid') && (
        <li className={state === 'qc_pass' ? 'current pass' : 'done pass'}>
          <span className="dot" />
          <span>{LABELS.qc_pass}</span>
        </li>
      )}
      {state === 'paid' && (
        <li className="current pass">
          <span className="dot" />
          <span>{LABELS.paid}</span>
        </li>
      )}
      {(state === 'qc_fail' || state === 'refunded') && (
        <li className={state === 'qc_fail' ? 'current fail' : 'done fail'}>
          <span className="dot" />
          <span>{LABELS.qc_fail}</span>
        </li>
      )}
      {state === 'refunded' && (
        <li className="current fail">
          <span className="dot" />
          <span>{LABELS.refunded}</span>
        </li>
      )}
      {state === 'disputed' && (
        <li className="current">
          <span className="dot" />
          <span>{LABELS.disputed}</span>
        </li>
      )}
    </ol>
  )
}
