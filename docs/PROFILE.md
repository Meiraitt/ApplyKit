# Confirmed profile

Edit `data/profile.json`; use `config/profile.example.json` as the schema example. The example is deliberately blocked from generation until replaced.

## Facts

Each experience needs a stable `id`, company, role, period, kind (`work` or `project`) and facts with unique IDs and factual text. Keep facts in your preferred source language; output language is selected per job.

Describe:

- What you personally did, on what object, and in which company/project.
- Technologies actually used for that action.
- Partial contribution versus full implementation or ownership.
- The confirmed problem, action, validation and result, when known.
- Metric units, period and qualifiers. Product scale is not individual acquisition.
- Limitations needed to avoid misattribution.

Use `usage: "context"` for background that supports context/tooling but is not a contribution by itself. Optional `area` values group evidence; consult the schema in `backend/src/domain/types.ts`.

Separate personal projects from employment. Put study-only technologies in `studies`; they may appear under Skills without becoming professional experience. Global skills do not prove usage in every company. Notes may clarify scope but should not include secrets or unrelated personal data.

Preserve actual role names, dates, education and language proficiency. The renderer takes these from the profile rather than allowing the model to invent them. For closed periods, use `MM/YYYY – MM/YYYY` to support deduplicated career duration.

Do not use generated CV text as proof of a new fact. Add facts only after confirming them yourself.
