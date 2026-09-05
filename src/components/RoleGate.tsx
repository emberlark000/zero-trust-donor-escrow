import { useState } from 'react'
import type { Role } from '../lib/types'

/** Demo gate — password "demo" for intake; donor/public open. */
export function RoleGate({
  onEnter,
}: {
  onEnter: (role: Role, actor: string) => void
}) {
  const [role, setRole] = useState<Role>('donor')
  const [actor, setActor] = useState('intake_ops')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (role === 'intake') {
      if (password !== 'demo') {
        setErr('Intake demo password is: demo')
        return
      }
      if (!actor.trim()) {
        setErr('Staff alias required')
        return
      }
    }
    onEnter(role, role === 'intake' ? actor.trim() : 'donor')
  }

  return (
    <div className="gate">
      <div className="gate-card">
        <h1>Zero-Trust Donor Escrow</h1>
        <p className="muted">Cut-and-mail · escrow hold until QC · Freedman-aligned simulation</p>
        <form onSubmit={submit}>
          <fieldset>
            <legend>Role</legend>
            <label className="check">
              <input
                type="radio"
                name="role"
                checked={role === 'donor'}
                onChange={() => setRole('donor')}
              />
              Donor
            </label>
            <label className="check">
              <input
                type="radio"
                name="role"
                checked={role === 'intake'}
                onChange={() => setRole('intake')}
              />
              Intake / Admin
            </label>
            <label className="check">
              <input
                type="radio"
                name="role"
                checked={role === 'public'}
                onChange={() => setRole('public')}
              />
              Public lot scan
            </label>
          </fieldset>
          {role === 'intake' && (
            <>
              <label>
                Staff alias
                <input value={actor} onChange={(e) => setActor(e.target.value)} />
              </label>
              <label>
                Demo password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="demo"
                />
              </label>
            </>
          )}
          {err && <p className="error">{err}</p>}
          <button type="submit" className="btn primary">
            Enter
          </button>
        </form>
      </div>
    </div>
  )
}
