# CLAUDE.md — alimentos-ai

Conventions for anyone (human or AI assistant) working in this repository.

## Project

- AI microservice of AlimentaIQ. It is called **only** by `alimentos-backend`, server to server.
  No database, no CORS, no code shared with `alimentos-backend` or `alimentos-frontend`.
- The API contract lives in `docs/api-contract.md` of the backend repo (section 5); the README
  copies the part this service exposes.
- Stack: Node 22 LTS, Fastify 5, strict TypeScript (ESM, `NodeNext`), Zod. Deployed on Render.

## Security rules

- **Only this service knows `GEMINI_API_KEY`.** It never appears in responses, logs, errors,
  tests or docs.
- Everything under `/v1` requires `X-Internal-Key`, compared with `crypto.timingSafeEqual` over
  SHA-256 digests. Missing and wrong keys get the same `401 UNAUTHORIZED`.
- The logger redacts `x-internal-key`, `authorization` and `cookie`. Never log keys or prompts
  containing them.
- **The client never sends computed figures: the backend builds the context.** This service
  receives already filtered data, validates it with Zod and returns structured JSON (validated with
  Zod as well).

## Code

- Code, identifiers, comments, commit messages and log messages in **English**. User-facing docs
  (README) in Spanish.
- Layers: `route → controller → service` (plus a Gemini client/adapter in phase 3).
- Each module lives in `src/modules/<name>/` with an `index.ts` barrel. Dependencies are injected
  through factory functions so tests can use fakes; `buildApp(deps)` is the composition root.
- Relative imports use the `.js` extension (ESM output).

## Errors

- Format: `{ "error": { "code": "STRING", "category"?: "STRING", "message": "text" } }`.
- Throw `AppError(statusCode, code, message, category?)`, or `AppError.ai(category, message)` for
  AI failures (`MODEL_NOT_FOUND` 502, `QUOTA_EXCEEDED` 429, `TIMEOUT` 504, `UPSTREAM_ERROR` 502,
  `INVALID_API_KEY` 500).
- Never send stack traces; never expose internal messages when `NODE_ENV=production`.

## Dependencies

- Exact versions only (no `^` or `~`); `.npmrc` enforces `save-exact` and `engine-strict`. Use
  npm and commit `package-lock.json`.
- Do not add dependencies outside the current phase's plan (the Gemini SDK enters in phase 3).

## Secrets

- Never commit secrets: `.env`, `.env.*` (except `.env.example`), `cookies.txt`, `*.pem` are
  ignored. `.env.example` lists names only, never values.
- Never print keys to the terminal. CI uses a fake 64-character `AI_INTERNAL_KEY`.

## Commits

- Many small commits: one per logical piece (a file or a very small group of related files).
  Never one giant commit.
- Conventional Commits: `feat`, `fix`, `chore`, `test`, `docs`, `ci`, `refactor`, with an optional
  scope, e.g. `feat(auth): add internal key check`.
- Messages in English, imperative mood, specific.
- Every commit must leave the repo coherent: it compiles, lint and tests pass.
- Authorship is Jack-Limas only: no `Co-Authored-By` or tool attribution lines.

## Checks before committing

```bash
npm run lint && npm run typecheck && npm test && npm run build
```
