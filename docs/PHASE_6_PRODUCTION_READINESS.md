# Liquidity.ai — Phase 6: Production Readiness

**Prerequisite:** All Phase 1–5 intern tasks completed and merged.  
**Audience:** Senior engineering / DevOps (not interns).  
**Goal:** Take the working MVP to a deployable, monitored, secure production system.

---

## Table of Contents

1. [Cloud Infrastructure](#1-cloud-infrastructure)
2. [CI/CD Pipeline](#2-cicd-pipeline)
3. [Database Operations](#3-database-operations)
4. [Monitoring and Observability](#4-monitoring-and-observability)
5. [Security and Compliance](#5-security-and-compliance)
6. [External Data Integrations](#6-external-data-integrations)
7. [Business and Analytics](#7-business-and-analytics)
8. [Performance and Scaling](#8-performance-and-scaling)

---

## 1. Cloud Infrastructure

### 1.1 — Cloud Deployment

**Current state:** Docker runs locally only. No cloud hosting.

**Recommended path:** Start with a managed platform (Railway or Render) for speed, migrate to AWS/GCP later if needed for scale.

**Option A — Railway (fastest, recommended for MVP launch):**

1. Create a Railway account at https://railway.app
2. Connect your GitHub repository
3. Add two services:
   - **Web service:** Points to the Dockerfile, runs `npm start`
   - **PostgreSQL:** Railway provides managed PostgreSQL with automatic backups
4. Set environment variables in Railway dashboard:
   ```
   NODE_ENV=production
   DATABASE_URL=<railway provides this automatically>
   JWT_SECRET=<generate with: openssl rand -base64 64>
   JWT_REFRESH_SECRET=<generate with: openssl rand -base64 64>
   CORS_ORIGIN=https://your-domain.com
   OPENAI_API_KEY=sk-...
   SMTP_HOST=...
   SMTP_USER=...
   SMTP_PASS=...
   ```
5. Railway auto-deploys on every push to `main`. Cost: ~$5-20/month at low traffic.

**Option B — AWS (for enterprise scale):**

1. **Compute:** ECS Fargate (containerized, no server management)
   - Create an ECR repository for Docker images
   - Create an ECS cluster with Fargate tasks
   - Create a task definition pointing to your Docker image
   - Create a service with desired count = 2 (for redundancy)

2. **Database:** RDS PostgreSQL
   - Instance: `db.t3.medium` (2 vCPU, 4GB RAM) for start
   - Enable Multi-AZ for failover
   - Enable automated backups with 7-day retention
   - Enable encryption at rest (AES-256)
   - Put in a private subnet (not publicly accessible)

3. **Networking:**
   - VPC with public and private subnets
   - Application Load Balancer (ALB) in public subnet
   - ECS tasks and RDS in private subnets
   - Security groups: ALB allows 80/443 from internet, ECS allows traffic from ALB only, RDS allows 5432 from ECS only

4. **Storage:** S3 bucket for uploaded files (replace local `data/uploads/`)
   - Enable server-side encryption
   - Enable versioning
   - Set lifecycle policy: move to Glacier after 90 days

Cost estimate: $150-300/month at low traffic.

### 1.2 — Domain and SSL

1. Register a domain (e.g., `Liquidity.ai.com`, `app.Liquidity.ai.com`)
2. If using Railway: add custom domain in settings, Railway handles SSL automatically
3. If using AWS:
   - Request an SSL certificate from AWS Certificate Manager (free)
   - Attach to ALB
   - Create Route53 hosted zone, point domain to ALB
4. Force HTTPS: redirect all HTTP to HTTPS in the Express server or at the load balancer level

### 1.3 — CDN for Frontend

1. Build the frontend: `npm run build` (outputs to `dist/`)
2. If using AWS:
   - Create a CloudFront distribution
   - Origin: S3 bucket containing the `dist/` files
   - Cache behavior: cache everything except `/api/*`
   - Alternate domain: `app.Liquidity.ai.com`
   - Attach the SSL certificate
3. If using Railway/Render: CDN is optional at first — the platform serves static files fine for initial traffic. Add CloudFront or Cloudflare later.

### 1.4 — Staging Environment

1. Create a second deployment environment (staging):
   - Railway: create a second project linked to the `dev` branch
   - AWS: duplicate the ECS service and RDS instance in a separate environment
2. Staging should have its own database (clone of production schema, but with test data)
3. All PRs deploy to staging first. Production deploys only from `main` branch.
4. Staging URL: `staging.Liquidity.ai.com` or `staging-Liquidity.ai.up.railway.app`

---

## 2. CI/CD Pipeline

### 2.1 — GitHub Actions for Testing

Create `.github/workflows/test.yml`:

```yaml
name: Test Suite

on:
  pull_request:
    branches: [main, dev]
  push:
    branches: [main, dev]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: Liquidity.ai_test
          POSTGRES_PASSWORD: test_password
          POSTGRES_DB: Liquidity.ai_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - name: Run backend tests
        env:
          DATABASE_URL: postgresql://Liquidity.ai_test:test_password@localhost:5432/Liquidity.ai_test
          JWT_SECRET: test-secret-key-for-ci
          JWT_REFRESH_SECRET: test-refresh-secret-for-ci
          NODE_ENV: test
        run: npm test

      - name: Build frontend
        run: npm run build
```

### 2.2 — GitHub Actions for Deployment

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4

      # For Railway:
      - name: Deploy to Railway
        uses: berviantoleo/railway-deploy@main
        with:
          railway_token: ${{ secrets.RAILWAY_TOKEN }}
          service: Liquidity.ai-web

      # For AWS: build Docker image, push to ECR, update ECS service
```

### 2.3 — Branch Protection Rules

In GitHub repository settings:

1. **`main` branch:** Require pull request reviews (1 approval), require status checks to pass (test workflow), require branches to be up to date, do not allow force pushes
2. **`dev` branch:** Require status checks to pass, allow direct pushes for lead only

---

## 3. Database Operations

### 3.1 — Automated Backups

**On Railway:** Backups are automatic (daily). Enable point-in-time recovery in the database settings.

**On AWS RDS:** Already configured in section 1.1. Additionally:

1. Create a manual snapshot before every major deployment:
   ```bash
   aws rds create-db-snapshot \
     --db-instance-identifier Liquidity.ai-prod \
     --db-snapshot-identifier Liquidity.ai-pre-deploy-$(date +%Y%m%d)
   ```

2. Test restore quarterly: spin up a new RDS instance from the latest snapshot, verify data integrity, then delete the test instance.

**Self-managed PostgreSQL (Docker):**

1. Create a backup script `scripts/backup-db.sh`:
   ```bash
   #!/bin/bash
   TIMESTAMP=$(date +%Y%m%d_%H%M%S)
   BACKUP_DIR="/backups"
   
   pg_dump -h localhost -U Liquidity.ai Liquidity.ai | gzip > "$BACKUP_DIR/Liquidity.ai_$TIMESTAMP.sql.gz"
   
   # Upload to S3
   aws s3 cp "$BACKUP_DIR/Liquidity.ai_$TIMESTAMP.sql.gz" \
     s3://Liquidity.ai-backups/db/$TIMESTAMP.sql.gz
   
   # Keep only last 30 local backups
   ls -t $BACKUP_DIR/Liquidity.ai_*.sql.gz | tail -n +31 | xargs rm -f
   ```

2. Schedule with cron: `0 2 * * * /opt/Liquidity.ai/scripts/backup-db.sh` (daily at 2 AM)

### 3.2 — Migration Management

1. Install a migration tool. Recommended: `node-pg-migrate`.
   ```bash
   npm install node-pg-migrate
   ```

2. Add to `package.json`:
   ```json
   "scripts": {
     "migrate:up": "node-pg-migrate up",
     "migrate:down": "node-pg-migrate down",
     "migrate:create": "node-pg-migrate create"
   }
   ```

3. Every schema change goes through a numbered migration file. Never edit the database schema directly in production.

4. Run migrations as part of the deployment process (before the app starts):
   ```bash
   npm run migrate:up && npm start
   ```

### 3.3 — Encryption at Rest

**AWS RDS:** Enable encryption when creating the instance (AES-256, managed by AWS KMS). Cannot be added after creation — must create a new encrypted instance and migrate data.

**Self-managed:** Use PostgreSQL's `pgcrypto` extension for column-level encryption on sensitive fields, or use full-disk encryption on the server.

---

## 4. Monitoring and Observability

### 4.1 — Error Tracking (Sentry)

1. Create a Sentry account at https://sentry.io (free tier: 5K errors/month)
2. Install:
   ```bash
   npm install @sentry/node
   ```
3. Initialize in `server/server.js` (must be first import):
   ```javascript
   import * as Sentry from '@sentry/node';
   
   Sentry.init({
     dsn: process.env.SENTRY_DSN,
     environment: process.env.NODE_ENV,
     tracesSampleRate: 0.1, // 10% of requests get performance traces
   });
   
   // Add as first middleware
   app.use(Sentry.Handlers.requestHandler());
   
   // Add as last error handler (before your custom error handler)
   app.use(Sentry.Handlers.errorHandler());
   ```
4. Add frontend error tracking:
   ```bash
   npm install @sentry/react
   ```
   Initialize in `src/main.jsx`:
   ```javascript
   import * as Sentry from '@sentry/react';
   Sentry.init({ dsn: process.env.VITE_SENTRY_DSN });
   ```

### 4.2 — Application Monitoring

**Option A — Uptime monitoring (free):**
- Use UptimeRobot (https://uptimerobot.com, free for 50 monitors)
- Monitor `https://app.Liquidity.ai.com/api/health` every 5 minutes
- Alert via email/Slack on downtime

**Option B — Full APM (recommended for production):**
- Use Datadog, New Relic, or Grafana Cloud
- Track: request latency (p50, p95, p99), error rates, database query times, LLM API latencies
- Set up alerts:
  - Error rate > 5% for 5 minutes → PagerDuty/Slack alert
  - p95 latency > 3s for 10 minutes → warning
  - Database connection pool exhausted → critical alert

### 4.3 — Log Aggregation

**Current state:** Logs go to `console.log` and disappear when the container restarts.

**Solution:**

1. Install a structured logging library:
   ```bash
   npm install pino pino-pretty
   ```

2. Replace console.log throughout the codebase:
   ```javascript
   import pino from 'pino';
   const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
   
   // Instead of: console.log('[AUTH] Login successful for', email);
   logger.info({ email, action: 'login_success' }, 'User logged in');
   ```

3. In production, pipe logs to a service:
   - **Railway:** Logs are captured automatically, viewable in dashboard
   - **AWS:** Use CloudWatch Logs (ECS sends stdout/stderr automatically)
   - **Self-managed:** Ship to Grafana Loki, Datadog, or Papertrail

### 4.4 — Health Check Endpoint Enhancement

The existing `/api/health` endpoint is basic. Upgrade it:

```javascript
app.get('/api/health', async (req, res) => {
  const checks = {};

  // Database connectivity
  try {
    await pool.query('SELECT 1');
    checks.database = 'healthy';
  } catch (e) {
    checks.database = 'unhealthy';
  }

  // Disk space (for uploads)
  // Memory usage
  checks.memory_mb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  checks.uptime_seconds = Math.round(process.uptime());

  const healthy = checks.database === 'healthy';
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'degraded',
    checks,
    version: process.env.npm_package_version,
    timestamp: new Date().toISOString()
  });
});
```

---

## 5. Security and Compliance

### 5.1 — Environment Variable Management

1. Never commit `.env` files. Verify `.gitignore` includes `.env*`
2. Use the cloud provider's secret management:
   - Railway: environment variables in dashboard (encrypted)
   - AWS: Secrets Manager or Parameter Store
3. Rotate JWT secrets quarterly. Process:
   - Generate new secret
   - Deploy with both old and new secret accepted (grace period)
   - After 24 hours, remove old secret
   - All active sessions will be invalidated (users re-login)

### 5.2 — Data Retention and Deletion

1. Create a retention policy document (`docs/DATA_RETENTION_POLICY.md`):
   - Audit logs: retain 2 years, then archive to cold storage
   - Session records: purge revoked sessions after 90 days
   - Uploaded files: retain 1 year, then move to archive
   - User data: retain while account is active, delete 30 days after account deletion request

2. Implement automated cleanup:
   ```javascript
   // Run daily via cron
   async function runRetentionCleanup() {
     // Purge old revoked sessions
     await pool.query(`
       DELETE FROM sessions
       WHERE revoked = true AND revoked_at < NOW() - INTERVAL '90 days'
     `);

     // Archive old audit logs
     await pool.query(`
       INSERT INTO audit_log_archive SELECT * FROM audit_log
       WHERE timestamp < NOW() - INTERVAL '2 years'
     `);
     await pool.query(`
       DELETE FROM audit_log WHERE timestamp < NOW() - INTERVAL '2 years'
     `);
   }
   ```

### 5.3 — GDPR Compliance

1. **Right to access:** Build `GET /api/users/:id/export` that returns all data associated with a user (audit entries, sessions, API keys, uploaded files) as a downloadable JSON/CSV.

2. **Right to deletion:** Build `POST /api/users/:id/gdpr-delete` that:
   - Anonymizes audit log entries (replace email/name with "DELETED_USER_xxxx")
   - Deletes sessions, API keys
   - Deletes the user account
   - Logs the deletion as an audit event (required for compliance — you need to prove you deleted it)

3. **Cookie consent:** If using analytics (PostHog, Mixpanel), you need a cookie consent banner on first visit.

4. **Privacy policy page:** Required if operating in EU or handling EU user data.

### 5.4 — SOC 2 Preparation

The intern task (5.4) builds the dashboard. To actually achieve SOC 2:

1. Hire a SOC 2 auditor (firms like Vanta, Drata, or Secureframe automate much of this)
2. The existing features that map to SOC 2 controls:
   - CC6.1 (Logical Access): RBAC, MFA, session management
   - CC6.2 (User Provisioning): Approval workflow, risk scoring
   - CC6.3 (Activity Logging): Audit trail, immutable logs
   - CC7.2 (Change Management): Git-based code review, PRs
   - CC8.1 (Data Integrity): Provenance tracking, confidence scores
3. What you still need for SOC 2:
   - Formal security policies (in writing, signed by leadership)
   - Annual access reviews (review who has access to what)
   - Incident response plan (what to do if breached)
   - Vendor risk assessments (evaluate AWS, OpenAI, etc.)
   - Employee security training records

### 5.5 — Penetration Testing

1. Before launch, run an automated security scan:
   - Use OWASP ZAP (free, open-source): `docker run -t owasp/zap2docker-stable zap-baseline.py -t https://staging.Liquidity.ai.com`
   - Fix any high or medium findings
2. For a more thorough assessment, hire a pentest firm after MVP launch
3. Common vulnerabilities to check manually:
   - SQL injection on all search endpoints
   - XSS on any user-input fields displayed in the UI
   - IDOR (can user A access user B's data by changing IDs in the URL?)
   - JWT misuse (expired tokens, tampered tokens)
   - Rate limiting actually works under load

---

## 6. External Data Integrations

### 6.1 — API Integrations

The intern task sheet covers manual CSV upload. For production, you need live data feeds.

**SEC EDGAR (free, public):**
1. Use the EDGAR Full-Text Search API: `https://efts.sec.gov/LATEST/search-index`
2. Build a scheduled job (daily) that pulls new filings
3. Parse filing types: 13-F (fund holdings), D (private placements), ADV (investment advisor)
4. Map to your schema: filing entity → organization, holdings → deals/funds

**PitchBook / Crunchbase / Preqin (paid APIs):**
1. Apply for API access (enterprise pricing, typically $10K-50K/year)
2. Build adapter modules: `server/integrations/pitchbook.js`, `crunchbase.js`, etc.
3. Each adapter follows the same interface:
   ```javascript
   export async function fetchOrganizations(filters, lastSyncDate) { }
   export async function fetchDeals(filters, lastSyncDate) { }
   export function mapToCanonical(rawRecord) { }  // transform to your schema
   ```
4. Respect rate limits (store in config, implement backoff)

**LinkedIn (scraping is against TOS):**
- Use LinkedIn's official partner APIs (requires business relationship)
- Or accept manual PDF uploads only (already covered in Phase 2)

### 6.2 — Scheduled Data Refresh

1. Install: `npm install node-cron`

2. Create `server/jobs/scheduler.js`:
   ```javascript
   import cron from 'node-cron';

   // Daily at 3 AM: pull new SEC filings
   cron.schedule('0 3 * * *', async () => {
     logger.info('Starting SEC EDGAR sync');
     await syncSECFilings();
   });

   // Weekly Sunday at 2 AM: full re-sync from PitchBook
   cron.schedule('0 2 * * 0', async () => {
     logger.info('Starting PitchBook weekly sync');
     await syncPitchBook();
   });

   // Every 6 hours: check for stale records
   cron.schedule('0 */6 * * *', async () => {
     await flagStaleRecords();
   });
   ```

3. Stale data detection:
   ```javascript
   async function flagStaleRecords() {
     // Flag orgs not updated in 90+ days
     await pool.query(`
       UPDATE organizations SET status = 'stale'
       WHERE updated_at < NOW() - INTERVAL '90 days'
       AND status = 'active'
     `);
   }
   ```

### 6.3 — Data Quality Scoring

Beyond the basic confidence_score from interns:

1. Create a composite data quality score per entity:
   - **Completeness:** What percentage of fields are filled? (name + HQ + AUM + type = 100%, name only = 25%)
   - **Freshness:** How recently was this record updated?
   - **Source diversity:** Data from 3+ sources is more reliable than 1 source
   - **Consistency:** Do different sources agree on key fields?

2. Store as a computed column or update via a scheduled job. Display on entity detail pages.

---

## 7. Business and Analytics

### 7.1 — Product Analytics

1. Install PostHog (open source, free self-hosted or cloud free tier):
   ```bash
   npm install posthog-js
   ```

2. Initialize in `src/main.jsx`:
   ```javascript
   import posthog from 'posthog-js';
   posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
     api_host: 'https://app.posthog.com'
   });
   ```

3. Track key events:
   ```javascript
   // On login
   posthog.identify(user.id, { email: user.email, role: user.role });

   // On page view (add to App.jsx when page changes)
   posthog.capture('page_view', { page: activePage });

   // On entity search
   posthog.capture('entity_search', { query: searchQuery, results: count });

   // On file upload
   posthog.capture('file_uploaded', { format: fileType, rowCount: rows });
   ```

4. Build dashboards in PostHog:
   - Daily active users
   - Most-used views (which investor types are most popular)
   - Search query patterns
   - Feature adoption (who uses graph vs. table vs. pipeline)

### 7.2 — Customer Onboarding Flow

1. Create a first-login experience:
   - Welcome modal explaining the platform
   - Guided tour highlighting key features (use a library like `react-joyride`)
   - Prompt to upload their first dataset
   - Suggest default views to explore

2. Create an empty-state design for each page:
   - Dashboard with no data: "Upload your first dataset to get started"
   - Graph with no entities: "Add organizations and people to see your network"
   - Pipeline with no jobs: "Import a CSV to begin"

### 7.3 — Data Export

1. Add export endpoints for every entity list:
   ```
   GET /api/orgs/export?format=csv&filters=...
   GET /api/orgs/export?format=json&filters=...
   GET /api/views/:slug/export?format=csv
   ```

2. For large exports (10K+ rows), use streaming:
   ```javascript
   router.get('/api/orgs/export', async (req, res) => {
     res.setHeader('Content-Type', 'text/csv');
     res.setHeader('Content-Disposition', 'attachment; filename="organizations.csv"');

     const cursor = pool.query(new Cursor('SELECT * FROM organizations'));
     // Stream rows to response
   });
   ```

3. Add "Export" buttons to the UI on every data table and view.

### 7.4 — Billing (If Commercializing)

1. Integrate Stripe for subscriptions:
   - Free tier: 100 entities, 1 user, basic views
   - Pro tier: unlimited entities, 5 users, all views + LLM features
   - Enterprise: unlimited everything, SSO, custom integrations

2. Track usage: entity count, LLM API calls, file uploads per month

3. Add billing page to Settings: current plan, usage meters, upgrade button

---

## 8. Performance and Scaling

### 8.1 — Caching Layer

1. Add Redis for caching:
   ```bash
   npm install ioredis
   ```

2. Cache expensive queries:
   ```javascript
   import Redis from 'ioredis';
   const redis = new Redis(process.env.REDIS_URL);

   async function getDashboardStats() {
     const cached = await redis.get('dashboard:stats');
     if (cached) return JSON.parse(cached);

     const stats = await computeDashboardStats(); // expensive DB queries
     await redis.set('dashboard:stats', JSON.stringify(stats), 'EX', 300); // 5 min TTL
     return stats;
   }
   ```

3. Cache targets: dashboard stats, view results, entity search results, LLM responses

### 8.2 — Database Optimization

1. Add database indexes based on actual query patterns:
   ```sql
   -- After launch, check slow queries:
   SELECT query, mean_time, calls FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 20;
   ```

2. Add connection pooling tuning:
   ```javascript
   const pool = new pg.Pool({
     connectionString: process.env.DATABASE_URL,
     max: 20,              // max connections
     idleTimeoutMillis: 30000,
     connectionTimeoutMillis: 2000,
   });
   ```

3. For large tables (100K+ rows): add materialized views for common aggregations, partition tables by date or entity type if needed.

### 8.3 — Load Testing

1. Install: `npm install -g artillery`

2. Create `tests/load/basic.yml`:
   ```yaml
   config:
     target: "https://staging.Liquidity.ai.com"
     phases:
       - duration: 60
         arrivalRate: 10   # 10 users/second for 60 seconds
       - duration: 120
         arrivalRate: 50   # ramp to 50 users/second

   scenarios:
     - name: "Browse entities"
       flow:
         - post:
             url: "/api/auth/login"
             json: { "email": "load-test@Liquidity.ai.com", "password": "..." }
             capture:
               - json: "$.accessToken"
                 as: "token"
         - get:
             url: "/api/orgs?page=1&limit=25"
             headers:
               Authorization: "Bearer {{ token }}"
         - get:
             url: "/api/dashboard/stats"
             headers:
               Authorization: "Bearer {{ token }}"
   ```

3. Run: `artillery run tests/load/basic.yml`

4. Targets:
   - p95 response time under 500ms at 50 concurrent users
   - Zero errors at 100 concurrent users
   - Identify breaking point (where errors start appearing)

### 8.4 — Horizontal Scaling (Future)

When traffic exceeds what one server handles:

1. The Express app is already stateless (JWT auth, no server-side sessions) — safe to run multiple instances behind a load balancer
2. Add Redis for shared state (rate limiting counters, cache, WebSocket adapter)
3. Run 2-4 instances behind the load balancer
4. Database: add a read replica for heavy read traffic (search, views, dashboard)

---

## Deployment Checklist

Before the first production deployment, verify:

- [ ] All Phase 1–5 tasks completed and merged
- [ ] All tests pass (`npm test` and `npm run test:e2e`)
- [ ] Environment variables set in cloud provider (not in code)
- [ ] PostgreSQL accessible from the application server
- [ ] SSL certificate active (HTTPS working)
- [ ] Sentry DSN configured (error tracking live)
- [ ] Health check endpoint returning 200
- [ ] Uptime monitor configured
- [ ] Database backups running and verified
- [ ] `.env` file is in `.gitignore`
- [ ] Default admin password changed from `Liquidity.aiI2026!`
- [ ] Rate limiting configured for production values
- [ ] CORS origin set to production domain (not `*`)
- [ ] Security scan (OWASP ZAP) run with no high-severity findings
- [ ] Load test run: acceptable performance under expected traffic
- [ ] Data retention policy documented
- [ ] Privacy policy page published (if required)

---

## Priority Order

If resources are limited, do these first:

| Priority | Task | Why |
|:--------:|------|-----|
| 1 | Cloud deployment (1.1) | Can't launch without hosting |
| 2 | Domain + SSL (1.2) | Users need a URL |
| 3 | CI/CD (2.1, 2.2) | Prevents broken deploys |
| 4 | Error tracking (4.1) | Know when things break |
| 5 | Database backups (3.1) | Cannot lose data |
| 6 | Health monitoring (4.2) | Know when it's down |
| 7 | Branch protection (2.3) | Prevent accidental bad merges |
| 8 | Log aggregation (4.3) | Debug production issues |
| 9 | Load testing (8.3) | Know your capacity |
| 10 | Everything else | After launch, iterate |
