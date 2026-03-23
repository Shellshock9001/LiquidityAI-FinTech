# AI Pipeline Architect Proposal — Upwork Submission

> **Copy everything below the line. Attach the two images from `docs/`.**
> - `segmentation_pipeline.png`
> - `intent_taxonomy.png`

---

Hi — this is exactly what I build. I've designed and shipped production LLM pipelines that classify entities, extract structured taxonomies, and produce analytical deliverables at scale — not notebook prototypes, real CLI tools with batch processing and structured JSON output.

## Relevant Experience

I built **Liquidity.ai**, a financial intelligence platform that does at its core what you're describing:

**Entity Classification Pipeline** — Ingests raw data from multiple sources, preprocesses it, and routes it through an LLM-based classification engine that assigns entity types (Organization, Person, Fund, Deal) with confidence scores and reasoning. Same pattern as your lawyer / business user / consumer segmentation — different domain, identical architecture.

**Intent & Signal Extraction** — My OSINT pipeline analyzes unstructured text across 50K+ data points, automatically discovers industry classifications using weighted keyword taxonomies, and produces structured evidence reports with frequency metrics, coverage stats, and representative matches.

**Structured LLM Output** — Every LLM call returns validated JSON with schema enforcement, confidence scores, and reasoning chains. I've built calibration workflows that run against sample batches, measure precision/recall, and iterate prompts before full-scale processing.

**Production CLI Tools** — Python-based pipelines that connect to production databases via SSH tunnels, handle batch processing with progress tracking, retry logic, and produce CSV/JSON deliverables. Not Jupyter notebooks.

Tech: Python · PostgreSQL · LLM APIs (GPT-4o, Claude) · Batch Processing · Prompt Engineering · SQL

## My Approach for Your Project

**Phase 1: Data Assessment & Pipeline Setup (Days 1–3)**
- SSH into your managed PostgreSQL, assess schema and conversation data shape
- Build the Python CLI tool skeleton — `click`-based with config management
- Data extraction queries, preprocessing (tokenization, dedup, conversation threading)
- Aggregate conversation histories per user (~5K active users)

**Phase 2: User Segmentation (Days 4–7)**
- Design structured output prompts for 3-class segmentation (lawyer / business / consumer)
- Run calibration batch on ~200 sampled users across segments
- Measure classification accuracy, iterate prompts until >90% agreement
- Full-scale batch processing via LLM batch API with rate limiting and checkpointing
- Output: per-user CSV with segment, confidence score, reasoning summary

**Phase 3: Intent Taxonomy (Days 8–11)**
- Cluster analysis on conversation messages to seed initial intent categories
- LLM-driven taxonomy discovery — extract, categorize, and hierarchically organize intent types
- Compute frequency metrics, user coverage, representative examples per intent
- Output: structured JSON taxonomy + frequency report CSV

**Phase 4: Analytical Deliverables (Days 12–14)**
- Written analytical brief with audience composition insights
- Cross-tabulation: segments × intents (which users want what)
- Actionable recommendations for product, marketing, and retention
- Clean handoff: documented CLI tool, requirements.txt, README with usage examples

**Total timeline: ~2 weeks for full delivery.**

## Why Me

- I've classified **entities at scale** using LLM batch APIs with confidence scoring — your segmentation model is the same pattern
- I've built **intent/signal taxonomy extraction** from unstructured text with frequency metrics — exactly your intent taxonomy deliverable
- My tools are **production CLI pipelines** with SSH, PostgreSQL, retry logic, and checkpointing — not notebooks
- I produce **structured analytical deliverables** (CSV reports, JSON taxonomies, written briefs) as standard output

I've attached two pipeline diagrams showing the segmentation flow and intent taxonomy architecture. Happy to do a quick call to walk through my approach and see a sample of your data shape.

Can start within 48 hours. 🚀

Skills: Python · PostgreSQL · SSH · LLM Batch APIs · Prompt Engineering · NLP Pipelines · Data Classification · CLI Tools
