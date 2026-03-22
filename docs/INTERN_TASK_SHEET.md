# Liquidity.ai — Intern Task Board

**Version:** 1.0 | **Date:** March 2026 | **Lead:** Gus  
**Repository:** `https://github.com/Shellshock9001/Liquidity.ai-FinTech/`


---

## How to Submit Your Work

Every task follows the same submission process. No exceptions.

**Step 1: Create a branch**
```bash
git checkout -b feat/TASK-ID-short-description
# Example: git checkout -b feat/1.1-entity-schema
```

**Step 2: Work on your branch.** Commit often with clear messages.
```bash
git add .
git commit -m "1.1: Add organizations table schema"
```

**Step 3: When finished, push and open a Pull Request.**
```bash
git push origin feat/1.1-entity-schema
```
Then go to GitHub, open a Pull Request targeting `dev`, and fill in:
- Task ID and title
- What you built (summary)
- How to test it (exact commands or steps)
- Screenshots if it involves UI changes

**Step 4: Manager reviews.** He will either approve, request changes, or ask questions in PR comments. Fix anything requested and push again — the PR updates automatically.

**Step 5: After approval,** Manager merges your PR. Do not merge your own PRs.

---

## Role Definitions

| Code | Role | Skills |
|:----:|------|--------|
| BE | Backend Engineering | Node.js, Express, REST APIs, middleware |
| FE | Frontend Engineering | React, JSX, CSS, components |
| DB | Database Engineering | SQL schema design, PostgreSQL, migrations |
| DS | Data Science / ML | Python or JS, NLP, fuzzy matching, embeddings |
| UX | Product Design | Wireframes, user flows, design systems |
| QA | Quality Assurance | Jest, Playwright, test strategy |
| DO | DevOps | Docker, CI/CD, cloud, security |
| TW | Technical Writing | API docs, guides |
| CS | General CS | Algorithms, data structures — can take any task |

---

## Current State — Read This First

Before you touch any code, understand what already works and what does not.

**Working (real backend + frontend):** Authentication, registration, RBAC (7 roles, 30+ permissions), user management, sessions, API keys, security policies, audit logging, profile panel, Docker deployment.

**Fake (UI with hardcoded data, no backend):** Dashboard, Knowledge Graph, Pipeline, Entity Resolution, LLM Orchestrator, Provenance, Views & Personas, Security Dashboard.

**Does not exist yet:** Core data tables (orgs, people, funds, deals), file upload, data parsing, entity resolution algorithms, LLM API calls, graph database, tests, PostgreSQL, WebSockets, email, MFA.

---

## Phase 1 — Core Data Model (Weeks 1–3, Critical)

### Task 1.1 — Design Core Entity Schema

| Field | Detail |
|-------|--------|
| Roles | DB, CS |
| Difficulty | High |
| Depends On | None |

**What you are building:** The database tables that store all financial data — organizations (companies/firms), people (executives/partners), funds (investment vehicles), and deals (transactions). This is the foundation everything else is built on.

**Step-by-step instructions:**

1. Open the file `server/db.js` and read lines 22–140. This is the existing schema for auth tables (users, sessions, audit_log, etc.). Your new tables will follow the same patterns.

2. Create a new file: `server/migrations/001_core_entities.sql`. In this file, write `CREATE TABLE` statements for these tables:

   **organizations** — One row per company/firm.
   ```sql
   CREATE TABLE IF NOT EXISTS organizations (
     id TEXT PRIMARY KEY,              -- UUID, generated with uuid library
     legal_name TEXT NOT NULL,         -- Official name: "Sequoia Capital Operations LLC"
     display_name TEXT NOT NULL,       -- Short name: "Sequoia Capital"
     entity_type TEXT DEFAULT '',      -- "firm", "fund_manager", "bank", etc.
     investor_type_tags TEXT DEFAULT '[]',  -- JSON array: ["venture_capital","technology"]
     industry_focus_tags TEXT DEFAULT '[]', -- JSON array: ["ai","fintech","healthcare"]
     aum_band TEXT DEFAULT '',         -- "$1B-5B", "$10B+", etc.
     hq_city TEXT DEFAULT '',
     hq_state TEXT DEFAULT '',
     hq_country TEXT DEFAULT '',
     website TEXT DEFAULT '',
     linkedin_url TEXT DEFAULT '',
     founded_year INTEGER,
     description TEXT DEFAULT '',
     status TEXT DEFAULT 'active',     -- "active", "inactive", "acquired"
     confidence_score INTEGER DEFAULT 0,  -- 0-100, how confident we are in this data
     source TEXT DEFAULT '',           -- "pitchbook", "sec_edgar", "manual", etc.
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     created_by TEXT DEFAULT 'SYSTEM'
   );
   ```

   **people** — One row per person (investor, executive, partner).
   Include fields: id, first_name, last_name, display_name, email, title, current_org_id (foreign key to organizations), linkedin_url, biography, location fields, confidence_score, source, timestamps.

   **funds** — One row per investment fund/vehicle.
   Include fields: id, name, managing_org_id (FK to organizations), fund_size, currency, vintage_year, strategy_tags (JSON array), stage_focus, geography_focus, status, confidence_score, source, timestamps.

   **deals** — One row per transaction.
   Include fields: id, company_name, company_org_id (FK to organizations), deal_type, stage, amount, currency, deal_date, sector_tags (JSON array), lead_investor_org_id (FK), confidence_score, source, timestamps.

   **Junction tables** (for many-to-many relationships):
   - `org_people`: organization_id, person_id, role (e.g., "Partner", "CEO"), start_date, end_date
   - `fund_deals`: fund_id, deal_id, invested_amount, role (e.g., "lead", "co-investor")
   - `org_funds`: organization_id, fund_id, relationship_type (e.g., "GP", "LP")

