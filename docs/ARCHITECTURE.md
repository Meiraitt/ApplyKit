# Architecture

One repository contains the frontend, backend and development tooling. This keeps shared setup and local installation straightforward.

- `backend/src/controllers`: HTTP input/output and validation.
- `backend/src/services`: job editing, generation and application workflows.
- `backend/src/repositories`: persistence and queries.
- `backend/src/domain`: schemas, evidence validation, selection and review contracts.
- `backend/src/prompts`: English writer/reviewer policies.
- `backend/src/infrastructure`: PostgreSQL, pg-boss, providers, URL import and document rendering.
- `backend/src/integrations/telegram`: authorized chat interaction and persistent outbox.
- `frontend/src/app`: application shell and shared state.
- `frontend/src/views`: assembled views and their local components.
- `frontend/src/components`: reusable UI.
- `frontend/src/lib`: API and shared utilities.
- `scripts`: setup, development lifecycle and checks.

PostgreSQL stores jobs, generations, review/checkpoint data and Telegram state. pg-boss provides durable processing with bounded concurrency. PDF/DOCX artifacts live outside source control in `data/cvs`.

Codex, Claude and compatible APIs share the complete-CV generation/review contract. Gemini has a separate native transport and complete-CV loop. Ollama supports a smaller-model planning/composition path with claim-level checks. Provider availability does not establish equal output quality.

Generation snapshots and versioned artifacts are retained. Incremental corrections start from a previous draft and feedback. Application records can reference the version actually used.
