# ApplyKit

ApplyKit is a local-first job tracker that writes job-specific CVs from your confirmed experience and reviews them in a separate AI call. Save a job description or public URL, inspect reviewer feedback, download PDF/DOCX, and track applications in a weekly dashboard. An optional private Telegram bot provides the same core workflow.

The interface and instructions are English. CVs can be generated in English or Brazilian Portuguese. ApplyKit does not search for jobs or submit applications automatically.

## Install and run

Follow steps 1–6 in order. Commands run from the repository root unless stated otherwise. Use PowerShell on Windows or a terminal on macOS/Linux; keep Node, the repository and any CLI provider in the same environment when using WSL.

### 1. Install prerequisites

- [Git](https://git-scm.com/downloads) to clone the repository.
- [Node.js 24](https://nodejs.org/en/download) with npm. The project requires Node 24 or newer; CI uses Node 24.
- [Docker Desktop](https://docs.docker.com/desktop/) with Linux containers and Compose, or an already-running PostgreSQL server. The included database uses PostgreSQL 17. Docker runs **only the database**; Node runs the applications on your machine.
- One AI provider configured in step 5. Accounts, API keys, CLI subscriptions and local models are not included.

Check your installation in a new terminal:

```sh
node --version
npm --version
git --version
docker compose version
```

Skip the Docker check if using your own PostgreSQL server. The first setup needs internet access to download dependencies and the browser used for PDF export.

### 2. Clone and install dependencies

```sh
git clone https://github.com/Meiraitt/ApplyKit.git
cd ApplyKit
npm ci
npm run setup
```

If the repository is private, your GitHub account needs access. A downloaded source ZIP also works: extract it and open a terminal in the folder containing the root `package.json`.

`npm ci` installs shared tooling. `npm run setup` installs backend/frontend dependencies from their lockfiles, creates `config/.env` with a random database password, and copies a fictional profile to `data/profile.json`. Existing configuration and profile files are preserved. Puppeteer normally downloads Chrome during backend installation for PDF export.

### 3. Replace the fictional profile

Open `data/profile.json` in a text editor. Keep valid JSON: double-quoted strings, no comments and no trailing commas. Replace **all** example identity, employment, education and language information with your own confirmed facts.

| Field                         | What to enter                                                                                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`, `headline`, `contact` | Your name, professional title and contact fields such as email, location and links.                                                                   |
| `summary`                     | Your factual professional background; the writer adapts the CV summary for each job.                                                                  |
| `skills`                      | Technologies you actually know. A global skill does not establish use at every employer.                                                              |
| `experiences`                 | Employment or projects, each with a stable unique `id`, `company`, `role`, `period`, `kind` and `facts`.                                              |
| `facts`                       | Evidence objects with unique `id` and `text`. Describe your action, technology, context and confirmed result; state partial authorship when relevant. |
| `education`, `languages`      | Arrays of strings with actual education, dates/status and language proficiency.                                                                       |
| `studies`                     | An array of study-only technologies; these must not become professional experience.                                                                   |
| `notes`                       | Relevant limitations or clarification about your experience.                                                                                          |

Use `kind: "work"` for employment and `kind: "project"` for personal projects. For closed periods, use `MM/YYYY – MM/YYYY`. Preserve IDs when updating existing evidence, and add new IDs for new facts. Source facts may be in English or Portuguese; CV output language is selected per job.

Each experience needs at least one fact. A fact can additionally use `area` (`frontend`, `backend`, `fullstack`, `quality` or `general`) and `usage: "context"` for background that should not be presented as your own delivery. Record metric units and qualifiers; product scale is not your individual result. Do not invent numbers to strengthen a CV.

After replacing the example, remove the `EXAMPLE PROFILE` marker from `notes`. The application deliberately blocks generation while that marker remains. Save the file; `npm run doctor` in step 6 validates its structure. The app does not include a profile editor. For more detail, see the optional [profile guide](docs/PROFILE.md).

### 4. Configure PostgreSQL

**Using Docker:** open Docker Desktop and wait until its engine is running. Leave the generated `POSTGRES_PASSWORD` and `DATABASE_URL` in `config/.env` unchanged, then run:

```sh
npm run db:up
```

This starts PostgreSQL on `127.0.0.1:54329` with a persistent named volume. `npm start` can also start this database automatically. The API creates its tables and queue schema on startup; no manual migration command is needed for a new installation.

**Using an existing PostgreSQL server:** create an empty database and a user with permission to create/alter tables, indexes and schemas in it. Put its connection string in `config/.env`, replacing every example value:

```dotenv
DATABASE_URL=postgresql://your_user:your_password@127.0.0.1:5432/your_database
```

URL-encode special characters in the username/password. The server must already be running; the launcher only automatically starts the bundled local database on port 54329. `POSTGRES_PASSWORD` is used by Compose, not by an external server. PostgreSQL 17 is used in Compose and CI.

### 5. Choose and configure one AI provider

Edit the existing entries in **`config/.env`**; do not replace the whole file or remove the database settings. Set exactly one `CV_PROVIDER` value from the options below. Leave unused provider fields unchanged. Restart the application after changes; environment variables already set in your terminal override the file.

| Value        | What you need                                                                  |
| ------------ | ------------------------------------------------------------------------------ |
| `codex`      | An installed, authenticated Codex CLI; this is the template default.           |
| `claude`     | An installed, authenticated Claude Code CLI compatible with the adapter flags. |
| `gemini`     | Gemini API key(s) and a model available to their projects.                     |
| `ollama`     | A running local Ollama server and downloaded model(s).                         |
| `compatible` | A Chat Completions-compatible endpoint, model and any required key.            |

#### Codex CLI

Install the native CLI using the [official installation instructions](https://developers.openai.com/codex/cli). The installation commands are:

Windows PowerShell:

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"
```

macOS/Linux:

```sh
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

Open a new terminal, authenticate through the CLI's own flow, and check the session:

```sh
codex --version
codex login
codex login status
```

Configure:

```dotenv
CV_PROVIDER=codex
CODEX_EXECUTABLE=codex
CODEX_MODEL=
```

An empty `CODEX_MODEL` uses the CLI default. Sign in with your own eligible account or supported API-key method; account access and quotas still apply. ApplyKit uses the CLI's stored authentication, not an OpenAI key in this `.env`. See [official authentication guidance](https://developers.openai.com/codex/auth).

On Windows, this adapter launches a native executable, not an npm `.cmd`/`.ps1` shim. If lookup fails or you previously installed via npm, run `(Get-Command codex.exe).Source` in PowerShell and copy the resulting full path into `CODEX_EXECUTABLE`. Use forward slashes and quotes for paths with spaces, for example `CODEX_EXECUTABLE="C:/path/to/codex.exe"`. If no `.exe` is found, install the native CLI above. Keep it current: unsupported adapter flags fail rather than silently bypassing restrictions.

#### Claude Code CLI

Install [Claude Code](https://code.claude.com/docs/en/setup) using one command for your OS:

Windows PowerShell:

```powershell
winget install --id Anthropic.ClaudeCode --exact
```

macOS/Linux:

```sh
curl -fsSL https://claude.ai/install.sh | bash
```

Open a new terminal, then authenticate:

```sh
claude --version
claude auth login
```

Configure:

```dotenv
CV_PROVIDER=claude
CLAUDE_EXECUTABLE=claude
CLAUDE_MODEL=
```

An empty `CLAUDE_MODEL` uses the CLI default. Use your own authorized account/API credentials through Claude's authentication flow. If PATH lookup fails, set the full native executable path in `CLAUDE_EXECUTABLE`.

The adapter requires flags including `--safe-mode`, `--tools` and `--json-schema`; check `claude --help` against the [CLI reference](https://code.claude.com/docs/en/cli-reference). Version 1.x is rejected. If a flag is unavailable, update Claude Code or choose another provider. Automated transport tests do not establish live compatibility with every CLI release.

#### Gemini API

Create or copy a key in [Google AI Studio](https://aistudio.google.com/apikey), then configure:

```dotenv
CV_PROVIDER=gemini
GEMINI_MODEL=gemini-flash-latest
GEMINI_API_KEY_WRITER=replace-with-your-key
GEMINI_API_KEY_REVIEWER=replace-with-your-key
```

Set **both** key fields; they may contain the same key. The default model name is an alias: change it if your project cannot access it or you want a specific available model. Consult Google's [API-key guide](https://ai.google.dev/gemini-api/docs/api-key) and [model list](https://ai.google.dev/gemini-api/docs/models).

No Gemini CLI or SDK installation is needed. Keys in the same Google project share its quotas. The initial full-CV pass normally uses a writer call and a reviewer call; corrections can add calls. ApplyKit does not guarantee free access or a fixed daily quota.

#### Ollama (local models)

[Install Ollama](https://ollama.com/download), open its application, and download the model selected in the template:

```sh
ollama pull qwen3.5:9b
ollama list
```

If the server is not already running, start `ollama serve` in a separate terminal. Configure:

```dotenv
CV_PROVIDER=ollama
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_MODEL_WRITER=qwen3.5:9b
OLLAMA_MODEL_REVIEWER=qwen3.5:9b
```

Both models must appear in `ollama list`; using the same model for both roles requires only one download. See the [Qwen model page](https://ollama.com/library/qwen3.5:9b) for its download details. Choose another installed model if it better fits your RAM/VRAM; small models may be slower or leave more review issues. Local inference does not require an API key. The writer/reviewer pipeline can make multiple calls, and model quality is not interchangeable across providers.

#### OpenAI-compatible API

Use this option only for an endpoint implementing **Chat Completions**. Replace the URL, model and key with your provider's actual values:

```dotenv
CV_PROVIDER=compatible
LLM_API_URL=https://api.example.com/v1/chat/completions
LLM_MODEL=replace-with-your-model
LLM_API_KEY=replace-with-your-key
LLM_API_KEY_WRITER=
LLM_API_KEY_REVIEWER=
LLM_RESPONSE_FORMAT=json_object
```

The example hostname is a placeholder. Use the **complete endpoint URL**, not just a base URL. This adapter sends Bearer authentication and expects a Chat Completions response. HTTPS is required except for localhost. URLs cannot contain credentials, query parameters or fragments.

Optional role-specific keys override `LLM_API_KEY`. A local server that needs no key can leave all three key fields empty. `LLM_RESPONSE_FORMAT` can be `json_object`, `json_schema` or `none`, according to the endpoint's support; local output validation remains active in every mode. Native Anthropic Messages, Gemini APIs and OpenAI Responses are different protocols and do not work by changing only this URL.

### 6. Check the configuration and start

```sh
npm run doctor
npm start
```

`doctor` checks the profile and selected provider configuration. For Ollama it checks the server and installed models. For CLIs it checks the executable/version; for API providers it checks configuration without sending a generation request. It does **not** prove credentials, quota, model access, database connectivity or the quality of a generated CV. Resolve reported errors before continuing.

Open **http://127.0.0.1:5173**. The API health endpoint is **http://127.0.0.1:3333/api/health** and should return `{"ok":true}`. The launcher starts the database when needed, API, frontend and CV worker. Telegram starts only when both Telegram settings are present. Keep the terminal open while using the app.

`npm start` and `npm run dev` use the same local launcher with automatic source reload. They are not production-hosting commands. Ports 3333 and 5173 must be available; keep `BACKEND_PORT=3333` because the Vite proxy uses it.

Press **Ctrl+C** to stop application processes started by this launcher. Previously running processes are preserved. The Docker database and a shared Ollama server stay running; stop the Docker database separately with `npm run db:stop` when needed. Stopping the container preserves its volume.

To inspect the UI without starting the worker or Telegram, use `npm start -- --web-only`. Saved jobs stay queued until a worker runs. Stop any already-running worker first if you need a generation-free preview. `npm start -- --check` only checks local launcher dependencies; it does not start services or replace `doctor`.

## Generate your first CV

1. Select **New job**, fill in the title/company, and paste the full description (at least 80 characters) or a public URL. Choose the CV language.
2. Click **Save and generate CV**. The job is saved immediately and processing continues in the queue.
3. Open the job card to follow its status and read the reviewer feedback. A URL that requires login or cannot be extracted needs a pasted description.
4. Download **PDF** or **DOCX** when the version is approved. If it needs review, inspect the listed issues and use the correction action when available; it reuses the draft and feedback. Failed requests show their error so you can fix configuration and retry.
5. Record the application date after applying. The dashboard groups saved jobs and applications by week. Deletion requires confirmation and removes the associated versions/artifacts.

The profile is the factual source; job requirements never become candidate experience. The writer selects relevant evidence and the reviewer checks it independently. Local validation checks evidence IDs, employer boundaries, metrics and document structure. Corrections are bounded: exhausted attempts do not force approval.

“Ready” means the configured checks passed, not that a recruiter or ATS will accept the CV. Read the exported document before sending it. Automated tests use simulated AI responses; not every provider/model has been evaluated with a live account.

## Optional Telegram setup

Leave `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` empty for browser-only use.

1. Use `/newbot` with [BotFather](https://t.me/BotFather) to create your bot. Put its token in `TELEGRAM_BOT_TOKEN` in `config/.env`.
2. With ApplyKit stopped, open a **private** conversation with your new bot and send `/start`.
3. From the repository root, run this command to read pending message chats without placing your token in the command:

```sh
node --input-type=module -e "import { config } from './backend/node_modules/dotenv/lib/main.js'; config({ path: 'config/.env' }); const r = await fetch('https://api.telegram.org/bot' + process.env.TELEGRAM_BOT_TOKEN + '/getUpdates'); const data = await r.json(); console.log(data.result?.map(u => u.message?.chat).filter(Boolean) ?? data);"
```

4. Copy the numeric `id` from the entry with `type: 'private'` and your name into `TELEGRAM_CHAT_ID`. An empty result means you need to send a new message while the bot is stopped. A webhook or another polling client must not be consuming this bot's updates.
5. Run `npm start` again. Use `/help` for commands and buttons. Other chat IDs are rejected.

Commands include `/job`, `/jobs`, `/status`, `/description`, `/generate`, `/download`, `/applied`, `/unapplied` and `/help`. See Telegram's [bot setup guide](https://core.telegram.org/bots/tutorial). This uses polling, so no public server URL or inbound port is required. Telegram retains undelivered updates for [at most 24 hours](https://core.telegram.org/bots/api#getting-updates); a stopped computer cannot process them and longer outages can lose unconsumed messages. Jobs already received remain in PostgreSQL.

## Troubleshooting

| Problem                                         | What to check                                                                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node is too old or npm scripts fail immediately | Check `node --version` in the same terminal; use Node 24 or newer and rerun `npm ci` / `npm run setup` if installation was incomplete.                                    |
| PowerShell blocks `npm.ps1`                     | Use `npm.cmd` instead of `npm` in the commands above, or use CMD.                                                                                                         |
| Example profile / invalid JSON error            | Replace the example, remove its marker after editing, and check required fields and JSON syntax. Run `npm run doctor`.                                                    |
| Database startup/connection failure             | Start Docker, run `npm run db:up`, and check `DATABASE_URL`. Existing database passwords must match; changing `.env` does not reset a populated Docker volume's password. |
| Port already in use                             | Stop the conflicting application on 3333, 5173 or 54329. Do not change only `BACKEND_PORT`; the frontend proxy must agree.                                                |
| CLI not found / unsupported flag                | Reopen the terminal after installation, use a full executable path when necessary, and update the CLI. On Windows, use native `codex.exe`.                                |
| API returns 401/403, 404 or 429                 | Check authentication/permissions, the model and endpoint, or the project's quota respectively. `doctor` does not validate these remotely.                                 |
| Jobs stay queued                                | Ensure a worker is running with `npm start`, not only `--web-only`; read its terminal output.                                                                             |
| Posting cannot be read                          | Paste the full description. Login-only, removed or blocked pages may not be extractable.                                                                                  |
| Settings appear unchanged                       | Stop and restart services. Check terminal environment overrides. A launcher that reuses existing services does not reload their configuration.                            |
| PDF browser is missing                          | In `backend`, run `npx puppeteer browsers install`, then return to the root. Avoid `PUPPETEER_SKIP_DOWNLOAD=true` for normal installation.                                |
| Browser installed but PDF fails on Linux        | Install the browser's system libraries using the [Puppeteer troubleshooting guide](https://pptr.dev/troubleshooting).                                                     |

Puppeteer also supports an installed browser through the `PUPPETEER_EXECUTABLE_PATH` environment variable; see its [configuration guide](https://pptr.dev/guides/configuration). DOCX/PDF generation still runs local content/layout validation.

## Development commands

| Command                                   | Purpose                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| `npm ci`                                  | Install root development tooling from its lockfile.                     |
| `npm run setup`                           | Install both apps and create missing local configuration/profile files. |
| `npm start` / `npm run dev`               | Start the complete local workflow.                                      |
| `npm run doctor`                          | Validate the profile and selected provider configuration.               |
| `npm run db:up` / `npm run db:stop`       | Start/stop the Compose database, preserving its data.                   |
| `npm run check`                           | Check TypeScript types in both apps.                                    |
| `npm run lint` / `npm run lint:fix`       | Check/fix code style and formatting.                                    |
| `npm run format` / `npm run format:check` | Write/check formatting.                                                 |
| `npm test`                                | Run backend and frontend tests.                                         |
| `npm run build`                           | Build the backend and frontend.                                         |

Before running `npm test`, start PostgreSQL. Tests create and clear **only `applykit_test`** on the server selected by `DATABASE_URL`; use a development server with database-creation privileges. AI and Telegram calls are mocked. CI runs installation, type checks, lint, tests and builds on Linux with Node 24 and PostgreSQL 17.

More detail is available in [Architecture](docs/ARCHITECTURE.md), [Profile](docs/PROFILE.md) and [Providers](docs/PROVIDERS.md); the installation steps above do not require those guides.

## Data and privacy

Keep `config/.env`, `data/profile.json`, generated CVs and database backups private. Git ignores local configuration, data, logs, dependencies and build output. Jobs/reviews live in PostgreSQL; generated documents live in `data/cvs`. Back up both the database and `data/` when preserving your work. A Git clone does not include those records.

Local Ollama runs inference on your computer. API/CLI providers receive the profile evidence and job content needed for generation/review; their account terms and quotas apply. Do not put unrelated sensitive information into your profile.

The API is intended for **single-user local use**, without an authentication layer. Keep it local; hosting and authentication require separate work. No hosting service is included.

## License

Licensed under the [MIT License](LICENSE).
