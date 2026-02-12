# REST Contracts (Current Stable)

Source of truth: route modules in `bribebank-api/src/routes/*` and wiring in `bribebank-api/src/server.ts`.

## Auth model
- Most endpoints require Bearer JWT via `Authorization: Bearer <token>`.
- Exceptions:
  - Public auth endpoints (register/login/join)
  - `GET /push/public-key`
  - `GET /events?token=<jwt>` (JWT passed as query token)

## Endpoint inventory

### Auth (`/auth`)
- `POST /auth/register-parent` (public)
- `POST /auth/login` (public)
- `POST /auth/join-family` (public)
- `POST /auth/regenerate-code` (auth)
- `GET /auth/me` (auth)

### Rewards and assigned prizes
- `GET /families/:familyId/rewards` (auth)
- `POST /families/:familyId/rewards` (auth)
- `PUT /rewards/:id` (auth)
- `DELETE /rewards/:id` (auth)
- `GET /families/:familyId/assigned-prizes` (auth)
- `POST /families/:familyId/assigned-prizes` (auth)
- `POST /assigned-prizes/:id/claim` (auth)
- `POST /assigned-prizes/:id/approve` (auth)
- `POST /assigned-prizes/:id/reject` (auth)
- `DELETE /assigned-prizes/:id` (auth)

### Bounties and assignments
- `GET /families/:familyId/bounties` (auth)
- `POST /families/:familyId/bounties` (auth)
- `PUT /bounties/:id` (auth)
- `DELETE /bounties/:id` (auth)
- `GET /families/:familyId/bounty-assignments` (auth)
- `POST /families/:familyId/bounty-assignments` (auth)
- `POST /bounty-assignments/:id/accept` (auth)
- `POST /bounty-assignments/:id/complete` (auth)
- `POST /bounty-assignments/:id/verify` (auth)
- `POST /bounty-assignments/:id/deny` (auth)
- `DELETE /bounty-assignments/:id` (auth)

### Users
- `GET /families/:familyId/users` (auth)
- `POST /families/:familyId/users` (auth)
- `GET /users/:id/avatar-info` (auth)
- `PATCH /users/:id` (auth)
- `PATCH /users/:id/password` (auth)
- `DELETE /users/:id` (auth)

### History
- `GET /families/:familyId/history` (auth)
  - Optional query: `?userId=<childId>`

### Notifications
- `GET /users/:userId/notifications` (auth; self only)
- `POST /notifications/:id/read` (auth; owner only)
- `POST /users/:userId/notifications/read-all` (auth; self only)

### Push
- `GET /push/public-key` (public)
- `POST /push/subscribe` (auth)
- `POST /push/unsubscribe` (auth)

### Tickets
- `POST /users/:userId/tickets` (auth)
- `GET /users/:userId/tickets` (auth)

### Store
- `GET /families/:familyId/store-items` (auth)
- `POST /families/:familyId/store-items` (auth)
- `PUT /store-items/:id` (auth)
- `DELETE /store-items/:id` (auth)
- `POST /store-items/:id/purchase` (auth)

### Wheel and conversion settings
- `GET /families/:familyId/wheel-segments` (auth)
- `GET /families/:familyId/wheel-config` (auth)
- `PUT /families/:familyId/wheel-segments` (auth)
- `POST /families/:familyId/wheel-segments/reset` (auth)
- `POST /families/:familyId/wheel-segments/spin` (auth)
- `PUT /families/:familyId/ticket-conversion-rate` (auth)

### Templates
- `GET /templates/export` (auth)
- `POST /templates/import` (auth)

### Events (SSE)
- `GET /events?token=<jwt>` (token query auth)

## Contract maintenance rules
- Add/remove route: update this file in the same change set.
- Change auth behavior: update auth notes and endpoint annotations.
- Change path params/query: document required/optional input changes.