3. Add indexes on foreign keys and commonly queried fields (legal_name, investor_type_tags, hq_country).

4. Create a seed data script: `server/migrations/seed_sample_data.sql`. Insert at least 50 records across all tables. Use real-world examples:
   - Organizations: Sequoia Capital, Andreessen Horowitz, Blackstone, KKR, Tiger Global, Citadel, Bridgewater
   - People: real partner names (publicly available)
   - Funds: Sequoia Growth Fund III, a16z Crypto Fund, etc.
   - Deals: publicly known rounds (Databricks Series F, Stripe Series I, etc.)

5. Create an ERD diagram. Use https://dbdiagram.io — paste your schema, export as PNG, save to `docs/erd_core_entities.png`.

6. Write a documentation section at the top of your migration file explaining every table and field.

**How to verify your own work before submitting:**
- Run your SQL against a test PostgreSQL database. All tables should create without errors.
- Run the seed script. All inserts should succeed.
- Query: `SELECT * FROM organizations WHERE 'venture_capital' = ANY(investor_type_tags)` should return VC firms.
- The ERD diagram should show all tables with their relationships.

**Deliverables in your PR:**
- `server/migrations/001_core_entities.sql`
- `server/migrations/seed_sample_data.sql`
- `docs/erd_core_entities.png`
- Updated PR description with screenshots of the ERD

---

### Task 1.2 — Migrate from SQLite to PostgreSQL

| Field | Detail |
|-------|--------|
| Roles | DB, BE, DO |
| Difficulty | Medium |
| Depends On | 1.1 |

**What you are building:** The app currently uses SQLite (a file-based database). For production, we need PostgreSQL. You will change the database connection code so the entire app uses PostgreSQL instead.

**Step-by-step instructions:**

1. Install the PostgreSQL client library:
   ```bash
   npm install pg
   ```

2. Add a PostgreSQL container to `docker-compose.yml`:
   ```yaml
   services:
     postgres:
       image: postgres:16
       environment:
         POSTGRES_USER: Liquidity.ai
         POSTGRES_PASSWORD: Liquidity.ai_dev_2026
         POSTGRES_DB: Liquidity.ai
       ports:
         - "5432:5432"
       volumes:
         - pgdata:/var/lib/postgresql/data
   volumes:
     pgdata:
   ```

3. Start the database: `docker compose up postgres -d`

4. Open `server/db.js`. This is the main file you will modify. Currently it imports `better-sqlite3` on line 1. You need to:
   - Replace `import Database from 'better-sqlite3'` with `import pg from 'pg'`
   - Create a connection pool: `const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })`
   - Add `DATABASE_URL=postgresql://Liquidity.ai:Liquidity.ai_dev_2026@localhost:5432/Liquidity.ai` to `.env`

5. The hardest part: convert every query. SQLite and PostgreSQL have syntax differences.

   **SQLite (current):**
   ```javascript
   const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
   ```
   **PostgreSQL (new):**
   ```javascript
   const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
   const user = rows[0];
   ```

   Key differences:
   - `?` placeholders become `$1`, `$2`, `$3`, etc.
   - `.get()` becomes `await pool.query()` then access `rows[0]`
   - `.all()` becomes `await pool.query()` then access `rows`
   - `.run()` becomes `await pool.query()`
   - `datetime('now')` becomes `NOW()`
   - `datetime('now', '+15 minutes')` becomes `NOW() + INTERVAL '15 minutes'`
   - All database calls become `async/await` (SQLite was synchronous)

6. This means every route handler that calls `db.js` queries also needs to become `async`. Open each file in `server/routes/` and add `async` to route handlers. Example:
   ```javascript
   // Before (SQLite, synchronous):
   router.get('/users', authenticate, (req, res) => {
     const users = queries.getAllUsers.all();
     res.json(users);
   });
   
   // After (PostgreSQL, async):
   router.get('/users', authenticate, async (req, res) => {
     const users = await queries.getAllUsers();
     res.json(users);
   });
   ```

7. Run the existing migrations (auth tables) against PostgreSQL. Then run the new core entity migrations from Task 1.1.

8. Test everything: start the app, log in, create a user, approve them, check audit logs, manage sessions. Every existing feature must still work.

**How to verify before submitting:**
- `npm run dev` starts without errors
- You can log in with `Liquidity.ai@Liquidity.ai.com` / `Liquidity.aiI2026!`
- Create a new user via registration, approve them, log in as them
- Check Settings page: Team, Approvals, Sessions, API Keys, Policies all load
- Audit log shows entries
- No SQLite references remain in the codebase (search for `better-sqlite3`)

**Deliverables in your PR:**
- Updated `server/db.js`
- Updated all route files in `server/routes/`
- Updated `server/middleware/auth.js` (async)
- Updated `docker-compose.yml`
- Updated `.env.example` with `DATABASE_URL`
- Updated `package.json` (add `pg`, remove `better-sqlite3`)

---

### Task 1.3 — Build Core Entity CRUD API

| Field | Detail |
|-------|--------|
| Roles | BE, CS |
| Difficulty | Medium |
| Depends On | 1.1, 1.2 |

**What you are building:** API endpoints that let the frontend create, read, update, and delete organizations, people, funds, and deals.

**Step-by-step instructions:**

1. Look at `server/routes/userRoutes.js` — this is your template. Every route file you create should follow the same patterns: import middleware, define routes, export router.

