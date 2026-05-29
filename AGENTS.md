# Repository Guidelines

## Project Structure & Module Organization

This is a Next.js App Router project for Alibi. Main application routes live in `app/`, including server actions in `app/actions/`. Shared UI components live in `components/`, with dashboard-specific views under `components/dashboard/`. Shared logic, Supabase clients, prompt text, and derived-data helpers live in `lib/`. Database schema and migration SQL live in `db/`. Product and implementation docs are in `README.md`, `specs/SPECS.md`, `specs/PROJECT.md`, `specs/STYLES.md`, `specs/RESEARCH.md`, and `logs/REVIEW.md`.

## Build, Test, and Development Commands

- `pnpm dev` — start the local Next.js dev server.
- `pnpm build` — create a production build; use this as the main verification step.
- `pnpm start` — run the production build locally.
- `pnpm test:unit` — run the Vitest unit suite.
- `pnpm test:e2e` — run Playwright E2E tests against a running dev server.
- `pnpm lint` — intended lint command, but it is currently broken with the installed Next.js version and should not be treated as a passing gate until fixed.

## Coding Style & Naming Conventions

Use TypeScript throughout. Follow the existing file style: double quotes are common in `app/`, semicolons are used there, while some older files omit them. Match the surrounding file instead of reformatting unrelated code. Use `PascalCase` for React components, `camelCase` for functions and variables, and kebab-free route folder names in `app/`. Keep server-only logic in server actions or `lib/`, not in client components.

When changing product terminology, prefer `companion` for current app/runtime naming. Legacy `coach_*` database references are intentionally retained in migration compatibility files.

## Testing Guidelines

Verify changes with:
- `pnpm build`
- `pnpm test:unit` for logic changes
- `pnpm test:e2e` for demo/browser workflow changes when a dev server is running
- targeted manual checks in `/app`, `/app/dashboard`, `/app/calendar`, `/app/settings`, and `/demo`

If you add tests later, place them near the feature or in a dedicated test folder and use clear names like `timer.spec.ts` or `process-message.test.ts`.

## Commit & Pull Request Guidelines

Recent commits use short, plain-language subjects such as `resume button fix` and `update demo to reflect recent changes`. Keep commit messages concise, lowercase, and focused on one change. PRs should include:
- a short summary of user-visible behavior,
- any schema or migration impact,
- manual verification steps,
- screenshots for UI changes.

## Security & Configuration Tips

Supabase and OpenRouter keys live in `.env`. Do not commit secrets. Treat `db/*.sql` as reviewed migration artifacts, especially anything touching `companion_*` or legacy `coach_*` tables.

## Styles:

Always follow the design system for component and class rules; refer to `specs/STYLES.md`.
