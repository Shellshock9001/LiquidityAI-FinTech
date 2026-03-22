# Liquidity.ai — Task Review and Verification Guide

**For:** Project Lead (Gus)  
**Purpose:** How to verify every intern task submission before approving the PR.

---

## General Review Process

For every PR, check these first:

1. **Branch naming:** `feat/TASK-ID-description` (e.g., `feat/1.1-entity-schema`)
2. **No unrelated changes:** Only files relevant to the task are modified
3. **No secrets committed:** No API keys, passwords, or .env files in the PR
4. **Code style:** Follows existing patterns in the codebase (look at `userRoutes.js`, `db.js` for reference)
5. **PR description:** Includes what was built, how to test, and screenshots if applicable

---

## Phase 1 — Core Data Model

### 1.1 — Core Entity Schema

**Files to check:** `server/migrations/001_core_entities.sql`, `server/migrations/seed_sample_data.sql`, `docs/erd_core_entities.png`

**Verification steps:**
1. Read the SQL file. Confirm these tables exist: `organizations`, `people`, `funds`, `deals`, `org_people`, `fund_deals`, `org_funds`
2. Check that `organizations` has `investor_type_tags` and `industry_focus_tags` columns (JSONB or TEXT storing JSON arrays)
3. Check that all tables have: `id`, `created_at`, `updated_at`, `created_by`, `confidence_score`, `source`
4. Check foreign keys on junction tables (e.g., `org_people.organization_id REFERENCES organizations(id)`)
5. Check indexes exist on: foreign keys, `legal_name`, `investor_type_tags`, `hq_country`
6. Run the migration against a test PostgreSQL:
   ```bash
   docker exec -i Liquidity.ai-postgres psql -U Liquidity.ai -d Liquidity.ai < server/migrations/001_core_entities.sql
   ```
   It should complete without errors.
7. Run seed data:
   ```bash
   docker exec -i Liquidity.ai-postgres psql -U Liquidity.ai -d Liquidity.ai < server/migrations/seed_sample_data.sql
   ```
8. Verify seed data has at least 50 records across all tables
9. Run a test query:
   ```sql
   SELECT display_name, investor_type_tags FROM organizations WHERE investor_type_tags::jsonb ? 'venture_capital';
   ```
   Should return VC firms.
10. Check the ERD diagram is readable and matches the actual schema

**Red flags:**
- Missing foreign keys on junction tables
- No indexes
- Using VARCHAR without length limits instead of TEXT
- Missing audit columns (created_at, etc.)
- Seed data with obviously fake/placeholder entries ("Test Org 1")

---

### 1.2 — PostgreSQL Migration

**Files to check:** `server/db.js`, all files in `server/routes/`, `server/middleware/auth.js`, `docker-compose.yml`, `package.json`, `.env.example`

**Verification steps:**
1. Confirm `better-sqlite3` is removed from `package.json` and `pg` is added
2. Confirm `docker-compose.yml` has a `postgres` service with volume
3. Confirm `.env.example` has `DATABASE_URL`
4. Start fresh:
   ```bash
   rm -rf data/Liquidity.ai.db
   docker compose up postgres -d
   npm run dev
   ```
5. Server should start without errors
6. Login: `Liquidity.ai@Liquidity.ai.com` / `Liquidity.aiI2026!` — should work
7. Register a new user — should work
8. Approve the new user in Settings > Approvals — should work
9. Check Settings > Sessions — should show your active session
10. Check Audit Log — should show login and approval entries
11. Search codebase for any remaining SQLite references:
    ```bash
    grep -r "better-sqlite3" server/
    grep -r "datetime('now')" server/
    grep -r ".prepare(" server/
    ```
    All should return zero results.

**Red flags:**
- Any synchronous database calls (should all be async/await)
- SQL injection vulnerabilities (string concatenation instead of parameterized queries)
- No connection pooling
- Docker volume missing (data would be lost on container restart)

---

### 1.3 — Entity CRUD API

**Files to check:** `server/routes/orgRoutes.js`, `personRoutes.js`, `fundRoutes.js`, `dealRoutes.js`, `server/server.js`

**Verification steps:**
1. Check routes are mounted in `server/server.js`
2. Test with curl (use the token from login):
   ```bash
   # Create an org
   curl -X POST http://localhost:3001/api/orgs \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer TOKEN" \
     -d '{"legal_name":"Test Capital LLC","display_name":"Test Capital","investor_type_tags":["venture_capital"]}'
   # Should return 201 with the created org
   
   # List orgs
   curl http://localhost:3001/api/orgs -H "Authorization: Bearer TOKEN"
   # Should return array with the org you just created
   
   # List with filters
   curl "http://localhost:3001/api/orgs?investor_type=venture_capital&page=1&limit=10" \
     -H "Authorization: Bearer TOKEN"
   # Should return filtered results
   
   # Get by ID
   curl http://localhost:3001/api/orgs/THE_ID -H "Authorization: Bearer TOKEN"
   
   # Update
   curl -X PUT http://localhost:3001/api/orgs/THE_ID \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer TOKEN" \
     -d '{"hq_city":"San Francisco"}'
   
   # Delete
   curl -X DELETE http://localhost:3001/api/orgs/THE_ID \
     -H "Authorization: Bearer TOKEN"
   ```