2. Create `server/routes/orgRoutes.js`. It should have these endpoints:

   ```
   GET    /api/orgs              List all orgs (with pagination and filters)
   GET    /api/orgs/:id          Get one org by ID
   POST   /api/orgs              Create a new org
   PUT    /api/orgs/:id          Update an org
   DELETE /api/orgs/:id          Delete an org
   GET    /api/orgs/search       Search orgs by name (autocomplete)
   ```

3. For the list endpoint, support these query parameters:
   ```
   GET /api/orgs?page=1&limit=25&investor_type=venture_capital&industry=ai&country=US&sort=legal_name&order=asc
   ```
   Build a dynamic SQL query that adds WHERE clauses based on which filters are provided. Use parameterized queries to prevent SQL injection.

4. Every endpoint must:
   - Be wrapped with `authenticate` middleware (from `server/middleware/auth.js`)
   - Check permissions with `requirePermission('graph.read')` for GET, `requirePermission('graph.write')` for POST/PUT/DELETE
   - Log mutations to the audit trail using the `logAudit()` function from `server/db.js`
   - Return proper HTTP status codes: 200 (success), 201 (created), 400 (bad input), 404 (not found), 500 (server error)

5. Repeat for `personRoutes.js`, `fundRoutes.js`, `dealRoutes.js` — same pattern, different table and fields.

6. Mount all four route files in `server/server.js`:
   ```javascript
   import orgRoutes from './routes/orgRoutes.js';
   app.use('/api/orgs', orgRoutes);
   // ... same for people, funds, deals
   ```

7. Test with curl or Postman:
   ```bash
   # Get a JWT token first
   curl -X POST http://localhost:3001/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"Liquidity.ai@Liquidity.ai.com","password":"Liquidity.aiI2026!"}'
   
   # Use the token to create an org
   curl -X POST http://localhost:3001/api/orgs \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN_HERE" \
     -d '{"legal_name":"Sequoia Capital","display_name":"Sequoia","investor_type_tags":["venture_capital"]}'
   
   # List orgs
   curl http://localhost:3001/api/orgs \
     -H "Authorization: Bearer YOUR_TOKEN_HERE"
   ```

**How to verify before submitting:**
- All four CRUD endpoints work for all four entity types
- Pagination works: `?page=2&limit=10` returns correct results
- Filters work: `?investor_type=venture_capital` returns only VC firms
- Unauthorized requests (no token) return 401
- Wrong permissions return 403
- Creating/updating/deleting records appears in the audit log

**Deliverables in your PR:**
- `server/routes/orgRoutes.js`
- `server/routes/personRoutes.js`
- `server/routes/fundRoutes.js`
- `server/routes/dealRoutes.js`
- Updated `server/server.js` with routes mounted
- Curl/Postman test examples in PR description

---

### Task 1.4 — Build Relationship API

| Field | Detail |
|-------|--------|
| Roles | BE, DB |
| Difficulty | Medium |
| Depends On | 1.3 |

**What you are building:** Endpoints to connect entities to each other — "Person X works at Org Y as Partner" or "Fund Z invested in Deal W."

**Step-by-step instructions:**

1. Create `server/routes/relationshipRoutes.js`

2. Endpoints needed:
   ```
   POST   /api/relationships                  Create a relationship
   DELETE /api/relationships/:id              Remove a relationship
   GET    /api/orgs/:id/people                Get all people at an org
   GET    /api/orgs/:id/funds                 Get all funds managed by an org
   GET    /api/people/:id/orgs                Get all orgs a person has worked at
   GET    /api/funds/:id/deals                Get all deals in a fund
   GET    /api/orgs/:id/network               Get full network: people + funds + deals (graph traversal)
   GET    /api/orgs/:id/co-investors           Which other orgs co-invested with this one
   ```

3. The `POST /api/relationships` body should look like:
   ```json
   {
     "source_type": "organization",
     "source_id": "uuid-of-org",
     "target_type": "person",
     "target_id": "uuid-of-person",
     "relationship_type": "employs",
     "role": "Managing Partner",
     "start_date": "2019-01-01"
   }
   ```
   This inserts into the appropriate junction table (`org_people`, `fund_deals`, or `org_funds`).

4. The co-investor query is the most complex. It needs to find orgs that appear in the same deals:
   ```sql
   SELECT DISTINCT o.* FROM organizations o
   JOIN fund_deals fd1 ON fd1.fund_id IN (SELECT f.id FROM funds f JOIN org_funds of ON f.id = of.fund_id WHERE of.organization_id = $1)
   JOIN fund_deals fd2 ON fd2.deal_id = fd1.deal_id AND fd2.fund_id != fd1.fund_id
   JOIN org_funds of2 ON fd2.fund_id = of2.fund_id
   JOIN organizations o ON of2.organization_id = o.id
   ```
   If this SQL is too complex, start with a simpler version and note it in your PR.

5. The `/network` endpoint returns a combined object:
   ```json
   {
     "organization": { ... },
     "people": [ ... ],
     "funds": [ ... ],
     "deals": [ ... ]
   }
   ```

**Deliverables in your PR:**
- `server/routes/relationshipRoutes.js`
- Updated `server/server.js`
- Example curl commands showing relationship creation and querying

---

## Phase 2 — Data Ingestion (Weeks 3–5)

### Task 2.1 — File Upload and Parsing

| Field | Detail |
|-------|--------|
| Roles | BE, CS |
| Difficulty | Medium |
| Depends On | 1.2 |

**What you are building:** An endpoint that accepts CSV or Excel file uploads and returns the parsed data as structured JSON so the user can map columns.

**Step-by-step instructions:**

1. Install dependencies:
   ```bash
   npm install multer csv-parse xlsx
   ```

