# Claude Code CLI

Set `CV_PROVIDER=claude`, install/authenticate Claude Code and configure `CLAUDE_EXECUTABLE` if needed. `CLAUDE_MODEL` is optional.

The adapter requires compatible structured-output and restriction flags: `--safe-mode`, `--tools`, `--json-schema` and JSON output. Claude Code 1.x is rejected by diagnostics. Verify your installed version with `npm run doctor`.

The same evidence-grounded writer/reviewer contract used by Codex applies. Unknown executable shims, incomplete responses, malformed JSON, timeouts and output-contract violations fail without approval.

Transport tests use simulated CLI responses. They do not establish live compatibility with every Claude version or guarantee equivalent CV quality. Do not weaken tool restrictions to bypass incompatibility; update the adapter and its tests for a supported version.
