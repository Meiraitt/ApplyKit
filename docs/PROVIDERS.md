# AI providers

All settings live in `.env`. Process environment variables take precedence. Restart after changes. Only the selected provider must be configured.

| CV_PROVIDER | Required settings                                            | Protocol                           |
| ----------- | ------------------------------------------------------------ | ---------------------------------- |
| codex       | CODEX_EXECUTABLE; optional CODEX_MODEL                       | Local Codex CLI                    |
| claude      | CLAUDE_EXECUTABLE; optional CLAUDE_MODEL                     | Local Claude Code CLI              |
| gemini      | GEMINI_MODEL, GEMINI_API_KEY_WRITER, GEMINI_API_KEY_REVIEWER | Gemini native API                  |
| ollama      | OLLAMA_HOST, OLLAMA_MODEL_WRITER, OLLAMA_MODEL_REVIEWER      | Ollama chat API                    |
| compatible  | LLM_API_URL, LLM_MODEL, LLM_API_KEY or role keys             | OpenAI-compatible Chat Completions |

## CLI agents

Install and authenticate the CLI on your machine. Set its executable on PATH or provide an absolute path. No subscription or credentials are included with this project. Run `npm run doctor` for local diagnostics; a successful executable check does not guarantee authentication, quota or model access.

The CLI adapters request structured JSON, restrict tools and isolate temporary working directories. Codex checks completed-turn events and rejects external tool use. Claude requires a version supporting the adapter flags, including `--safe-mode`, `--tools` and `--json-schema`; incompatible versions fail rather than silently relaxing restrictions.

See [Codex](../config/CODEX.md) and [Claude](../config/CLAUDE.md).

## Gemini

Writer and reviewer keys may be the same. Keys belonging to the same Google project share its quotas. The app does not infer a daily quota from the number of keys.

The initial whole-CV pass normally uses two calls: writer and reviewer. Corrections increase this count, up to the bounded flow budget. Explicit transient server errors may use 2/4/6-second backoff when enabled by the caller; quota, authentication, malformed schema and ambiguous network failures are not blindly retried. Checkpoints allow supported review resumption.

## Ollama

Start Ollama and pull both models before generation. Hardware, quantization, context length and model quality affect speed and reliability. The smaller-model pipeline can use many requests because planning, individual claims and repair are separate steps. It is not a two-request guarantee.

## Compatible APIs

Set the full URL, for example `https://api.example.com/v1/chat/completions`. Configure the key separately, never in the URL. HTTPS is required except for local development endpoints.

The adapter uses Bearer authentication, chat messages and a Chat Completions response envelope. `LLM_RESPONSE_FORMAT` accepts `json_object`, `json_schema` or `none`. Schema support differs between vendors; disabling the wire-format hint does not disable local validation.

Changing only URL/key works **only if the provider implements this protocol**. Native Anthropic Messages, Gemini generateContent and other request/response formats need an adapter. Implement the transport in `backend/src/infrastructure/providers`, validate its output against the existing schemas and add transport tests before exposing it as a provider.

## Usage and quality

The UI records provider-reported token usage where available. CLI cached input, reasoning and output fields vary; token counts and billing are not interchangeable across vendors.

Automated tests mock provider responses. They verify orchestration, refusal, schema validation and error behavior, not universal CV quality or live access to every provider. New model versions need real generation and review evaluation with a confirmed profile.