2. Create `server/routes/ingestRoutes.js`

3. Set up multer for file uploads:
   ```javascript
   import multer from 'multer';
   import path from 'path';
   
   const upload = multer({
     dest: path.join(process.cwd(), 'data', 'uploads'),
     limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
     fileFilter: (req, file, cb) => {
       const allowed = ['.csv', '.xlsx', '.xls', '.json'];
       const ext = path.extname(file.originalname).toLowerCase();
       if (allowed.includes(ext)) cb(null, true);
       else cb(new Error('File type not supported. Use CSV, Excel, or JSON.'));
     }
   });
   ```

4. Create the upload endpoint:
   ```
   POST /api/ingest/upload    Accepts file, parses it, returns preview
   ```
   The response should include:
   ```json
   {
     "file_id": "uuid",
     "filename": "pitchbook_export.csv",
     "row_count": 14200,
     "columns": ["Company Name", "HQ City", "AUM", "Investor Type", "Website"],
     "sample_rows": [ /* first 20 rows as objects */ ],
     "detected_types": { "Company Name": "text", "AUM": "currency", "HQ City": "text" }
   }
   ```

5. For CSV parsing, use `csv-parse`:
   ```javascript
   import { parse } from 'csv-parse/sync';
   import fs from 'fs';
   
   const content = fs.readFileSync(file.path, 'utf-8');
   const records = parse(content, { columns: true, skip_empty_lines: true });
   ```

6. For Excel parsing, use `xlsx`:
   ```javascript
   import XLSX from 'xlsx';
   
   const workbook = XLSX.readFile(file.path);
   const sheet = workbook.Sheets[workbook.SheetNames[0]];
   const records = XLSX.utils.sheet_to_json(sheet);
   ```

7. Store upload metadata in a `file_uploads` table (id, filename, original_name, size_bytes, row_count, columns as JSON, uploaded_by, uploaded_at, status).

8. Mount in `server/server.js`: `app.use('/api/ingest', ingestRoutes)`

**How to verify:**
- Upload a CSV file via Postman (form-data, key: "file", type: File)
- Get back correct column names and sample rows
- Upload an Excel file — same result
- Upload a .txt file — get a 400 error with clear message
- Upload a 100MB file — get a 400 error (over limit)

**Deliverables:**
- `server/routes/ingestRoutes.js`
- Migration for `file_uploads` table
- Updated `server/server.js`

---

### Task 2.2 — Column Mapping Interface

| Field | Detail |
|-------|--------|
| Roles | FE, BE, UX |
| Difficulty | Medium |
| Depends On | 2.1 |

**What you are building:** After uploading a file, the user sees their columns on the left and our canonical fields on the right, and maps them together.

**Backend steps:**

1. Create endpoints:
   ```
   POST /api/ingest/mappings          Save a mapping config
   GET  /api/ingest/mappings          List saved mappings
   GET  /api/ingest/mappings/:id      Get one mapping
   ```

2. Mapping config structure:
   ```json
   {
     "name": "PitchBook Standard",
     "source_type": "pitchbook_csv",
     "column_mappings": {
       "Company Name": "organizations.legal_name",
       "HQ City": "organizations.hq_city",
       "AUM ($M)": "organizations.aum_band",
       "Investor Type": "organizations.investor_type_tags"
     }
   }
   ```

**Frontend steps:**

1. Open `src/pages/PipelinePage.jsx`. Find the `mapping` tab section (around line 87). Currently it shows a hardcoded table.

2. Replace it with a real component that:
   - Fetches the file preview from Task 2.1 (`GET /api/ingest/upload/:fileId/preview`)
   - Shows source columns on the left with sample values
   - Shows canonical field dropdowns on the right
   - Has a "Save Mapping" button that calls `POST /api/ingest/mappings`
   - Has a "Load Saved Mapping" dropdown for reuse

**Deliverables:**
- Backend mapping CRUD endpoints
- Updated PipelinePage.jsx mapping tab with real data
- "Save" and "Load" mapping functionality

---

### Task 2.3 — Data Normalization and Deduplication

| Field | Detail |
|-------|--------|
| Roles | DB, DS, CS |
| Difficulty | High |
| Depends On | 2.1, 1.3 |

**What you are building:** Functions that clean up messy data before it goes into the database. Company names come in many forms ("Sequoia Capital Inc.", "sequoia capital", "SEQUOIA CAPITAL LLC") — your normalizer turns them all into one clean form.

**Step-by-step instructions:**

1. Create `server/lib/normalizer.js` with these functions:

   ```javascript
   // Remove Inc, LLC, Ltd, Corp, etc. and normalize case
   export function normalizeOrgName(name) {
     if (!name) return '';
     return name
       .trim()
       .replace(/\b(inc|llc|ltd|corp|corporation|lp|llp|co|company|group|holdings)\b\.?/gi, '')
       .replace(/\s+/g, ' ')
       .trim();
   }
   
   // "john smith" → { first: "John", last: "Smith" }
   export function normalizePersonName(name) { /* ... */ }
   
   // "$1.5B" → 1500000000, "42M" → 42000000
   export function normalizeCurrency(value) { /* ... */ }
   
   // "CA" → "California", "US" → "United States"
   export function normalizeGeography(value) { /* ... */ }
   ```

2. Create `server/lib/dedup.js`:
   ```javascript
   // Check if an org with a similar name already exists
   export async function findDuplicateOrg(normalizedName, pool) {
     const { rows } = await pool.query(
       'SELECT * FROM organizations WHERE LOWER(display_name) = LOWER($1)',
       [normalizedName]
     );
     return rows[0] || null;
   }
   ```