3. Test without a token — should get 401
4. Test with a viewer-role token — GET should work, POST/PUT/DELETE should get 403
5. Check audit_log for create/update/delete entries:
   ```sql
   SELECT * FROM audit_log WHERE action LIKE '%ORG%' ORDER BY timestamp DESC;
   ```
6. Test pagination: create 30 orgs, request `?page=2&limit=10`, should get orgs 11-20
7. Repeat for people, funds, deals

**Red flags:**
- Missing authentication on any endpoint
- Missing RBAC permission checks
- SQL injection (string interpolation in queries)
- No pagination on list endpoints
- No input validation (can create org with empty name)
- No audit logging on mutations

---

### 1.4 — Relationship API

**Verification steps:**
1. Create an org and a person, then create a relationship between them
2. Query `GET /api/orgs/:id/people` — should return the person
3. Query `GET /api/people/:id/orgs` — should return the org
4. Create funds, deals, and connect them
5. Test the network endpoint: `GET /api/orgs/:id/network` should return people + funds + deals
6. Test co-investor query with orgs that share deals

---

## Phase 2 — Data Ingestion

### 2.1 — File Upload and Parsing

**Verification steps:**
1. Prepare a test CSV with 100 rows and 5 columns
2. Upload via Postman: POST /api/ingest/upload, form-data, key="file"
3. Response should include: file_id, filename, row_count (100), columns (5 names), sample_rows (20 rows)
4. Upload an Excel file — same verification
5. Upload a .txt file — should get 400 error
6. Upload a file over 50MB — should get 400 error
7. Check `data/uploads/` directory — file should exist
8. Check `file_uploads` table — metadata should be stored
9. Upload the same file again — should create a new record (not overwrite)

---

### 2.2 — Column Mapping Interface

**Verification steps:**
1. Upload a CSV file first (Task 2.1)
2. Open the Pipeline page in the browser, click the "Mapping" tab
3. Should see the uploaded file's columns with sample data
4. Map each source column to a canonical field using dropdowns
5. Save the mapping — should persist (refresh page, mapping still there)
6. Upload a new CSV with the same structure — should be able to load the saved mapping
7. No hardcoded data remaining in the mapping tab

---

### 2.3 — Normalization and Dedup

**Verification steps:**
1. Test normalizer functions directly:
   ```javascript
   normalizeOrgName("Sequoia Capital Inc.") === "Sequoia Capital"
   normalizeOrgName("BLACKSTONE GROUP LLC") === "Blackstone Group"
   normalizeCurrency("$1.5B") === 1500000000
   normalizeCurrency("42M") === 42000000
   normalizePersonName("Dr. John Smith Jr.") === { first: "John", last: "Smith" }
   ```
2. Import a CSV with known data
3. Import the same CSV again — no duplicates should be created
4. Check data_provenance table — every imported field should have a provenance record
5. Check the rejection log — any unparseable rows should be logged with reasons

---

### 2.4 — Ingestion Job Queue

**Verification steps:**
1. Upload a CSV and trigger an import
2. Poll `GET /api/ingest/jobs/:id` — status should progress through stages
3. Open the Pipeline page "Stages" tab — should show real stage status, not hardcoded
4. Import a file with some bad rows — job should complete with error_count > 0, not crash
5. check the ingest_jobs table directly — stages JSONB should show each stage's status

---

## Phase 3 — Views and Filtering

### 3.1 — View Config Backend

**Verification steps:**
1. Check views table has at least 24 pre-seeded views
2. `GET /api/views` — returns all views
3. `GET /api/views/venture-capital/results` — returns orgs tagged as venture_capital
4. Create a custom view via API with compound filters — verify it executes correctly
5. Views should not duplicate data — confirm it runs a query against the same tables

---

### 3.2 — Views Frontend

**Verification steps:**
1. Open Views page in browser
2. Should see three tabs: Investor Types, Financial Institutions, Industry Focus
3. Click "Venture Capital" — should load and display real org data from the database
4. Click "Create Custom View" — modal should open, allow filter selection, save
5. No hardcoded data remaining in ViewsPage.jsx
6. `grep -n "const viewConfig" src/pages/ViewsPage.jsx` should return nothing

