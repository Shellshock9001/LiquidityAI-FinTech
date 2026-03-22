# Liquidity.ai — API & Data Licensing Cost Sheet

**Prepared:** March 2026 | **Purpose:** Pitch-ready breakdown of every external API/data source Liquidity.ai needs, what it costs, and why.

---

## Executive Summary

Liquidity.ai requires APIs across **three categories**: financial data sources (the fuel), AI/LLM services (the brain), and people/company enrichment (the connective tissue). Total annual cost ranges from **$7K (bootstrap)** to **$120K+ (enterprise-grade)** depending on data depth.

---

## 1. Financial Data Sources

These are the core data feeds that populate Liquidity.ai's knowledge graph with organizations, funds, people, and deals.

### Tier A — Premium (Gold Standard)

| Provider | What You Get | Annual Cost | Why We Need It |
|----------|-------------|:-----------:|----------------|
| **PitchBook** | 3.4M+ companies, VC/PE deals, fund data, LP commitments, valuations | **$54K–$100K+** | Most comprehensive private market dataset. Covers the full investment chain: firms → funds → deals → LPs. Required for serious institutional credibility. |
| **Dealroom** | 2M+ companies, EU-focused deal flow, startup ecosystem data | **$15K–$40K** (est.) | Strongest European coverage. Essential if serving cross-border investors or EU-focused family offices. |

> **Verdict:** PitchBook alone could be sufficient for US-focused MVP. Add Dealroom for global coverage. These are the datasets that make Liquidity.ai valuable — without them, the graph is empty.

### Tier B — Mid-Range (Solid Alternatives)

| Provider | What You Get | Annual Cost | Why We Need It |
|----------|-------------|:-----------:|----------------|
| **Crunchbase Pro** | Funding rounds, company profiles, investor data | **$588/yr** ($49/mo) | Affordable starting point. Good for startup/VC data. Lacks depth on PE, family offices, and LPs. |
| **Crunchbase Business** | Pro + higher export limits, CRM integrations, team access | **$2,388/yr** ($199/mo) | Better for teams. Still missing institutional investor depth. |
| **Crunchbase Enterprise** | Full API access, bulk exports, custom data feeds | **$2K–$10K+/yr** | Best Crunchbase tier. API access allows automated ingestion. Still not PitchBook-level depth. |

> **Verdict:** Crunchbase is the budget-friendly entry point. Start here ($49/mo), graduate to Enterprise when revenue supports it.

### Tier C — Free Government Data

| Provider | What You Get | Annual Cost | Why We Need It |
|----------|-------------|:-----------:|----------------|
| **SEC EDGAR** | All public company filings (10-K, 10-Q, 8-K, 20-F), XBRL data, insider ownership | **$0 (Free)** | Legally required disclosures. Rich structured financial data. No API key needed. Rate limit: 10 req/sec. Fund managers' Form ADV filings, 13F holdings — this is gold for tracking institutional portfolios. |

> **Verdict:** Must-use. Free, authoritative, updated in real-time. Build an EDGAR scraper on day one. Every competitor uses this data — not having it is inexcusable.

---

## 2. AI / LLM APIs

These power entity extraction, data classification, enrichment, and entity resolution. Liquidity.ai routes tasks to the right model based on complexity vs. cost.

### Primary Models

| Provider | Model | Input (per 1M tokens) | Output (per 1M tokens) | Best For |
|----------|-------|:---------------------:|:----------------------:|----------|
| **OpenAI** | GPT-4o | $2.50 | $10.00 | Complex extraction — pulling structured data from SEC filings, classifying investor types, resolving ambiguous entities |
| **OpenAI** | GPT-4o mini | $0.15 | $0.60 | Bulk processing — name normalization, tag classification, simple field extraction. 95% of volume goes here. |
| **Anthropic** | Claude 3.5 Sonnet | $3.00 | $15.00 | High-quality reasoning — entity resolution edge cases, relationship inference, dispute adjudication |
| **Anthropic** | Claude 3.5 Haiku | $1.00 | $5.00 | Mid-tier tasks — data validation, format conversion, structured extraction with moderate complexity |
| **Google** | Gemini 2.5 Flash | $0.30 | $2.50 | Budget alternative to GPT-4o mini. Good for high-volume, lower-stakes tasks. Free tier available for development. |

### Estimated Monthly LLM Spend

| Scenario | Volume | Est. Monthly Cost |
|----------|--------|:-----------------:|
| **Development / Testing** | <100K tokens/day | **$5–$20** |
| **Light Production** (1K entities/day, mostly GPT-4o mini) | ~2M tokens/day | **$50–$100** |
| **Full Production** (10K entities/day, mixed models) | ~20M tokens/day | **$300–$800** |
| **Heavy Production** (100K entities/day, real-time processing) | ~200M tokens/day | **$2K–$5K** |

> **Strategy:** Route 90% of volume to GPT-4o mini ($0.15/1M input). Use GPT-4o or Claude Sonnet only for complex entity resolution and edge cases. This keeps costs under $500/mo for most production workloads.

---

## 3. People & Company Enrichment

These fill in the "who" — partner names, executive roles, contact info, and company firmographics that financial data sources don't always include.

