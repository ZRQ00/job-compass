# Running Job Compass with Docker

Two containers: a FastAPI backend (port 9500) and the TanStack Start
frontend running in dev mode via Bun (port 8080). Both live-reload — the
project folder is bind-mounted into each container.

## Start

```bash
docker compose up --build
```

- Frontend: http://localhost:8080
- Backend API: http://localhost:9500 (docs at /docs)

The frontend already calls the API at `http://localhost:9500`
(`src/lib/api.ts`), which lines up with the port published above, so no
config changes are needed.

## Notes

- **Database**: `backend/jobtracker.db` is bind-mounted, so your existing
  data is used as-is and anything the app writes persists back to your
  project folder.
- **Ollama**: `reasoning.py` / `embeddings.py` talk to an Ollama server at
  `OLLAMA_URL` (default `http://100.81.99.54:11434`, your Tailscale IP).
  That's outside Docker's control — as long as the container can reach
  that address on your network it'll work as-is. To point it elsewhere,
  create a `.env` file next to `docker-compose.yml` with:
  ```
  OLLAMA_URL=http://your-ollama-host:11434
  ```
- **Scraping (python-jobspy)** reaches out to LinkedIn/Indeed/etc. over
  the network — no extra config needed, it just needs outbound internet
  access from the backend container.
- This setup runs the frontend in Vite dev mode (matching how the project
  already runs locally). It does not build for Cloudflare Workers — if
  you eventually want a production image for a real deploy, that would be
  a separate multi-stage Dockerfile built around `vite build` +
  `wrangler`/Workers, not a local dev concern.

## Rebuilding after dependency changes

If you add a Python or JS dependency, rebuild the relevant image:

```bash
docker compose up --build backend
docker compose up --build frontend
```

## Stopping

```bash
docker compose down
```