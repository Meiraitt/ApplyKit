# ApplyKit

ApplyKit is a local-first job tracker that writes job-specific CVs from your confirmed experience and reviews them in a separate AI call. Save a job description or public URL, inspect reviewer feedback, download PDF/DOCX, and track applications in a weekly dashboard. An optional private Telegram bot provides the same core workflow.

The interface and prompts are English. CVs support English and Brazilian Portuguese. ApplyKit does not search for jobs or submit applications automatically.

## Quick start with Docker

Docker runs PostgreSQL, the API, the built frontend and a separate CV worker. Node.js, npm, Chrome and CLI providers are included in the image. You still need your own AI account, API key or reachable Ollama server.

Install [Git](https://git-scm.com/downloads) and [Docker Desktop](https://docs.docker.com/desktop/) with Linux containers, or Docker Engine with Compose v2.24.4 or newer on Linux. Start Docker, then run:

```sh
git clone https://github.com/Meiraitt/ApplyKit.git
cd ApplyKit
```

Create configuration **only for a new installation**; these copy commands overwrite existing files.

PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item config/profile.example.json data/profile.json
```

macOS/Linux:

```sh
cp .env.example .env
cp config/profile.example.json data/profile.json
```

1. Edit **`.env` in the repository root**. Replace both `CHANGE_ME` placeholders with the same strong password; letters/numbers are easiest. `POSTGRES_PASSWORD` configures Docker. `DATABASE_URL` is for native development; URL-encode special characters in its password. Containers construct their own connection string using `postgres:5432` and encode the password automatically.
2. Replace **all** fictional information in `data/profile.json` with your confirmed facts, using the profile guide below. Remove the `EXAMPLE PROFILE` marker only after replacing the example; generation is blocked while it remains.
3. Set `CV_PROVIDER` and the selected provider's settings in `.env` using the table and instructions below. Leave unused provider fields empty/default.
4. Build and start the stack:

```sh
docker compose up --build -d --wait
```

Open **http://127.0.0.1:3333**. The frontend and API share this address. The first build downloads dependencies, Chromium and CLIs. Subsequent starts reuse the image. If using Codex/Claude, authenticate inside the worker as described below before generating a CV.

```sh
docker compose exec worker node backend/dist/doctor.js
```

The doctor validates the profile/provider settings, checks CLI versions, and checks Ollama/model availability when selected. It does not generate content or prove API credentials, quota, model access or output quality. Container health checks establish database/API/queue availability, not AI readiness.

Compose publishes the application and database to **127.0.0.1 only**. This is a single-user local app without HTTP authentication; do not expose it publicly. `BACKEND_PORT` defaults to 3333. PostgreSQL is also available locally on port 54329 for native development.

## Configure your profile

Edit `data/profile.json` with valid JSON: double quotes, no comments or trailing commas. The app does not include a profile editor.

| Field                         | What to enter                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `name`, `headline`, `contact` | Your name, title, and contact fields such as email, location and links.                                                               |
| `summary`                     | Factual professional background; the writer adapts the CV summary for each job.                                                       |
| `skills`                      | Technologies you actually know. A global skill does not prove use at every employer.                                                  |
| `experiences`                 | Employment/projects with a stable unique `id`, `company`, `role`, `period`, `kind` and `facts`.                                       |
| `facts`                       | Evidence with unique `id` and `text`: your action, technology, context and confirmed result. Record partial authorship when relevant. |
| `education`, `languages`      | Arrays of strings with actual education, dates/status and language proficiency.                                                       |
| `studies`                     | Optional array of study-only technologies; these must not become professional experience.                                             |
| `notes`                       | Limitations or clarifications about your experience.                                                                                  |

Use `kind: "work"` for employment and `kind: "project"` for personal projects. Closed periods use `MM/YYYY – MM/YYYY`. Preserve existing IDs when editing facts and create new IDs for new facts. Source facts can be English or Portuguese; choose the output language per job.

Each experience needs at least one fact. Optional fact fields include `area` (`frontend`, `backend`, `fullstack`, `quality`, `general`) and `usage: "context"` for background that must not become your own delivery. Keep metric units and qualifiers; product scale is not an individual achievement. Never invent numbers.

After replacing the example, remove its marker from `notes` and run the doctor. More detail: [Profile guide](docs/PROFILE.md). Profile changes apply to future generations. If your editor replaces the file atomically, refresh Docker's read-only bind mount with `docker compose up -d --force-recreate`.

## Choose one AI provider

Edit existing entries in the root `.env`; keep the database settings. Environment variables already set in your terminal override the file. After changes, run `docker compose up -d --wait` to recreate affected containers, or restart the native launcher.

| `CV_PROVIDER` | Requirements                                                      |
| ------------- | ----------------------------------------------------------------- |
| `codex`       | Codex login inside the worker; CLI included, template default.    |
| `claude`      | Claude Code login inside the worker; CLI included.                |
| `gemini`      | Gemini key(s) and a model accessible to their projects.           |
| `ollama`      | Reachable Ollama server with the selected models downloaded.      |
| `compatible`  | Chat Completions-compatible endpoint, model and any required key. |

### Codex CLI

```dotenv
CV_PROVIDER=codex
CODEX_MODEL=
```

With the stack running, sign in once:

```sh
docker compose exec worker codex login --device-auth
docker compose exec worker codex login status
```

Follow the URL/code printed by the CLI. Device login may need enabling for your account; see [official authentication guidance](https://developers.openai.com/codex/auth). Do not share the code. An empty `CODEX_MODEL` uses the CLI default. Account access and quotas apply.

Login state lives in the private `applykit-cli` volume, not in the image or repository. Docker does not automatically reuse your host login. For native development, [install Codex CLI](https://developers.openai.com/codex/cli), run `codex login`, and configure `CODEX_EXECUTABLE` if it is not on PATH. Windows requires the native `codex.exe`, not a `.cmd`/`.ps1` shim; use forward slashes and quotes for paths with spaces. Docker always uses the included Linux executable.

### Claude Code CLI

```dotenv
CV_PROVIDER=claude
CLAUDE_MODEL=
```

Authenticate inside the running worker:

```sh
docker compose exec worker claude auth login
```

Follow the instructions with your own authorized account. An empty `CLAUDE_MODEL` uses the CLI default. Login state is stored in the private CLI volume. For native development, [install Claude Code](https://code.claude.com/docs/en/setup), run `claude auth login` on that host, and set `CLAUDE_EXECUTABLE` if needed.

The image pins both CLI versions in `Dockerfile`. To upgrade, change the build arguments and rebuild after checking compatibility. Unsupported adapter flags fail explicitly; restrictions are not silently removed. Installing the binary does not prove an account can generate content. See [provider details](docs/PROVIDERS.md).

### Gemini API

Create a key in [Google AI Studio](https://aistudio.google.com/apikey):

```dotenv
CV_PROVIDER=gemini
GEMINI_MODEL=gemini-flash-latest
GEMINI_API_KEY_WRITER=replace-with-your-key
GEMINI_API_KEY_REVIEWER=replace-with-your-key
```

Set both key fields; they may be identical. Keys in the same Google project share quotas. The model name is an alias; choose another [available model](https://ai.google.dev/gemini-api/docs/models) if needed. No additional SDK/CLI installation is required. Generation normally starts with separate writer and reviewer calls; corrections add calls. Free access and fixed daily quotas are not guaranteed.

### Ollama

[Install Ollama](https://ollama.com/download), start its service and download your selected models:

```sh
ollama pull qwen3.5:9b
ollama list
```

```dotenv
CV_PROVIDER=ollama
OLLAMA_HOST=
OLLAMA_MODEL_WRITER=qwen3.5:9b
OLLAMA_MODEL_REVIEWER=qwen3.5:9b
```

An empty `OLLAMA_HOST` defaults to `http://host.docker.internal:11434` in Docker and `http://127.0.0.1:11434` in native development. Docker's `localhost` is the container, not your host. Compose supplies the Linux host-gateway mapping. Configure Ollama to listen on an address reachable by Docker using the [networking FAQ](https://docs.ollama.com/faq); restrict host firewall access to your machine/container network instead of exposing it publicly.

Ollama and model downloads remain outside this stack, preserving your host GPU setup. Both selected models must appear in `ollama list`. Choose models suited to your RAM/VRAM; smaller models can require more corrections, and provider quality is not interchangeable. Local inference does not need an API key.

### OpenAI-compatible API

```dotenv
CV_PROVIDER=compatible
LLM_API_URL=https://api.example.com/v1/chat/completions
LLM_MODEL=replace-with-your-model
LLM_API_KEY=replace-with-your-key
LLM_API_KEY_WRITER=
LLM_API_KEY_REVIEWER=
LLM_RESPONSE_FORMAT=json_object
```

Replace the example hostname. Supply the **complete Chat Completions endpoint**, not only a base URL. The adapter sends Bearer authentication and expects a Chat Completions response. HTTPS is required except for localhost; URLs cannot contain credentials, query parameters or fragments. In Docker, localhost means the worker itself: a host-only HTTP server is not reachable through that exception. Use an HTTPS endpoint or native development for that case.

Optional role keys override the shared key. An unauthenticated local server may leave keys empty. Choose `json_object`, `json_schema` or `none` according to endpoint support; local validation remains active. Native Anthropic Messages, Gemini APIs and OpenAI Responses need their own protocol adapters, not just a different URL.

## Daily use

1. Select **New job**, fill in title/company and paste the full description (at least 80 characters) or a public URL. Choose the CV language.
2. Click **Save and generate CV**. The job is saved immediately; a PostgreSQL queue handles processing.
3. Open its card to follow progress and review feedback. Login-only, removed or blocked URLs need a pasted description.
4. Download PDF/DOCX after approval. For content issues, inspect feedback and use the correction action when available; it reuses the draft. Failed requests show their error so you can fix configuration and retry.
5. Record your application date. The dashboard shows weekly saved/applied jobs. Deletion asks for confirmation and removes associated records/artifacts.

The profile is the factual source: requirements never become candidate experience. Writer and reviewer run independently. Local checks validate evidence IDs, employer boundaries, metrics and document structure. Corrections are bounded; exhausted attempts never force approval. “Ready” means these checks passed, not guaranteed recruiter/ATS acceptance. Read your exported CV before sending it.

```sh
docker compose logs -f app worker
docker compose stop
docker compose up -d --wait
docker compose down
```

`stop` and `down` preserve named volumes. **Do not add `--volumes` / `-v` to `down` unless you intend to delete the database, CVs and CLI logins.** Rebuild with `docker compose up --build -d --wait` after pulling code changes.

## Optional private Telegram bot

Leave Telegram fields and `COMPOSE_PROFILES` empty for browser-only use.

1. Create a bot using `/newbot` with [BotFather](https://t.me/BotFather). Put its token in `TELEGRAM_BOT_TOKEN` in `.env`.
2. Keep the polling bot stopped and send `/start` to it in a **private** Telegram conversation.
3. Set `COMPOSE_PROFILES=telegram` in `.env`. Read pending chats without putting the token in your command:

```sh
docker compose run --rm --no-deps telegram node --input-type=module -e "const r = await fetch('https://api.telegram.org/bot' + process.env.TELEGRAM_BOT_TOKEN + '/getUpdates'); const data = await r.json(); console.log(data.result?.map(u => u.message?.chat).filter(Boolean) ?? data);"
```

4. Set `TELEGRAM_CHAT_ID` to the numeric `id` for your private chat. An empty result means you should send another message while polling is stopped. No webhook/other poller may consume this bot's updates.
5. Run `docker compose up -d --wait`. Use `/help` for buttons and commands. Other chat IDs are rejected.

Commands include `/job`, `/jobs`, `/status`, `/description`, `/generate`, `/download`, `/applied`, `/unapplied`, `/help`. Polling needs no public URL or inbound port. Telegram retains undelivered updates for [at most 24 hours](https://core.telegram.org/bots/api#getting-updates); longer outages may lose messages not yet received. Received jobs persist in PostgreSQL.

In native development, `npm start` automatically starts the bot when both credentials are set. For chat ID lookup without Docker, use the same command without `docker compose run --rm --no-deps telegram` and add `--env-file=.env` after `node`.

## Existing installations and native development

Move an existing **`config/.env` to `.env` in the root** before using this version. Preserve its values. With Node installed, `node scripts/configure.mjs` performs the migration, preserves the profile and refuses conflicting root/legacy files. Runtime code reads only the root file.

For hot reload, install Node.js 24 or newer, then:

```sh
npm ci
npm run setup
npm run doctor
npm start
```

`npm ci` installs shared tooling. `npm run setup` installs both apps from lockfiles, migrates legacy configuration, creates a random password/config only if missing, and copies the fictional profile only if missing. Configure your host AI provider and replace the profile before running the doctor. Puppeteer downloads Chrome for native export.

Open **http://127.0.0.1:5173**; the API runs on **3333**. `npm start` / `npm run dev` starts the database through Compose when needed, API, Vite, worker and optional bot. Keep `BACKEND_PORT=3333` because Vite's proxy uses it. Ctrl+C stops processes created by the launcher; the Docker database stays running until `npm run db:stop`.

Do not run Docker and native workers against the same database simultaneously. Run `docker compose stop app worker telegram` before native development. `npm start -- --web-only` omits worker/Telegram; `npm start -- --check` checks launcher dependencies without starting services.

Native mode supports an external PostgreSQL server through `DATABASE_URL`; its user needs schema/table creation permissions. Docker always uses the included server. Existing host `data/cvs` files are **not automatically migrated** to Docker's volume; back up/export existing work before switching an established installation.

## Troubleshooting

| Problem                          | What to check                                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Docker unavailable               | Start Docker Desktop/Engine and check `docker compose version`. Windows needs Linux containers.                      |
| Profile mount fails              | Create `data/profile.json` before starting; Compose refuses to silently create a directory there.                    |
| Example profile / invalid JSON   | Replace all example facts, remove the marker, and run the doctor.                                                    |
| Database authentication fails    | Password must match the existing volume. Editing `.env` does not reset a populated database's password.              |
| Port in use                      | Docker uses 3333/54329. Change `BACKEND_PORT` for Docker only; native Vite expects 3333.                             |
| Jobs stay queued                 | Check `docker compose ps` and worker logs; a live API alone does not process jobs.                                   |
| CLI unauthorized                 | Log in inside the worker. Host login files are intentionally not mounted.                                            |
| API 401/403, 404 or 429          | Check credentials/permissions, model/endpoint, or quota respectively. Doctor does not verify these remotely.         |
| Settings unchanged               | Recreate containers with `docker compose up -d --wait`; check terminal environment overrides.                        |
| Native npm blocked in PowerShell | Use `npm.cmd`, or CMD. Require Node 24 or newer.                                                                     |
| Native PDF browser missing       | Run `npx puppeteer browsers install` in `backend`; avoid `PUPPETEER_SKIP_DOWNLOAD=true`.                             |
| Native PDF fails on Linux        | Install browser libraries using [Puppeteer troubleshooting](https://pptr.dev/troubleshooting). Docker includes them. |

## Checks and development commands

| Command                                   | Purpose                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `npm run configure`                       | Create/migrate config and profile without installing app dependencies. |
| `npm run setup`                           | Install apps and prepare configuration.                                |
| `npm start` / `npm run dev`               | Native development with hot reload.                                    |
| `npm run doctor`                          | Validate native profile/provider settings.                             |
| `npm run db:up` / `npm run db:stop`       | Start/stop only the Compose database.                                  |
| `npm run check`                           | Check types in both apps.                                              |
| `npm run lint` / `npm run lint:fix`       | Check/fix code style and formatting.                                   |
| `npm run format` / `npm run format:check` | Write/check formatting.                                                |
| `npm test`                                | Setup, backend and frontend tests.                                     |
| `npm run test:docker`                     | Build/test a real isolated Docker stack. Requires Docker and Node.     |
| `npm run build`                           | Build both apps.                                                       |

Start PostgreSQL before `npm test`. These tests create/clear **only `applykit_test`** on the server in `DATABASE_URL`; use a development server with database-creation privileges. Existing unit tests mock AI/Telegram boundaries. CI runs setup, types, lint, tests and builds with Node 24 and PostgreSQL 17.

A separate CI job builds the Docker image and exercises real frontend/API, PostgreSQL, queue/restarts, validation failure, edits, application tracking, deletion and Chromium PDF/DOCX export. It creates/removes isolated test volumes, uses fictional fixtures and does not simulate AI approval. Live AI/Telegram account tests are separate; passing CI alone does not establish every provider's account compatibility or output quality.

## Data, backups and privacy

Keep `.env`, `data/profile.json`, database backups and CVs private. Git ignores configuration, data, logs, dependencies, build output and the backup paths below. A Git clone does not include your personal records.

Docker uses three named volumes: `applykit-postgres` (jobs/reviews), `applykit-cvs` (PDF/DOCX artifacts), and `applykit-cli` (private authentication). Compose prefixes these names with the project name. The profile is a read-only bind mount. Native artifacts live in host `data/cvs` instead.

Back up the database, CV files, profile and configuration. With the stack running:

```sh
docker compose stop worker telegram
docker compose exec -T postgres pg_dump -U applykit -d applykit -Fc -f /tmp/applykit.dump
docker compose cp postgres:/tmp/applykit.dump ./applykit.dump
docker compose cp app:/app/data/cvs ./cv-backup
docker compose up -d --wait
```

Store exports securely outside Git. Restore a dump with PostgreSQL `pg_restore` into a compatible database and restore matching CV/profile files. Do not delete populated volumes just to change a password.

`.dockerignore` excludes secrets, local data, host authentication and Git history from the build context. Only the worker receives AI keys/CLI login storage. API/CLI providers receive the profile evidence/job content needed for generation and review; their terms and quotas apply. Ollama inference stays on its configured server.

The worker runs as a non-root user with Chromium's sandbox enabled. It receives `SYS_ADMIN`, as required by [Puppeteer's Docker guidance](https://pptr.dev/guides/docker); the API/database do not. This capability is broader than Docker's defaults, so use the local stack only on a trusted machine. Public hosting and authentication require separate work.

More detail: [Architecture](docs/ARCHITECTURE.md), [Profile](docs/PROFILE.md), [Providers](docs/PROVIDERS.md).

## License

Licensed under the [MIT License](LICENSE).
