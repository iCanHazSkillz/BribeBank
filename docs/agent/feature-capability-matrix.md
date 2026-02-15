# Feature Capability Matrix

Status reflects current stable implementation in this repository.

## Implemented now
- Family auth and onboarding
  - Parent register/login
  - Join family with code
  - Regenerate join code
  - Parent forgot-password recovery via family recovery key
  - Self-hoster emergency parent password recovery CLI fallback
- User management
  - Create/update/delete users
  - Password update
  - Avatar metadata support
  - Parent + child self-delete with typed confirmation
  - Family teardown when deletion would leave zero parents
- Rewards
  - Reward template CRUD
  - Assigned prize lifecycle: assign, claim, approve/reject, delete
- Bounties
  - Bounty template CRUD
  - Assignment lifecycle: assign, accept, complete, verify, deny, delete
  - Denial reasons and notes
  - Resubmit-friendly denial flow
  - Optional deadlines per task
  - Optional photo proof requirement
- Notifications and history
  - Per-user unread notifications with read/read-all
  - Family and per-user history queries
  - Activity-feed lifecycle cards for tasks and rewards (including store-purchase reward flow)
- Push notifications
  - VAPID public key endpoint
  - Subscribe/unsubscribe endpoints
  - Deadline warning push flow
- Tickets/store/wheel economy
  - Ticket grant and balance retrieval
  - Store item CRUD and purchase flow
  - Wheel segment CRUD-ish update/reset/spin flow
  - Ticket conversion rate updates
- Templates
  - Export/import for rewards and bounties
- Real-time
  - Family-scoped SSE event streaming
- Self-hoster operations
  - Emergency parent recovery CLI fallback
  - Host-level list/delete users/families via CLI

## Partially implemented / follow-up candidates
- SSE type synchronization automation (backend/frontend union drift prevention)
- Formal automated tests across API, UI, and event paths
- Config-driven CORS (today it is hardcoded in backend server bootstrap)

## Roadmap ideas (not fully implemented)
- Scheduled/recurring bounties
- Exportable parent reports/history artifacts
- Deeper analytics and operational observability

## Evidence sources
- Schema: `bribebank-api/prisma/schema.prisma`
- Routes: `bribebank-api/src/routes/*`
- Runtime wiring: `bribebank-api/src/server.ts`
- Frontend clients: `bribebank-frontend/services/storageService.ts`, `bribebank-frontend/services/apiService.ts`
