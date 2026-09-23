---
name: configure-company
description: Configure the blog engine for a company — write config/company.yaml, seed context/, validate HubSpot. Use when the user says "configure this for <company>", "onboard <company>", "set up the blog engine for <company>", "point this at <company>", or wants to re-run configuration for the current company.
---

# /configure-company

Run the Configurator agent. The complete spec lives in
[agents/configurator.md](../../../agents/configurator.md) — read it now and
follow it exactly. This file only covers invocation mechanics.

## Arguments

`/configure-company [company name or website URL]`

- If a URL or company name was passed, treat it as interview answer #1 and
  still ask the remaining interview questions (one batch, per the spec).
- If nothing was passed, start with the full interview.

## Execution notes (Codex)

- Ask the interview questions with `AskUserQuestion` in a **single call**
  (multiple questions per call). Free-text answers arrive via "Other".
- Use `WebSearch`/`WebFetch` for the research step. Fetch the company's real
  pages; do not configure from search snippets.
- Approval gates ("show before you write", re-run diffs) are real user
  confirmations — present the proposed file or diff in chat and wait for a
  yes before writing.
- The validation commands run from the repo root:
  ```bash
  python3 scripts/company_config.py
  python3 scripts/validate_hubspot.py
  ```
- Never ask for, echo, or store the HubSpot token value. Env var name only.

## Done means

The completion report from the spec's "Completion report format" section is
delivered, `python3 scripts/company_config.py` exits 0, and HubSpot validation
is either all-green or explicitly marked "pending token" with the command the
user runs later.