3. Create an import pipeline function in `server/lib/importer.js`:
   ```javascript
   export async function importMappedRows(rows, columnMappings, sourceFile, pool) {
     const results = { imported: 0, skipped: 0, errors: [] };
     
     for (const row of rows) {
       // 1. Apply column mapping to get canonical fields
       // 2. Normalize each field
       // 3. Check for duplicates
       // 4. Insert or skip
       // 5. Record provenance (which file, which row)
     }
     
     return results;
   }
   ```

**How to verify:**
- `normalizeOrgName("Sequoia Capital Inc.")` returns `"Sequoia Capital"`
- `normalizeOrgName("BLACKSTONE GROUP LLC")` returns `"Blackstone Group"`
- `normalizeCurrency("$1.5B")` returns `1500000000`
- Importing the same CSV twice does not create duplicates

**Deliverables:**
- `server/lib/normalizer.js` with tests in comments
- `server/lib/dedup.js`
- `server/lib/importer.js`

---

### Task 2.4 — Ingestion Job Queue

| Field | Detail |
|-------|--------|
| Roles | BE, CS |
| Difficulty | Medium |
| Depends On | 2.3 |

**What you are building:** When someone uploads a file, the import runs as a background job with stages the user can monitor.

**Step-by-step instructions:**

1. Create a `jobs` table:
   ```sql
   CREATE TABLE IF NOT EXISTS ingest_jobs (
     id TEXT PRIMARY KEY,
     file_upload_id TEXT REFERENCES file_uploads(id),
     status TEXT DEFAULT 'pending',   -- pending, running, completed, failed
     current_stage TEXT DEFAULT 'upload',
     stages JSONB DEFAULT '{}',       -- {"upload": "done", "parse": "running", "map": "pending", ...}
     total_rows INTEGER DEFAULT 0,
     processed_rows INTEGER DEFAULT 0,
     error_count INTEGER DEFAULT 0,
     error_log JSONB DEFAULT '[]',
     started_at TIMESTAMPTZ,
     completed_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

2. Create `server/lib/jobRunner.js` that processes a job through stages:
   - Upload (done — file already uploaded)
   - Parse (read the file into rows)
   - Map (apply column mappings)
   - Validate (check required fields, data types)
   - Normalize (run normalizer functions)
   - Dedup (check for existing records)
   - Import (insert into database)
   - Complete

3. After each stage, update the `jobs` table with current progress. The frontend can poll `GET /api/ingest/jobs/:id` to see real-time progress.

4. Connect to `PipelinePage.jsx` — replace the hardcoded pipeline stages with real job status data.

**Deliverables:**
- `ingest_jobs` table migration
- `server/lib/jobRunner.js`
- Status endpoint: `GET /api/ingest/jobs/:id`
- PipelinePage stages tab showing real job progress

---

## Phase 3 — Views and Filtering (Weeks 4–6)

### Task 3.1 — View Configuration Backend

| Field | Detail |
|-------|--------|
| Roles | BE, DB |
| Difficulty | Medium |
| Depends On | 1.3 |

**What you are building:** Saved filter presets. A "Venture Capital" view is just a saved filter that says `WHERE 'venture_capital' = ANY(investor_type_tags)`. Users can create custom views too.

**Instructions:**

1. Create `views` table with: id, name, slug, description, filters (JSONB), field_selections (JSONB array), sort_field, sort_order, access_roles (JSONB array), created_by, timestamps.

2. Filter JSONB structure:
   ```json
   {
     "investor_type": ["venture_capital"],
     "industry": ["ai", "technology"],
     "country": ["US", "UK"],
     "aum_min": 1000000000,
     "stage": ["series_a", "series_b", "series_c"]
   }
   ```

3. Create `server/routes/viewRoutes.js` with CRUD + a "execute" endpoint:
   ```
   GET    /api/views                  List all views
   POST   /api/views                  Create a view
   GET    /api/views/:slug/results    Execute the view (returns filtered entities)
   ```

4. Pre-seed 24+ default views covering all investor types and industries listed in the project overview.

**Deliverables:**
- Views table migration
- viewRoutes.js with CRUD and execution
- Seed script with 24+ default views

---

### Task 3.2 — Views Frontend Overhaul

| Field | Detail |
|-------|--------|
| Roles | FE, UX |
| Difficulty | Medium |
| Depends On | 3.1 |

**What you are building:** Replacing the fake ViewsPage with real data. Currently `ViewsPage.jsx` has 4 hardcoded personas. You will connect it to the views API and expand to all categories.

**Instructions:**

1. Open `src/pages/ViewsPage.jsx`. Read the entire file (137 lines). Notice that `viewConfig` on line 13 is all hardcoded.

2. Replace the hardcoded data with API calls:
   ```javascript
   const [views, setViews] = useState([]);
   
   useEffect(() => {
     fetch('/api/views', {
       headers: { 'Authorization': `Bearer ${token}` }
     })
     .then(res => res.json())
     .then(data => setViews(data));
   }, []);
   ```

3. Add three category tabs: "Investor Types" | "Financial Institutions" | "Industry Focus"

4. When user clicks a view, call `GET /api/views/:slug/results` and display the filtered entities.

5. Add a "Create Custom View" button that opens a modal with filter options.

**Deliverables:**
- Rewritten ViewsPage.jsx with API integration
- Three-tab category navigation
- View execution showing real filtered results
- Custom view creation modal

---

### Task 3.3 — Entity Explorer Table

| Field | Detail |
|-------|--------|
| Roles | FE, UX |
| Difficulty | High |
| Depends On | 3.1, 1.3 |

**What you are building:** A data table component that shows entities when a user selects a view. Click a row to see full details.

**Instructions:**

1. Create `src/components/DataTable.jsx` — a reusable table with:
   - Sortable column headers (click to sort, click again to reverse)
   - Pagination controls at the bottom (Previous / Page X of Y / Next)
   - Row click handler (calls a callback with the clicked entity)

2. Create `src/components/EntityDetail.jsx` — a slide-out panel (similar to `ProfilePanel.jsx`) that shows all fields for one entity, including tags, relationships, and confidence scores.

3. Use these components in `ViewsPage.jsx`: when results load, render them in the DataTable. When a row is clicked, open the EntityDetail panel.

4. Add a search bar above the table that filters results by name (client-side filter on the loaded data, or call a search API endpoint).

**Deliverables:**
- `src/components/DataTable.jsx`
- `src/components/EntityDetail.jsx`
- Integrated into ViewsPage
- Search bar with filtering

---

## Phase 4 — Intelligence Features (Weeks 5–8)

### Task 4.1 — Entity Resolution Engine

| Field | Detail |
|-------|--------|
| Roles | DS, CS, BE |
| Difficulty | Very High |
| Depends On | 1.3, 2.3 |

**What you are building:** An algorithm that finds duplicate entities. When two records say "Sequoia Capital Inc." and "Sequoia Capital Operations LLC", the system should flag them as a potential match with a confidence score.

**Instructions:**

1. Install: `npm install fastest-levenshtein`

2. Create `server/lib/entityResolution.js`:

   ```javascript
   import { distance } from 'fastest-levenshtein';
   
   // Jaro-Winkler string similarity (0 to 1, 1 = identical)
   export function jaroWinkler(s1, s2) { /* implement or use a library */ }
   
   // Compare two organizations, return 0-100 confidence score
   export function scoreOrgPair(org1, org2) {
     let score = 0;
     
     // Name similarity (weight: 35%)
     const nameSim = jaroWinkler(
       normalizeOrgName(org1.legal_name),
       normalizeOrgName(org2.legal_name)
     );
     score += nameSim * 35;
     
     // Domain match (weight: 20%)
     if (org1.website && org2.website) {
       const domain1 = new URL(org1.website).hostname;
       const domain2 = new URL(org2.website).hostname;
       if (domain1 === domain2) score += 20;
     }
     
     // Location match (weight: 10%)
     if (org1.hq_city === org2.hq_city && org1.hq_country === org2.hq_country) {
       score += 10;
     }
     
     // Shared tags (weight: 20%)
     const sharedTags = org1.investor_type_tags.filter(t => org2.investor_type_tags.includes(t));
     score += (sharedTags.length / Math.max(org1.investor_type_tags.length, 1)) * 20;
     
     // ... add more factors
     
     return Math.round(score);
   }
   ```

3. Create a "blocking" function that groups candidates to avoid comparing every record against every other record (which would be millions of comparisons):
   ```javascript
   // Only compare orgs in the same country or industry
   export async function generateCandidatePairs(pool) {
     const { rows } = await pool.query(`
       SELECT a.id as id1, b.id as id2 
       FROM organizations a, organizations b
       WHERE a.id < b.id
       AND a.hq_country = b.hq_country
     `);
     return rows;
   }
   ```

4. Create HITL queue endpoints:
   ```
   GET  /api/er/queue             List candidate pairs for review
   POST /api/er/queue/:id/merge   Approve merge
   POST /api/er/queue/:id/reject  Reject (not a duplicate)
   ```

5. Connect to `EntityResolutionPage.jsx` — replace the hardcoded queue items with real candidate pairs.

**Deliverables:**
- `server/lib/entityResolution.js` (scoring + blocking)
- ER queue table and CRUD endpoints
- Merge and reject logic
- EntityResolutionPage connected to real data

---

### Task 4.2 — LLM Integration Layer

| Field | Detail |
|-------|--------|
| Roles | DS, BE, CS |
| Difficulty | High |
| Depends On | 1.2 |

**What you are building:** A module that can call LLM APIs (OpenAI, Anthropic, Google) with a unified interface, track costs, and manage prompt templates.

**Instructions:**

1. Install: `npm install openai @anthropic-ai/sdk`

2. Create `server/lib/llm.js`:
   ```javascript
   import OpenAI from 'openai';
   
   const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
   
   export async function callLLM({ model, prompt, systemPrompt, maxTokens, temperature }) {
     const start = Date.now();
     
     const response = await openai.chat.completions.create({
       model: model || 'gpt-4o-mini',
       messages: [
         { role: 'system', content: systemPrompt || 'You are a helpful assistant.' },
         { role: 'user', content: prompt }
       ],
       max_tokens: maxTokens || 1000,
       temperature: temperature || 0.3
     });
     
     const usage = response.usage;
     const cost = calculateCost(model, usage.prompt_tokens, usage.completion_tokens);
     
     // Log to llm_usage table
     await logLLMUsage({ model, promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, cost, latencyMs: Date.now() - start });
     
     return {
       content: response.choices[0].message.content,
       usage,
       cost
     };
   }
   ```

3. Create a `prompt_templates` table (id, name, version, system_prompt, user_prompt_template, model, max_tokens, temperature, created_by, timestamps).

4. Create `server/routes/llmRoutes.js`:
   ```
   POST /api/llm/complete          Send a prompt, get a response
   GET  /api/llm/usage             Get cost/usage stats
   GET  /api/llm/templates         List prompt templates
   POST /api/llm/templates         Create a template
   ```

5. Create a `llm_usage` table to track every call: timestamp, model, tokens, cost, latency, task_type.

6. Connect to `LLMOrchestratorPage.jsx` — replace hardcoded models and cost data.

**Deliverables:**
- `server/lib/llm.js`
- `server/routes/llmRoutes.js`
- prompt_templates and llm_usage tables
- LLMOrchestratorPage connected to real data

---

### Task 4.3 — Dashboard Data Connection

| Field | Detail |
|-------|--------|
| Roles | FE, BE |
| Difficulty | Medium |
| Depends On | 1.3, 2.4 |

**What you are building:** The dashboard currently shows fake numbers (847,293 entities, 98.7% precision, etc.). You will replace these with real counts from the database.

**Instructions:**

1. Create `GET /api/dashboard/stats` that returns:
   ```json
   {
     "entity_counts": {
       "organizations": 312,
       "people": 198,
       "funds": 142,
       "deals": 112
     },
     "recent_audit": [ /* last 10 audit entries */ ],
     "active_jobs": [ /* running ingestion jobs */ ],
     "er_queue_count": 31
   }
   ```

2. Open `src/pages/DashboardPage.jsx`. On line 6, you see `const kpis = [...]` with hardcoded values. Replace this with:
   ```javascript
   const [stats, setStats] = useState(null);
   const { token } = useAuth();
   
   useEffect(() => {
     fetch('/api/dashboard/stats', {
       headers: { 'Authorization': `Bearer ${token}` }
     })
     .then(res => res.json())
     .then(data => setStats(data));
   }, []);
   
   if (!stats) return <div>Loading...</div>;
   ```

3. Replace all hardcoded numbers with values from `stats`. If a value doesn't exist yet (like ER precision), show "N/A" or "—" instead of a fake number.

**Deliverables:**
- Dashboard stats API endpoint
- DashboardPage.jsx fully connected
- Loading state while data fetches
- No more fake numbers

---

### Task 4.4 — Knowledge Graph Visualization

| Field | Detail |
|-------|--------|
| Roles | FE, CS |
| Difficulty | Very High |
| Depends On | 1.4 |

**What you are building:** An interactive graph that visualizes how entities are connected. Right now `GraphPage.jsx` shows a static SVG. You will replace it with a real, interactive graph using a visualization library.

**Instructions:**

1. Choose a library. Recommended: `vis-network` (easiest), `cytoscape` (most powerful), or `d3-force` (most flexible).
   ```bash
   npm install vis-network vis-data
   ```

2. Create `src/components/NetworkGraph.jsx`:
   ```javascript
   import { useEffect, useRef } from 'react';
   import { Network } from 'vis-network';
   import { DataSet } from 'vis-data';
   
   const NetworkGraph = ({ nodes, edges, onNodeClick }) => {
     const containerRef = useRef(null);
     
     useEffect(() => {
       const data = { nodes: new DataSet(nodes), edges: new DataSet(edges) };
       const options = {
         nodes: { shape: 'dot', font: { color: '#E2E8F0', size: 12 } },
         edges: { color: '#4A5568', arrows: 'to' },
         physics: { stabilization: { iterations: 100 } }
       };
       const network = new Network(containerRef.current, data, options);
       network.on('click', (params) => {
         if (params.nodes.length > 0) onNodeClick(params.nodes[0]);
       });
       return () => network.destroy();
     }, [nodes, edges]);
     
     return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
   };
   ```

3. In `GraphPage.jsx`, fetch entity data from the relationship API (`GET /api/orgs/:id/network`) and transform it into nodes and edges for the graph. Color nodes by type:
   - Organizations: `#C9A84C` (gold)
   - People: `#60A5FA` (blue)
   - Funds: `#2DD4BF` (teal)
   - Deals: `#A78BFA` (purple)