| Provider | What You Get | Pricing | Why We Need It |
|----------|-------------|---------|----------------|
| **Apollo.io** (Free) | 100 credits/mo, basic company/people search | **$0** | Testing and development. Very limited for production. |
| **Apollo.io** (Basic) | 2,500 credits/mo, CRM integrations, advanced filters | **$49/user/mo** | Best value for people data enrichment. Covers partner names, titles, current org, email. |
| **Apollo.io** (Professional) | 4,000 credits/mo, sequences, dialer, AI tools | **$79/user/mo** | Good for teams actively enriching data at scale. |
| **People Data Labs** | Person + company search APIs, ethically sourced | **$0.27/credit** (2.5K–5K/mo) | Alternative to Apollo. Clean data, compliance-friendly. Useful if Apollo's dataset has gaps. |
| **Clearbit / Breeze Intelligence** | Company enrichment (HubSpot-integrated) | **$3.6K–$100K+/yr** | Enterprise-only since HubSpot acquisition. Overkill unless already using HubSpot CRM. Skip for now. |

> **Verdict:** Start with **Apollo.io Basic ($49/mo)**. It covers 80% of people enrichment needs. Add People Data Labs for gap-filling if needed.

---

## 4. LinkedIn Data

LinkedIn is the richest source for people/org relationships, but access is heavily restricted.

| Approach | Cost | Legal Risk | Data Quality |
|----------|:----:|:----------:|:------------:|
| **LinkedIn API (official partner)** | Custom ($10K–$50K+/yr) | ✅ None | ✅ Best |
| **LinkedIn Sales Navigator** | $1,600/seat/yr (Advanced Plus) | ✅ None | ✅ High |
| **Bright Data (scraping proxy)** | $500–$2K/mo | ⚠️ Medium | 🟡 Good |
| **LinkdAPI (post-Proxycurl)** | Custom | ⚠️ Medium | 🟡 Good |
| **Skip LinkedIn entirely** | $0 | ✅ None | ❌ Gap |

> **⚠️ Warning:** Proxycurl (the most popular LinkedIn scraping API) was **shut down in July 2025** after LinkedIn sued them. Direct scraping carries legal risk. **Recommendation:** Use Apollo.io for people data (which includes LinkedIn-sourced info legally), and only pursue official LinkedIn partnership if revenue justifies it.

---

## Cost Scenarios — What Do We Actually Need?

### 🟢 Bootstrap — "Prove the Concept" ($7K–$10K/year)

| Item | Annual Cost |
|------|:----------:|
| Crunchbase Pro | $588 |
| SEC EDGAR | $0 |
| OpenAI (mostly GPT-4o mini) | $600–$1,200 |
| Apollo.io Basic (1 seat) | $588 |
| Google Gemini (free tier for dev) | $0 |
| Infrastructure (Vercel/Railway) | $240–$600 |
| **Total** | **$2K–$2.4K** |

**What you get:** Working prototype with real (but limited) financial data. Good enough for demos and early customer conversations.

---

### 🟡 Growth — "First Paying Customers" ($25K–$45K/year)

| Item | Annual Cost |
|------|:----------:|
| Crunchbase Enterprise | $5K–$10K |
| SEC EDGAR | $0 |
| OpenAI + Claude (mixed routing) | $3K–$6K |
| Apollo.io Professional (2 seats) | $1,900 |
| People Data Labs | $2K–$4K |
| Infrastructure (AWS/GCP) | $3K–$6K |
| **Total** | **$15K–$28K** |

**What you get:** Solid data coverage for US/EU markets. Enough to serve 10–30 clients. Entity resolution works on real data.

---

### 🔴 Enterprise — "Compete with PitchBook" ($100K–$200K+/year)

| Item | Annual Cost |
|------|:----------:|
| PitchBook API | $54K–$100K |
| Dealroom API | $15K–$40K |
| SEC EDGAR + enhancements | $0–$5K |
| OpenAI + Claude + Gemini (full routing) | $10K–$25K |
| Apollo.io Organization (3+ seats) | $4.3K+ |
| People Data Labs (high volume) | $5K–$10K |
| LinkedIn Sales Navigator (2 seats) | $3.2K |
| Infrastructure (AWS, CDN, monitoring) | $12K–$24K |
| **Total** | **$103K–$212K** |

**What you get:** PitchBook-level data depth. Full global coverage. Can compete head-to-head with established players.

---

## The Bottom Line — What to Buy First

| Priority | Action | Cost | Impact |
|:--------:|--------|:----:|--------|
| 🥇 | Build SEC EDGAR scraper | $0 | Free, authoritative data. 10-K, 13-F, Form ADV filings. Immediate access to fund holdings and company financials. |
| 🥈 | Subscribe to Crunchbase Pro | $49/mo | Startup/VC deal flow, funding rounds, investor profiles. Enough to seed the knowledge graph. |
| 🥉 | Set up OpenAI API (GPT-4o mini) | ~$50/mo | Powers entity extraction, classification, and resolution at pennies per record. |
| 4 | Add Apollo.io Basic | $49/mo | People enrichment — partner names, titles, org affiliations. Fills the "who" gap. |
| 5 | Upgrade to Crunchbase Enterprise | When revenue > $5K/mo | Full API access for automated ingestion pipeline. |
| 6 | Add PitchBook API | When revenue > $10K/mo | This is the inflection point where Liquidity.ai becomes enterprise-grade. |

> **Day-one minimum spend: ~$98/month ($1,176/year)** — Crunchbase Pro + OpenAI + Apollo.io. Everything else scales with revenue.
