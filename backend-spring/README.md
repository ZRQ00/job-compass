# Job Compass API (Spring Boot)

Drop-in replacement for the FastAPI backend. Same routes, same snake_case JSON, Postgres + pgvector
instead of SQLite.

## Run

    docker compose up -d postgres
    mvn spring-boot:run                      # http://localhost:9500
    mvn verify                               # tests need Docker (Testcontainers)

    # one-off data copy (after the app has started once so Flyway has created the tables)
    pip install "psycopg[binary]"
    python scripts/migrate_sqlite_to_postgres.py ../backend/data/jobcompass.db \
        "postgresql://jobcompass:jobcompass@localhost:5432/jobcompass" ../backend/data/resume.txt

Config (env vars): `DATABASE_URL`, `DATABASE_USER`, `DATABASE_PASSWORD`, `OLLAMA_URL`, `REASONING_MODEL`,
`OLLAMA_NUM_CTX`, `CORS_ORIGINS`, `PORT`.

## Routes

| Route | Notes |
|---|---|
| `GET/POST /jobs`, `GET/PATCH/DELETE /jobs/{id}` | ported from `routers/jobs.py` (seen) |
| `GET /jobs/duplicates?company=&role=` | ported (seen) |
| `POST /jobs/extract` | ported behaviour, new implementation (schema-constrained JSON) |
| `POST /jobs/{id}/match` | SSE: `thinking`, `result`, `error` events. GUESSED route and event names |
| `GET /jobs/export.csv`, `/jobs/export.xlsx` | GUESSED routes |
| `GET /stats` | shape from `schemas.Stats`; calculation rules inferred |
| `GET/PUT/PATCH /settings` | `weekly_goal`, `follow_up_after_days`. GUESSED shape |
| `GET/POST /boards`, `PATCH/DELETE /boards/{id}`, `PUT /boards/order` | from your `api.ts` snippet; `url` field inferred |
| `GET/PUT /resume`, `POST /resume/upload` | GUESSED shape. Upload parsed with Apache Tika |
| `GET /jobs/ranked` | step 3: saved jobs ranked by pgvector similarity to your resume (`fit` 0-100 plus raw `similarity`) |
| `POST /embeddings/reindex` | step 3: rebuild all embeddings (run after migrating data) |
| `POST /agent/chat` | step 4: `{message, conversation_id?}` returns `{conversation_id, reply, tool_calls}` |
| `GET/DELETE /agent/conversations/{id}` | step 4: conversation memory |
| `GET /health` | `{"status":"ok","ai":{reachable,model,model_available}}` |

"GUESSED" means I had not seen the original code. Compare against the FastAPI routers and `src/lib/api.ts`.

## AI layer notes

- Pull the embedding model once: `ollama pull nomic-embed-text` (768 dimensions, matches the `vector(768)` columns).
- Embeddings are created in the background after a job description or the resume is saved. Failures are logged
  and never break the save. Use `POST /embeddings/reindex` to backfill.
- The `fit` score rescales cosine similarity from the 0.40 to 0.80 band to 0-100. It is a heuristic until the
  eval harness (step 5) calibrates it.
- Agent tools: `query_jobs` (read-only SQL), `get_job`, `search_resume`, `search_job_descriptions`, `fetch_url`.
  The agent needs a model with tool calling support; Qwen 3.5 has it.
- SQL tool safety: a SELECT-only guard, then a READ ONLY transaction with a 3 second timeout. `fetch_url` only
  reaches public hosts (loopback, private, link-local and Tailscale 100.64.0.0/10 addresses are refused,
  including after redirects). The tracker is single-user, so the SQL tool can read every table; add auth (step 6)
  before exposing this beyond your tailnet.

## Step 5: evaluation, metrics, tracing

### Extraction eval (the number worth putting on a resume)

1. Label 50 to 100 postings. Each finished posting is saved immediately, so you can stop and resume:

        python eval/label_helper.py --api http://localhost:9500          # from your tracker
        python eval/label_helper.py --dir eval/raw                       # or from .txt files
        python eval/label_helper.py --no-prefill                         # blank start, avoids anchoring

   Pre-filled answers come from `/jobs/extract`, which anchors you on that model's mistakes. For the cleanest
   labels, use `--no-prefill`, or review each suggestion against the posting. Output: `eval/dataset.jsonl`.

2. Run it across models and prompt variants (`baseline`, `minimal`, `strict`; see `ExtractionPrompts`):

        mvn spring-boot:run -Dspring-boot.run.profiles=eval \
          -Dspring-boot.run.arguments="--eval.models=ollama:qwen3.5:9b,ollama:llama3.2:3b --eval.variants=baseline,strict"

   Results land in `eval/results/extraction-<time>.md` and `.json`: per field
   accuracy, valid-JSON rate, hallucination count (answered when the label says "not stated"), lenient role
   accuracy, and p50/p95 latency. Read the `.json` to see which postings each model got wrong.

   Scoring is exact after normalising case, punctuation and company suffixes (Inc, LLC). `MISSED` means the
   label had a value and the model gave none; `HALLUCINATED` is the reverse.

### Calibrating the fit score

    python eval/calibrate_fit.py label  --api http://localhost:9500   # mark saved jobs good / ok / poor
    python eval/calibrate_fit.py report --api http://localhost:9500   # AUC plus suggested SIM_LOW / SIM_HIGH

Copy the suggested band into `EmbeddingService` (`SIM_LOW`, `SIM_HIGH`). You need roughly 10 good and 10 poor
labels for the AUC to mean anything.

### Metrics and tracing

- `GET /actuator/prometheus` exposes JVM and HTTP metrics plus `llm_call_seconds` (tags: `operation`, `model`)
  and `agent_tool_seconds` (tag: `tool`). Point Prometheus at it and chart latency per model in Grafana.
- Every model call and tool call is also a trace span. Export is off until you enable it. For Langfuse, which
  accepts OpenTelemetry traces over OTLP/HTTP (check the endpoint path in its docs for your version):

        TRACING_EXPORT=true
        OTLP_TRACES_ENDPOINT=https://<your-langfuse-host>/api/public/otel/v1/traces
        OTLP_AUTHORIZATION="Basic $(printf '%s:%s' PUBLIC_KEY SECRET_KEY | base64)"

  These are plain spans with timings and model names. Prompt and response text are not attached, which keeps
  your resume out of the trace store.