4. When user clicks a node, show the entity detail panel from Task 3.3.

5. Add a search bar: type a name, call the search API, center the graph on that entity.

**Deliverables:**
- `src/components/NetworkGraph.jsx`
- Updated GraphPage.jsx with real data
- Node click showing entity details
- Search and center functionality

---

## Phase 5 — Quality and Polish (Weeks 6–8)

### Task 5.1 — Automated Test Suite

| Field | Detail |
|-------|--------|
| Roles | QA, CS, BE |
| Difficulty | Medium |
| Depends On | None — start immediately |

**What you are building:** Automated tests that verify the backend and frontend work correctly.

**Step-by-step instructions:**

1. Install test frameworks:
   ```bash
   npm install --save-dev vitest supertest @playwright/test
   npx playwright install
   ```

2. Add test script to `package.json`:
   ```json
   "scripts": {
     "test": "vitest run",
     "test:e2e": "playwright test"
   }
   ```

3. Create folder structure:
   ```
   tests/
     api/
       auth.test.js
       users.test.js
       sessions.test.js
       apiKeys.test.js
     e2e/
       login.spec.js
       register.spec.js
       dashboard.spec.js
   ```

4. Write `tests/api/auth.test.js`. Here is the exact pattern to follow:

   ```javascript
   import { describe, it, expect, beforeAll } from 'vitest';
   import request from 'supertest';
   import app from '../../server/server.js';
   
   describe('POST /api/auth/login', () => {
     it('should return tokens for valid credentials', async () => {
       const res = await request(app)
         .post('/api/auth/login')
         .send({ email: 'Liquidity.ai@Liquidity.ai.com', password: 'Liquidity.aiI2026!' });
       
       expect(res.status).toBe(200);
       expect(res.body).toHaveProperty('accessToken');
       expect(res.body).toHaveProperty('refreshToken');
       expect(res.body.user.role).toBe('super_admin');
     });
     
     it('should return 401 for wrong password', async () => {
       const res = await request(app)
         .post('/api/auth/login')
         .send({ email: 'Liquidity.ai@Liquidity.ai.com', password: 'wrongpassword' });
       
       expect(res.status).toBe(401);
       expect(res.body).toHaveProperty('error');
     });
     
     it('should return 400 for missing email', async () => {
       const res = await request(app)
         .post('/api/auth/login')
         .send({ password: 'Liquidity.aiI2026!' });
       
       expect(res.status).toBe(400);
     });
     
     // More tests: locked account, pending user, rate limiting...
   });
   ```

