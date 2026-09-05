# Zero-Trust Donor Cut-and-Mail + Escrow (v1 simulation)

Greenfield Vite + React + TypeScript SPA for Hair Sourcing: donors cut their own ponytails, mail them to brand intake, and are paid only after QC pass. Escrow is a labeled simulation (no real PSP/bank APIs).

Path: `/workspace/hair-sourcing/zero-trust-donor-escrow/`

## Demo disclaimer

- **SIMULATION ONLY**. Mock escrow wallets and tx refs (`SIM-*`). No Stripe, no bank rails, no KYC docs.
- **Identity firewall:** alias + email/phone OTP mock (`123456`). No legal name / passport / SSN collection.
- No invented factories or temple-auction integrations.
- No Vietnam path in this ticket. Brazil/Peru rejected as origin targets.
- Does not touch HypnoCorp/Clark apps.

## Roles

| Role | Access | Notes |
|-p--|--p--|--p--|
| **Donor** | Open (no password) | Eligibility – pre-cut proof – lot ID – cut proof – tracking – timeline |
| **Intake / Admin** | Password: `dem`` | Staff alias required. QC checklist, escrow release/refund, dual-control override, audit log |
| **Public lot scan** | Open | Provenance card only (no home address / face / alias) |

## Country allowlist

- Allow: India (`IN`), Cambodia (`KH`), Myanmar (`MM` — **high-risk badge** in admin), Poland (`PL` — E. Europe placeholder)
- Reject: Brazil, Peru, Vietnam (shown in quiz with reject reasons)

## Escrow rules (enforced in UI logic)

States: `offered` → `accepted` → `proof_submitted` ‒ `shipped` → `received` → `qc_pass` | `qc_fail` → `paid` | `refunded` | `disputed`

- Brand funds escrow on accept (simulation)
- Release to donor only on `qc_pass`
- Refund brand on `qc_fail`
- Fail any critical QC item ← `qc_fail`
- Dual-control override (`qc_fail` ‒ `qc_pass`) requires two distinct reviewer aliases + reason; append-only audit logged

## Run

```bash
cd /workspace/hair-sourcing/zero-trust-donor-escrow
npm install
npm run dev      # http://localhost:5174
npm run build    # typecheck + production build
npm run preview  # serve dist/
```

## Suggested demo path

1. Enter as Donor – allowlisted country – OTP `123456` – upload stub files (hashes via Web Crypto SHA-256) – accept offer (escrow funded) – cut proof – tracking.
2. Enter as Intake (password `demo`) – mark received – complete QC checklist – pass – Release escrow, or fail – Refund brand.
3. Optional: dual-control override after fail (two different aliases).
4. Public scan with lot ID for provenance card.
5. Download audit JSON from Intake panel.

Data lives in localStorage (`zt_donor_escrow_lots_v1`, `zt_donor_escrow_audit_v1`). Use Reset demo data in the nav to clear.

## Stack

Same family as HypnoCorp demo: Vite 5 + React 18 + TypeScript. No backend.
