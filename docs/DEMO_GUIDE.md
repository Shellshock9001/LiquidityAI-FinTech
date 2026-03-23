# Liquidity.ai — Live Demo Presentation Guide

> **For:** Executive presentation to demonstrate the Liquidity.ai Financial Intelligence Graph platform.
> Use this guide alongside the workflow images in this folder.

---

## Slide Order & Talking Points

### Slide 1: Platform Overview
**Image:** `01_platform_overview.png`

**Key Points:**
- Liquidity.ai aggregates financial data from **5+ sources** (PitchBook, SEC EDGAR, LinkedIn, Crunchbase, CSV/Excel)
- Data flows through an **8-stage ingestion pipeline** — from raw to canonical
- The core platform has three engines: **Knowledge Graph**, **Entity Resolution**, and **LLM Orchestrator**
- Everything sits on top of an enterprise **security layer** with RBAC, risk scoring, and audit logging
- Users interact through **5 specialized interfaces** tailored to different roles

**Demo Action:** Show the Dashboard page — point out the 847K entities, 98.7% ER precision, 99.9% provenance coverage.

---

### Slide 2: Authentication & Security
**Image:** `02_security_auth_flow.png`

**Key Points:**
- **JWT-based authentication** with 15-minute access tokens and 7-day refresh tokens
- **Account lockout** after 5 failed attempts — prevents brute force attacks
- **Session tracking** — every login records IP address, device, and user agent
- **Rate limiting** — 10 auth attempts per 15 minutes, 100 API calls per minute
- **API keys** — scoped, hashed, and prefixed (`Liquidity.ai_sk_`) for programmatic access
- **Every action logged** — immutable audit trail with actor, target, IP, timestamp

**Demo Action:** Log in as Liquidity.ai → open Profile Panel → show the Sessions tab with IP addresses.

---

### Slide 3: User Registration & Risk Scoring
**Image:** `03_risk_scoring_flow.png`

**Key Points:**
- New users don't get instant access — they **submit a request** with department, title, and reason
- A **risk scoring engine** analyzes each submission (0–100 scale):
  - Disposable email? +25 risk
  - Missing department/title? +15/+10 risk
  - Vague reason? +20 risk
  - No referral? +10 risk
- Admin sees the **risk score and factors** in the approval queue
- Admin can **approve + assign role**, or **deny with a required reason**
- This approach reduces unauthorized access while maintaining a smooth onboarding experience

**Demo Action:** Open Settings → Approvals tab → show the risk score column and approve/deny buttons.

---

### Slide 4: Role-Based Access Control (RBAC)
**Image:** `04_rbac_model.png`

**Key Points:**
- **7 distinct roles** — from Super Admin (full control) to Viewer (read-only)
- **30+ granular permissions** across 8 categories (users, graph, pipeline, LLM, audit, policies, API keys, sessions)
- **Escalation prevention** — a user cannot assign a role higher than their own
- Roles map directly to **SOC 2 access control requirements**
- Each role sees only the navigation items and features they're authorized for

**Demo Action:** Open Settings → Team tab → show the role dropdown for a user, demonstrate how only certain roles are assignable.

---

### Slide 5: Data Ingestion Pipeline
**Image:** `05_data_pipeline.png`

**Key Points:**
- **8-stage pipeline** takes raw data and produces canonical, high-confidence entities
- Supports **multiple source types**: CSV, Excel, PDF, API feeds
- **AI-assisted** field mapping and LLM enrichment in stages 3 and 6
- **Entity Resolution** in stage 7 detects duplicates using fuzzy matching
- **Human-in-the-Loop (HITL)** review queue for low-confidence matches
- Quality assurance in stage 8 with confidence scoring and anomaly detection
- Final output: **Single Source of Truth (SSOT)** with 847K+ canonical entities

**Demo Action:** Show the Ingestion Pipeline page → walk through each stage → point out the active sources and record counts.

---

### Slide 6: SOC 2 Compliance & Audit
**Image:** `06_audit_compliance.png`

**Key Points:**
- **Immutable, append-only** audit log — entries can never be modified or deleted
- Every event captures: **actor, target, action, IP address, timestamp, outcome**
- **Full user lifecycle** tracking: registration → approval → role changes → suspension → deletion
- **Four security control pillars**:
  1. Authentication (JWT, lockout, MFA-ready)
  2. Authorization (RBAC, permission checks, escalation prevention)
  3. Data Protection (bcrypt hashing, token hashing)
  4. Monitoring (session tracking, IP flagging, rate limiting)
- **Export-ready** for SOC 2 Type II auditors — all log data is queryable and filterable

**Demo Action:** Show the Security & Compliance page → point out the audit event timeline → export a sample report.

---

## Live Demo Walkthrough Script

**Total time:** 8–10 minutes

| Time | Action | What to Show |
|------|--------|-------------|
| 0:00 | Open `http://localhost:5173` | Login page |
| 0:30 | Log in as Liquidity.ai | Dashboard loads with full admin view |
| 1:00 | Walk through Dashboard | Entity counts, pipeline status, HITL queue |
| 2:00 | Click Knowledge Graph | Graph visualization, entity inspector |
| 3:00 | Click Ingestion Pipeline | 8-stage pipeline, source configs, run history |
| 4:00 | Click Entity Resolution | Duplicate detection, merge/split decisions |
| 5:00 | Click user card (sidebar) | Profile Panel slides out — account, password, sessions |
| 5:30 | Click Settings | Team tab — search/filter users, inline actions |
| 6:00 | Switch to Approvals tab | Risk scores, approve/deny with notes |
| 6:30 | Switch to Sessions tab | Active sessions with IP tracking |
| 7:00 | Switch to API Keys tab | Create/revoke scoped API keys |
| 7:30 | Switch to Policies tab | Security policy configuration |
| 8:00 | Show Security & Compliance | SOC 2 dashboard, audit timeline |
| 8:30 | Open registration page | Show risk-scored signup flow |
| 9:00 | Show Docker deployment | `docker compose up` — LAN sharing |

---

## Files in This Folder

| File | Description |
|------|-------------|
| `01_platform_overview.png` | Full platform architecture — sources → pipeline → core → security → UI |
| `02_security_auth_flow.png` | Authentication flow, security controls, audit trail |
| `03_risk_scoring_flow.png` | Registration → risk analysis → admin review → approve/deny |
| `04_rbac_model.png` | Role hierarchy pyramid, permission matrix, escalation prevention |
| `05_data_pipeline.png` | 8-stage ingestion pipeline with HITL review branch |
| `06_audit_compliance.png` | SOC 2 compliance architecture, immutable logging, security controls |
| `DEMO_GUIDE.md` | This file — presentation order, talking points, demo script |