5. Write at least these test cases:
   - **Auth (15 cases):** Login success, wrong password, missing fields, locked account, pending user, suspended user, token refresh, password change success, password change wrong current
   - **RBAC (10 cases):** Super admin can access everything, viewer cannot modify, escalation prevention (admin cant make super_admin), permission check on protected routes
   - **Users (10 cases):** List users, get user by ID, approve pending user, deny user, suspend user, restore user, change role, delete (super_admin only), edit user details
   - **Frontend smoke (11 cases):** Each page loads without crashing

6. For Playwright E2E tests, create `tests/e2e/login.spec.js`:
   ```javascript
   import { test, expect } from '@playwright/test';
   
   test('login page loads', async ({ page }) => {
     await page.goto('http://localhost:5173');
     await expect(page.getByPlaceholder('Email')).toBeVisible();
   });
   
   test('login with valid credentials', async ({ page }) => {
     await page.goto('http://localhost:5173');
     await page.fill('[placeholder="Email"]', 'Liquidity.ai@Liquidity.ai.com');
     await page.fill('[placeholder="Password"]', 'Liquidity.aiI2026!');
     await page.click('button[type="submit"]');
     await expect(page.getByText('Knowledge Graph Overview')).toBeVisible({ timeout: 5000 });
   });
   ```

