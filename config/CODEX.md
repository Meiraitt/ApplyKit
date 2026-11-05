# Codex CLI

Set `CV_PROVIDER=codex` in `.env`, install/authenticate Codex and set `CODEX_EXECUTABLE` if it is not on PATH. `CODEX_MODEL` is optional.

The adapter uses structured JSON output, an isolated temporary working directory, restricted tools and completion-event validation. Candidate facts and job text are passed explicitly; the model must not read unrelated files or use conversation memory.

Writer and reviewer execute separately. Evidence IDs, requirement quotes, reviewer traceability and local factual checks are enforced. A faulty reviewer report can be retried without rewriting correct CV text. The loop is bounded and never approves merely because attempts are exhausted.

The canonical prompt policy lives in `backend/src/prompts/codex-prompts.ts`. The prompt version is recorded with generated artifacts. See `docs/PROVIDERS.md` for limits and testing scope.