---

### 3.3 — Entity Explorer

**Verification steps:**
1. Select a view, click an entity row in the table
2. Detail panel should slide out showing all entity fields
3. Sort by column header — data should re-sort
4. Pagination — navigate between pages
5. Search bar — type a name, results should filter
6. DataTable component should be in its own file (reusable)

---

## Phase 4 — Intelligence Features

### 4.1 — Entity Resolution

**Verification steps:**
1. Import data with near-duplicates (e.g., "Sequoia Capital" and "Sequoia Capital Operations LLC")
2. Run the ER pass — candidates should appear in the HITL queue
3. Open Entity Resolution page — should show real candidates, not hardcoded
4. Approve a merge — the two records should become one
5. Reject a pair — they should be marked as "not duplicates" and not appear again
6. Check that auto-merge works for scores above the threshold

---

### 4.2 — LLM Integration

**Verification steps:**
1. Set `OPENAI_API_KEY` in .env
2. `POST /api/llm/complete` with a simple prompt — should return a response
3. Check `llm_usage` table — should have a cost record
4. Create a prompt template — should be saved and retrievable
5. Open LLM Orchestrator page — should show real model list and cost data
6. No hardcoded data remaining in LLMOrchestratorPage.jsx

---

### 4.3 — Dashboard Data

**Verification steps:**
1. `GET /api/dashboard/stats` — should return real counts matching the database
2. Open Dashboard page — numbers should match the database
3. If no entities exist yet, dashboard should show 0 or appropriate empty state, not fake numbers
4. `grep -n "847,293\|98.7%\|0.0024" src/pages/DashboardPage.jsx` should return nothing (no hardcoded values remain)

---

### 4.4 — Graph Visualization

**Verification steps:**
1. Open Graph page — should render an interactive graph (not static SVG)
2. Nodes should be colored by type (gold for orgs, blue for people, etc.)
3. Click a node — should show entity details
4. Drag nodes — should be interactive
5. Search for an entity name — graph should center on that node
6. Zoom in/out should work

---

## Phase 5 — Quality and Polish

### 5.1 — Test Suite

**Verification steps:**
1. `npm test` — all tests pass, no skipped tests
2. Check test count: at least 15 auth, 10 RBAC, 10 user management, 11 smoke
3. `npm run test:e2e` — Playwright tests pass
4. Read test files — tests should be meaningful, not just `expect(true).toBe(true)`
5. Tests should clean up after themselves (delete test users, etc.)

---

### 5.2 — WebSocket Updates

**Verification steps:**
1. Open Dashboard in two browser tabs
2. In one tab, create a new user via registration
3. The other tab should show a notification without refreshing
4. Run an ingestion job — Pipeline page should update in real-time

---

### 5.3 — Provenance Tracking

**Verification steps:**
1. Import a record from CSV — check field_provenance table has entries
2. Import the same record from a different source with different values
3. `GET /api/provenance/:entityId` — should show both sources with confidence scores
4. The canonical value should be the one with higher confidence
5. Create a dispute — should be logged and retrievable

---

### 5.4 — Security Hardening

**Verification steps:**
1. Enable MFA on a test account
2. Log out, log in — should prompt for TOTP code
3. Enter wrong code — should be rejected
4. Enter correct code from authenticator app — should complete login
5. Test recovery codes — one should work, then be consumed
6. Change password, then try to change back to the old one — should be rejected (password history)
7. Session timeout: set policy to 1 minute, wait, verify session is revoked

---

### 5.5 — Email Notifications

**Verification steps:**
1. Configure Mailtrap.io credentials in .env
2. Approve a user — check Mailtrap inbox for approval email
3. Deny a user — check for denial email
4. Trigger password reset — check for reset email
5. Emails should be HTML formatted, not plain text
6. Emails should not contain sensitive data (no passwords, no tokens)

---

### 5.6 — Mobile Responsiveness

**Verification steps:**
1. Open Chrome DevTools, toggle device toolbar (Ctrl+Shift+M)
2. Set to 375px width (iPhone) — sidebar should be hidden, hamburger menu visible
3. Click hamburger — sidebar should slide in
4. Data tables should be horizontally scrollable, not broken
5. Login and Register pages should be usable on mobile
6. Set to 768px (tablet) — layout should adapt (1-2 columns instead of 3-4)
7. Check all 11 pages at both widths

---

### 5.7 — API Documentation

**Verification steps:**
1. Navigate to `http://localhost:3001/api/docs`
2. Swagger UI should load with interactive documentation
3. Every endpoint in `server/routes/` should be documented
4. Try executing an endpoint from the Swagger UI — should work
5. Request/response examples should be accurate
6. Authentication instructions should be documented (how to get a token, where to put it)
