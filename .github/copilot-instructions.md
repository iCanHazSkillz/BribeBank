# BribeBank - AI Agent Instructions (Source-of-Truth Index)

## Purpose
Use this file as the entrypoint for reliable project context. Prefer referencing canonical files over inferring behavior from stale docs.

## Architecture Snapshot
BribeBank is a family rewards platform with:
- Backend: `bribebank-api` (Express + Prisma + PostgreSQL)
- Frontend: `bribebank-frontend` (React + TypeScript + Vite)
- Real-time updates: Server-Sent Events (SSE)
- Push notifications: Web Push with VAPID

## Authoritative Sources (Read in this order)
1. Data model and enums: `bribebank-api/prisma/schema.prisma`
2. Runtime route wiring: `bribebank-api/src/server.ts`
3. Route contracts: `bribebank-api/src/routes/*`
4. Business behavior: `bribebank-api/src/controllers/*`, `bribebank-api/src/services/*`
5. Backend event types: `bribebank-api/src/types/sseEvents.ts`
6. Frontend API clients: `bribebank-frontend/services/storageService.ts`, `bribebank-frontend/services/apiService.ts`
7. Frontend app models: `bribebank-frontend/types.ts`, `bribebank-frontend/types/sseEvents.ts`
8. Deployment/env wiring: `docker-compose.yml`, `.env.example`, `bribebank-frontend/config.ts`, `bribebank-api/src/config.ts`

## Current Feature Surface (Stable)
- Auth and family lifecycle: parent registration/login, join-family, profile
- User management: create/update/delete users, password updates, avatar metadata
- Rewards: template CRUD, assignment, claim, approve/reject, assignment delete
- Bounties: template CRUD, assignment, accept/complete/verify/deny, assignment delete
- Deadlines and denial: task deadlines, warning notifications, denial reasons/notes, resubmit flow
- Photo proof: optional task photo proof during completion
- Tickets and economy: ticket grants, balances, ticket conversion rate
- Store: store item CRUD and child purchase flow
- Wheel: configurable wheel segments, spin, reset, spin cost config
- Templates: export/import reward and bounty templates
- Notifications: unread listing and read/read-all actions
- Push notifications: VAPID key and subscription endpoints
- SSE: family-scoped real-time updates via `/events`

## API Client Ownership (Frontend)
- `storageService.ts` is the primary application API layer.
- `apiService.ts` exists as a secondary/specialized auth client.
- Rule: do not call `fetch()` directly from React components. Add or extend a service method instead.
- If adding or changing endpoints, update whichever service is the actual caller and keep the split explicit in docs.

## SSE Contract Guidance
- Backend event definition in `bribebank-api/src/types/sseEvents.ts` is canonical.
- Frontend `bribebank-frontend/types/sseEvents.ts` must stay aligned with backend event union.
- When adding or changing an SSE event:
  1. Update backend type union.
  2. Update frontend type union.
  3. Update event emitters in controllers/services.
  4. Update event consumers in frontend state handlers.
  5. Update `docs/agent/contracts-events.md`.

## Env and Runtime Notes
- Frontend API env var is `VITE_API_URL`.
- Backend CORS origins are currently configured directly in `bribebank-api/src/server.ts` (not env-driven today).
- JWT secret and database URL are loaded from backend env.
- Frontend build metadata constants are injected at build time:
  - `__APP_BUILD_ID__` (unique build id)
  - `__APP_RELEASE_VERSION__` (semantic release identifier)

## AI-Managed Release Notes Policy
- Canonical release notes file: `bribebank-frontend/public/release-notes.json`.
- Release notes are AI-managed by default for this repository.
- When a change warrants build versioning, the implementing agent must review and update release notes in the same change set.
- Trigger criteria for required release-notes update:
  1. User-visible feature, UX, or behavior changes in frontend.
  2. Update to API contract or auth/permission behavior that affects app flows.
  3. Push/SSE/history lifecycle behavior changes surfaced to users.
  4. Significant bug fixes that alter expected outcomes.
  5. Auth, account recovery, or security control changes.
- Per-release maintenance rules:
  1. Ensure `releases[__APP_RELEASE_VERSION__]` exists with `title`, `date`, `features[]`, `improvements[]`, `fixes[]`.
  2. Keep bullet points concise, user-facing, and factual.
  3. Update `latest` to mirror the newest release entry.
  4. If release version changes, add a new version key instead of overwriting prior release history.
  5. If release notes are intentionally unchanged, document the reason in PR/task notes.

## Change Workflow (Documentation-Aware)
For any feature or behavior change:
1. Schema and migration updates (`schema.prisma` + migrations)
2. Backend route/controller/service updates
3. Frontend client and type updates
4. SSE/push event updates if side effects exist
5. Documentation updates:
   - `README.md` (user/developer facing)
   - `docs/agent/contracts-rest.md`
   - `docs/agent/contracts-events.md`
   - `docs/agent/feature-capability-matrix.md`
   - `bribebank-frontend/public/release-notes.json` (when trigger criteria above apply)
   - this file if ownership or architecture conventions changed

## Known Reality Checks
- Build/test execution may depend on local Node/npm availability.
- If runtime behavior and docs conflict, trust code paths above and fix docs in the same change set.
- For auth/recovery changes, also update `README.md` operational recovery guidance and `docs/agent/contracts-rest.md`.
