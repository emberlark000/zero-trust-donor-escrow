import { useState } from 'react'
import type { Role } from './lib/types'
import { DemoBanner } from './components/DemoBanner'
import { RoleGate } from './components/RoleGate'
import { DonorFlow } from './views/DonorFlow'
import { IntakeAdmin } from './views/IntakeAdmin'
import { PublicLotScan } from './views/PublicLotScan'
import { clearAuditForDemo } from './lib/audit'
import { clearLotsForDemo } from './lib/storage'

export default function App() {
  const [role, setRole] = useState<Role | null>(null)
  const [actor, setActor] = useState('intake_ops')
  const [auditKey, setAuditKey] = useState(0)

  const bumpAudit = () => setAuditKey((k) => k + 1)

  if (!role) {
    return (
      <>
        <DemoBanner />
        <RoleGate
          onEnter={(r, a) => {
            setRole(r)
            setActor(a)
          }}
        />
      </>
    )
  }

  return (
    <div className="app">
      <DemoBanner />
      <nav className="topnav">
        <div className="brand">
          <strong>ZT Donor Escrow</strong>
          <span className="muted small">v1.1 score+interview</span>
        </div>
        <div className="nav-actions">
          <button type="button" className="btn ghost" onClick={() => setRole('donor')}>
            Donor
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              /* keep intake unlocked once entered */
              setRole('intake')
            }}
          >
            Intake
          </button>
          <button type="button" className="btn ghost" onClick={() => setRole('public')}>
            Public scan
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              if (confirm('Clear all localStorage lots + audit for this demo?')) {
                clearLotsForDemo()
                clearAuditForDemo()
                bumpAudit()
              }
            }}
          >
            Reset demo data
          </button>
          <button type="button" className="btn ghost" onClick={() => setRole(null)}>
            Exit
          </button>
        </div>
      </nav>
      <main>
        {role === 'donor' && <DonorFlow onAudit={bumpAudit} />}
        {role === 'intake' && (
          <IntakeAdmin actor={actor} auditKey={auditKey} onAudit={bumpAudit} />
        )}
        {role === 'public' && <PublicLotScan />}
      </main>
      <footer className="footer">
        No real Stripe/bank APIs · No Vietnam path · No HypnoCorp/Clark apps touched · Allowlist:
        India, Cambodia, Myanmar (high-risk), Poland
      </footer>
    </div>
  )
}
