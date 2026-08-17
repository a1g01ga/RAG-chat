# Instructions App with a Chat

## Idea
A web app that provides a curated library of safety guides ("Anleitungen") for people affected by (cyber)stalking, based on the original guide content currently published at https://antistalking.haecksen.org/anleitungen — a German nonprofit resource ("Technische Hilfe gegen Cyberstalking" / "Technical help against cyberstalking").

## Content
- Scope is limited to the original, self-hosted guides on the source site (pages under antistalking.haecksen.org/anleitungen/...) — e.g. resetting an Android/iPhone to factory settings, protecting phone/PIN access, reconfiguring a DSL router, blocking incoming numbers, disabling Android location sharing, using a "panic exit" button, getting help silently, securing an iPhone, managing iPhone family-sharing permissions, checking logged-in devices, whether fingerprint locks are secure, editing/removing EXIF data via an app, blocking a phone number, and similar first-party content.
- Guides linking out to third-party sites (Apple/Google/Mozilla/Microsoft support pages, other advice sites, YouTube videos, etc.) are explicitly OUT of scope for now — ignore them entirely. Only self-contained guide text that we actually own/host should be imported.
- Guides are tagged by topic (e.g. Android, iPhone, Password, Tracking, Standort-GPS, Blockieren, SocialMedia, Rechtliches, etc.) — the app should preserve this tag-based categorization/filtering, limited to the tags relevant to the included guides.
- All guide content must be translated into English (the source is German-only). The source site has "deutsch"/"englisch" tags, but very little content is actually available in English — treat all guide content as needing fresh translation/rewriting into English rather than relying on existing "englisch"-tagged entries.

## Access model
- Guides are only visible to authenticated users — no public/anonymous access to guide content.
- Regular users have **read-only** access: they can browse, filter by tag, and read guides, but cannot create, edit, or delete guides.
- Guide content management (creating/editing/deleting) is out of scope for the initial version — assume it's handled separately (e.g. admin/seed data), not something to build a UI for yet.

## Explicitly out of scope for now
- Favoriting/bookmarking guides — this is a planned future feature but should NOT be implemented in this iteration. Just keep it in mind so the data model isn't actively hostile to adding it later.
- Third-party/external guides (see Content section above) — only first-party, self-hosted guide text is included.

## Stack
- Next.js (App Router)
- TypeScript 5
- Tailwind CSS 3 + tailwindcss-animate + tailwind-merge for styling
- Supabase (`@supabase/ssr`, `@supabase/supabase-js`) for auth and persistence

## Commands
All commands run from `next-with-supabase/`:

```bash
npm run dev      # start dev server (Next.js, Turbopack) at localhost:3000
npm run build    # production build
npm run start    # run production build
npm run lint     # eslint
npm run seed:guides     # seed guides/tags/guide_tags from source content (scripts/seed-guides.mts)
npm run embed:guides    # backfill/refresh guide embeddings for RAG chat (run after seeding or editing guide content)
npm run test:e2e        # Playwright end-to-end tests
npm run mock:openrouter # local mock OpenRouter server for e2e tests (see tests/helpers/)
```

## Environment setup

Copy `next-with-supabase/.env.example` to `next-with-supabase/.env.local` (git-ignored) and fill in:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (anon key)
- `OPENROUTER_API_KEY` — server-side LLM/embedding calls, see AI rules below (never prefix with `NEXT_PUBLIC_`)
- `SUPABASE_SECRET_KEY` — privileged key used only by `scripts/seed-guides.mts` (`npm run seed:guides`)
- `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` — Playwright e2e test account, not used by the app itself
- `TEST_USER2_EMAIL` / `TEST_USER2_PASSWORD` — second Playwright e2e test account, used only by the cross-user ownership tests (`tests/chat/ownership-guard.spec.ts`, `tests/chat/cross-user-access.spec.ts`)
- `OPENROUTER_MOCK_URL` — optional, points OpenRouter calls at the local mock server (`npm run mock:openrouter`) for e2e tests; leave unset for normal dev/prod

## Architecture
This is the standard `create-next-app --template with-supabase` starter (Next.js 15 App Router, React 19, Tailwind, shadcn/ui "new-york" style), currently unmodified apart from scaffolding. Key pieces:

- **Auth flow**: `app/auth/*` contains login, sign-up, forgot-password, update-password, and error pages, all backed by Supabase Auth. `app/auth/confirm/route.ts` handles the email-confirmation callback.
- **Session/auth enforcement**: `proxy.ts` (Next.js middleware, run on every matched request) delegates to `lib/supabase/proxy.ts`'s `updateSession()`. This is what redirects unauthenticated users to `/auth/login` for any path other than `/`, `/login*`, or `/auth*` — **this is the single choke point for route protection**. 
Any new protected route must not be excluded by the `config.matcher` in `proxy.ts`, and must not be added to the allowlist in `updateSession()`.
- **Three Supabase client constructors**, each for a different context — don't mix them up:
  - `lib/supabase/client.ts` — browser client (`createBrowserClient`), for Client Components.
  - `lib/supabase/server.ts` — server client (`createServerClient` + `next/headers` cookies), a fresh instance per request/function call (never cache/globalize it — noted in the file, matters for Fluid Compute).
  - `lib/supabase/proxy.ts` — the middleware-specific client used only by `proxy.ts`.