**How to verify:**
- `npm test` runs all backend tests and they all pass
- `npm run test:e2e` runs Playwright tests and they all pass
- No skipped or pending tests

**Deliverables:**
- Test configuration files (vitest.config.js, playwright.config.js)
- All test files in `tests/` directory
- Updated package.json with test scripts
- Test results screenshot in PR

---

### Task 5.2 — WebSocket Real-Time Updates

| Field | Detail |
|-------|--------|
| Roles | BE, FE, CS |
| Difficulty | Medium |
| Depends On | 4.3 |

Instructions: Install `socket.io` and `socket.io-client`. Set up the server in `server.js`. Emit events when audit entries are created, jobs progress, or users register. On the frontend, subscribe in Dashboard and Pipeline pages. Add a toast notification component for real-time alerts. Follow the Socket.io "Get Started" guide: https://socket.io/get-started/chat

---

### Task 5.3 — Provenance and Field-Level Tracking

| Field | Detail |
|-------|--------|
| Roles | BE, DB |
| Difficulty | High |
| Depends On | 1.3, 2.3 |

Instructions: Create `field_provenance` table (entity_id, field_name, value, source, source_type, confidence, timestamp). During import (Task 2.3), write a provenance record for every field. When multiple sources give different values, keep all and mark the highest-confidence as canonical. Build a dispute API: POST /api/provenance/dispute to flag a value, GET /api/provenance/:entityId to see all sources for an entity. Connect to ProvenancePage.jsx.

---

### Task 5.4 — Security Hardening

| Field | Detail |
|-------|--------|
| Roles | DO, BE |
| Difficulty | Medium |
| Depends On | 1.2 |

Instructions: Add TOTP-based MFA. Install `otplib`. Create endpoints: POST /api/auth/mfa/setup (returns QR code URL and secret), POST /api/auth/mfa/verify (validates 6-digit code), POST /api/auth/mfa/disable. Modify the login flow: if user has MFA enabled, return a `mfa_required: true` response instead of tokens, then require a second POST with the TOTP code to complete login. Generate 10 recovery codes during setup. Add password history: store hashed previous passwords, reject reuse. Connect SecurityPage.jsx to real SOC 2 data.

---

### Task 5.5 — Email Notifications

| Field | Detail |
|-------|--------|
| Roles | BE, CS |
| Difficulty | Low |
| Depends On | None — start immediately |

Instructions: Install `nodemailer`. Create `server/lib/email.js`. Set up with environment variables (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS). Create 4 HTML email templates as string literals: signup approved, signup denied, password reset, security alert. Call the email function from the existing route handlers where these events happen (e.g., in `userRoutes.js` after approving a user, send the approval email). Test with Mailtrap.io (free SMTP testing service) — sign up, get test credentials, add to .env.

---

### Task 5.6 — Mobile Responsiveness

| Field | Detail |
|-------|--------|
| Roles | FE, UX |
| Difficulty | Low |
| Depends On | None — start immediately |

Instructions: Open `src/index.css` and add media queries at the bottom. At `@media (max-width: 768px)`: hide the sidebar, add a hamburger menu button, make `.grid-2`, `.grid-3`, `.grid-4` all `grid-template-columns: 1fr`. Make tables horizontally scrollable with `overflow-x: auto`. Test by resizing your browser window. Take screenshots at 375px (iPhone), 768px (tablet), and 1024px (small laptop) widths.

---

### Task 5.7 — API Documentation

| Field | Detail |
|-------|--------|
| Roles | TW, BE |
| Difficulty | Low |
| Depends On | None — start immediately |

Instructions: Install `swagger-jsdoc` and `swagger-ui-express`. Add JSDoc comments above every route handler in `server/routes/`. Format:
```javascript
/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Authenticate user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful, returns tokens
 */
```
Mount swagger-ui at `app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec))`. Verify by visiting `http://localhost:3001/api/docs` in your browser.
