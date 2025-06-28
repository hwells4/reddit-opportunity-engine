1 Goals & Success Metrics
Goal	Metric	Target
Deliver higher-quality post set	≥ 3 × lift in true-positive rate vs current pipeline	3 ×
Keep cost within budget	End-to-end ≤ $0.01 / post @ scale; monthly ≤ $100	✅
Latency	≤ 15 min for 5 000-post sweep	15 min
Concurrency	Sustained 90 QPM (free tier) or ≥ 1 000 QPM (enterprise flag)	as spec

2 System Overview
pgsql
Copy
Edit
POST /api/search
   │
   ├─► 1. KeywordQueryBuilder
   │       └─ reddit.search (paged, parallel 90 QPM)
   │
   ├─► 2. EmbeddingPrune (parallel batch)
   │       └─ provider=openai | miniLM (local)
   │
   ├─► 3. LLMYesNoGate  (Gemini Flash; parallel 100 calls/sec allowed)
   │
   └─► 4. (optional) PostHydrator
           └─ reddit.info + reddit.comments
                → returns canonical JSON array
Parallelism:
Each stage launches N concurrent workers (default 16, env-var configurable) bounded by:

Stage	Limit source	Default workers
Reddit search	Reddit 100 req/min/app	16 (≈ 96 req/min)
Embeddings	OpenAI 3 000 TPM / lit-model	32 (batched 512 inputs)
Gemini gate	600 TPM / key	32

3 API Contract
3.1 Request
jsonc
Copy
Edit
POST /api/search
{
  "audience":               "early-career software devs",
  "questions": [
      "How do they describe slow CI pipelines?",
      "Which parts of code review frustrate them?"
  ],
  "maxPosts":               1000,   // hard cap after gate
  "ageDays":                90,     // look-back window
  "minScore":               2,      // karma threshold
  "embedProvider":          "openai",  // openai | miniLM | bge
  "premium":                false,  // true = enterprise key
  "storeVectors":           false   // future pgvector toggle
}
3.2 Response
jsonc
Copy
Edit
{
  "runId":      "search_2025-07-03T14:01:22Z",
  "posts": [
    {
      "id": "18zabc",
      "url": "https://reddit.com/r/devops/.../18zabc",
      "score": 184,
      "createdUtc": 1741198400,
      "subreddit": "devops",
      "snippet": "My compile stage is crawling after we ...",
      "title": "Why is my CI pipeline so slow?"
    }
    // … up to maxPosts
  ],
  "stats": {
    "rawFetched":     5300,
    "afterEmbed":     1700,
    "afterGate":      1000,
    "apiCalls":       64,
    "tokenCostUSD":   6.12,
    "elapsedSec":     412
  }
}
4 Functional Requirements
#	Requirement
FR-1	KeywordQueryBuilder: expand questions + audience → ≤ 20 keyword atoms (OpenAI chat call, temp 0).
FR-2	RedditBulkSearch: page through /search with sort=new, respect ageDays stop condition, 100 items/req, 90 req/min throttle (free) or unlimited if premium=true.
FR-3	PostTruncate: keep title + self-text limited to first 2 000 chars; strip markup + flair.
FR-4	EmbeddingPrune: batch ≤ 512 texts per call; cosine vs averaged query vector; keep top oversampleFactor * maxPosts (default 3 ×).
FR-5	LLMGate: Gemini Flash prompt "Answer Y/N only: does this post help answer …"; retain Y; enforce temp 0, max_tokens 1.
FR-6	Hydrator (optional flag) fetches full post JSON plus all comments depth-∞ if later analysis needs them.
FR-7	Parallel Workers: configurable via WORKERS_STAGE1/2/3; default 16/32/32.
FR-8	CostMeter accumulates (Reddit enterprise calls ×0.24/1k) + (OpenAI embed tokens ×$0.00002/1k) + (Gemini in/out).
FR-9	Run-ID hook: if header X-Subtext-Run: <uuid> present, link each kept post to that run in Postgres.

5 Non-Functional Requirements
Area	Specification
Latency	5 000 raw posts → final list in ≤ 15 min under free tier
Scalability	Horizontal scale by increasing worker env var; one Railway service can handle 10 parallel searches without upgrade (~1-2 vCPU)
Reliability	Retry back-off on Reddit 429; persist partial progress checkpoint in Redis
Security	OAuth secrets + enterprise key in Railway secrets manager; rotate every 30 days
Observability	Prometheus-compatible /metrics + JSON logs; alert on >5 % retry or latency p95 > 2×goal

6 Data Model (Postgres)
sql
Copy
Edit
CREATE TABLE posts (
  id           text PRIMARY KEY,    -- Reddit ID
  subreddit    text,
  title        text,
  snippet      text,
  score        int,
  created_utc  bigint,
  run_id       uuid NULL,
  vector       vector NULL          -- pgvector 1 536-dim (future)
);
Vector column stays NULL unless storeVectors=true.

7 ENV config
Var	Default	Notes
SUBTEXT_WORKERS_SEARCH	16	Stage 1
SUBTEXT_WORKERS_EMBED	32	Stage 2
SUBTEXT_WORKERS_FLASH	32	Stage 3
SUBTEXT_EMBED_PROVIDER	openai	openai │ miniLM │ bge
SUBTEXT_OVERSAMPLE	3	Factor × maxPosts
SUBTEXT_EMBED_TRUNC	2000	Char limit on body
SUBTEXT_STORE_VECTORS	false	true = pgvector
REDDIT_PREMIUM	false	true = enterprise
REDDIT_CLIENT_ID/SECRET	—	OAuth app
REDDIT_ENTERPRISE_KEY	—	Header
OPENAI_API_KEY	—	if provider=openai
GEMINI_API_KEY	—	Flash gate

8 Milestones & Timeline (4 weeks)
Week	Deliverable
1	KeywordBuilder + RedditBulkSearch (paged, throttle)
2	EmbeddingPrune (openai & local MiniLM) + parallel workers
3	LLMGate + CostMeter, end-to-end happy-path CLI
4	REST /api/search route, Hydra flag, metrics, docs & sample cURL

9 Risks & Mitigations
Risk	Impact	Mitigation
Reddit lowers free tier limit	Slower searches	Enterprise key toggle already baked in
Embedding latency on CPU	Slower prune	Batch 512 on MiniLM or fall back to OpenAI
Gemini pricing change	Cost creep	Switch to GPT-4o-mini gate (same prompt)
Parallel flood causes 429	Search stall	Token-bucket + jittered worker start

10 Open Questions (tiny)
Oversample factor default 3 ×—adjust in prod?

Hydrate comments now or leave for deep-analysis stage?

Everything else is locked.

Next step
Create /api/search skeleton with worker pools and stubbed stage functions; wire CostMeter; push branch feature/search-v2 for review.