- **`app/protected/`** is the template's example of an authenticated area (`layout.tsx` + `page.tsx`), reading `supabase.auth.getClaims()` server-side. Use this as the pattern for any new authenticated pages/routes.
- **`lib/utils.ts`** exports `cn()` (clsx + tailwind-merge) and `hasEnvVars` (a template convenience flag gating an env-var-missing warning banner in the UI — safe to remove once real env vars are always set).
- **UI components**: `components/ui/*` are shadcn/ui primitives (add more via `npx shadcn add <name>` from `next-with-supabase/`, per `components.json`'s config — style `new-york`, base color `neutral`, icons via `lucide-react`). `components/*.tsx` at the top level are the template's feature components (auth forms, theme switcher, tutorial steps, etc.) — replace/extend these as the actual product idea is built out.
- **`app/guides/`** — the guide library: `page.tsx` lists published guides (with tags) via `GuidesBrowser`; `[slug]/page.tsx` renders a single guide. Both are authenticated-only per the route protection above.
- **`app/chat/`** and **`app/api/chat/route.ts`** — the RAG chat assistant: `page.tsx` / `[conversationId]/page.tsx` render conversation threads (persistence helpers in `lib/chat/data.ts`), and `api/chat/route.ts` is the POST endpoint that saves the user message, retrieves relevant guide excerpts via `match_documents` (see Data model), and calls the LLM (`lib/ai/openrouter.ts`).
- **`lib/guides/`, `lib/chat/`, `lib/ai/`** — types and data-access helpers for guides, chat persistence, and OpenRouter calls, respectively.
- **`components/guides/`, `components/chat/`** — feature UI for the guide browser and the chat thread/sidebar.

## Data model
Tables (managed via migrations in `supabase/migrations/`):
- guides             — id, slug, title, content, created_at, updated_at, is_published
- tags               — id, name, slug
- guide_tags         — guide_id, tag_id, created_at
- documents          — id, guide_id, content, embedding (`vector(1536)`) — RAG store for guide content, shared across users (no `user_id`); queried via the `match_documents` RPC
- chat_conversations — id, user_id, title, created_at, updated_at — RLS-scoped to `auth.uid()`
- chat_messages      — id, conversation_id, role (`user`/`assistant`), content, created_at — RLS-scoped via parent conversation

My Supabase project URL and anon key are already in .env.local.

## AI rules
AI model calls:
- All LLM and embedding calls must happen server-side only. Never call OpenRouter
  from browser code.
- `OPENROUTER_API_KEY` lives in `.env.local` and must never have a `NEXT_PUBLIC_` prefix
  or be passed to client components.
- Model: anthropic/claude-sonnet-4-6

RAG is implemented (chat retrieval over guide content):
Embeddings:
- Embedding model: `openai/text-embedding-3-small` via OpenRouter.
- The `documents` table embedding column is `vector(1536)` — do not change this dimension.
- Never change the embedding model after initial setup. Changing it breaks retrieval silently.
- Retrieval flow: `rewriteRetrievalQuery` (`lib/ai/openrouter.ts`) rewrites follow-up questions into a standalone query before embedding, then the `match_documents` Postgres RPC is called (match_threshold 0.5, match_count 5) to fetch relevant guide excerpts.

## Search
- Client-side filter on guides already loaded in state — no per-keystroke Supabase query
- Case-insensitive substring match on title

## Visual Design Requirements
- Give the app a clean, modern look: a lilac, pink, purple colour palette, generous spacing, clear typography, simple hover states, and a tidy header.

## Running the app
Run `npm run dev`. The app runs at http://localhost:3000.

## Conventions
- New pages go inside the `app/` folder
- Shared UI components go in `app/components/`

## Next.js file conventions
- The `middleware.ts` file convention is deprecated in favour of `proxy.ts` (see [Next.js docs](https://nextjs.org/docs/messages/middleware-to-proxy)). When session-refresh or request-interception logic is needed, create `proxy.ts` at the project root (exporting a `proxy` function, not `middleware`). Run `npx @next/codemod@canary middleware-to-proxy .` to migrate existing files.

## Do not
- Add npm packages without asking first
- Use the older Pages Router
- Put secrets or API keys in source files — use .env.local for environment variables
- Create `middleware.ts` — use `proxy.ts` instead (see Next.js file conventions above)