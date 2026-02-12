# BribeBank System Map

## Goal
This document maps how requests and side effects move through the system so new features can be added with minimal ambiguity.

## End-to-end flow
1. React UI (`bribebank-frontend/components/*`) triggers a user action.
2. Frontend service layer calls backend:
   - Primary client: `bribebank-frontend/services/storageService.ts`
   - Secondary auth-focused client: `bribebank-frontend/services/apiService.ts`
3. API URL is composed by `bribebank-frontend/config.ts` using `VITE_API_URL`.
4. Express route handlers in `bribebank-api/src/routes/*` map HTTP endpoints to controllers.
5. Controllers in `bribebank-api/src/controllers/*` enforce auth/role rules and orchestrate actions.
6. Persistence is executed with Prisma through `bribebank-api/src/lib/prisma.ts` and models in `prisma/schema.prisma`.
7. Side effects may be emitted:
   - SSE family broadcasts via `bribebank-api/src/realtime/eventBus.ts`
   - Push notifications via `bribebank-api/src/services/pushService.ts`
   - History and notifications via `bribebank-api/src/services/historyService.ts` and `notificationService.ts`
8. Frontend receives updates by polling/fetch refresh and SSE stream from `/events`.

## Runtime composition
- API bootstrap: `bribebank-api/src/server.ts`
- Mounted route modules:
  - `/auth`
  - reward routes
  - bounty routes
  - user routes
  - `/events`
  - history routes
  - notification routes
  - `/push`
  - ticket routes
  - store item routes
  - wheel routes
  - `/templates`

## Core domain objects (schema source)
Defined in `bribebank-api/prisma/schema.prisma`:
- `Family`, `User`, `Reward`, `AssignedPrize`
- `Bounty`, `BountyAssignment`
- `StoreItem`, `WheelSegment`
- `Notification`, `HistoryEvent`, `PushSubscription`

## Eventing model
- SSE connection: `GET /events?token=<jwt>`
- Broadcast scope: family-level fanout
- Canonical event union: `bribebank-api/src/types/sseEvents.ts`
- Frontend mirror: `bribebank-frontend/types/sseEvents.ts`

## Operational notes
- Backend CORS allowlist is currently hardcoded in `bribebank-api/src/server.ts`.
- Deadline monitor starts on API boot and periodically scans for near-expiry tasks.
- Frontend relies on localStorage for auth/session persistence (`bribebank_token` + session key in service layer).

## Feature addition touchpoints
For most feature additions, inspect and update in this order:
1. `prisma/schema.prisma`
2. route file(s) in `bribebank-api/src/routes`
3. controller/service implementation
4. frontend service methods
5. frontend types/UI
6. SSE/push side effects and event type unions
7. docs in `docs/agent/*` and `README.md`
