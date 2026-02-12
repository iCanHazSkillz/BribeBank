# Change Playbook (Feature Additions)

Use this checklist to make feature work decision-complete and documentation-safe.

## 1. Define behavior and data
- Confirm user workflow and role constraints (parent vs child).
- Identify affected models/enums in `prisma/schema.prisma`.
- Define side effects: SSE, push, notifications, history, balances.

## 2. Backend changes
- Update schema first (`prisma/schema.prisma`).
- Create migration and regenerate Prisma client.
- Add/update controller logic in `bribebank-api/src/controllers/*`.
- Add/update route contract in `bribebank-api/src/routes/*`.
- Ensure route is mounted in `bribebank-api/src/server.ts`.
- Add role/family authorization checks.
- Add or adjust history/notification/push/SSE side effects.

## 3. Frontend changes
- Update service method(s):
  - Primary app client: `bribebank-frontend/services/storageService.ts`
  - Auth-focused client if needed: `bribebank-frontend/services/apiService.ts`
- Update `bribebank-frontend/types.ts` and component-level typing.
- Update SSE event handlers and frontend `types/sseEvents.ts` when needed.

## 4. Contract synchronization
- REST contract updates in `docs/agent/contracts-rest.md`.
- SSE contract updates in `docs/agent/contracts-events.md`.
- Capability status updates in `docs/agent/feature-capability-matrix.md`.
- High-level context updates in `.github/copilot-instructions.md` and `README.md`.

## 5. Validation checklist
- Confirm env variable names used in docs match code and compose.
- Confirm route paths/methods in docs match route modules.
- Confirm SSE unions align backend and frontend.
- Confirm no direct component `fetch()` calls were added.
- Confirm setup instructions still work from clean clone.

## 6. Suggested command set
Run from repo root:

```bash
rg "VITE_API_URL|DATABASE_URL|JWT_SECRET" README.md .env.example bribebank-frontend/config.ts docker-compose.yml
rg "router\.(get|post|put|patch|delete)" bribebank-api/src/routes
rg "type:" bribebank-api/src/types/sseEvents.ts bribebank-frontend/types/sseEvents.ts
rg "fetch\(" bribebank-frontend/components bribebank-frontend/services
```

## 7. Acceptance criteria template
- Behavior works for authorized roles only.
- API error states are explicit and surfaced.
- Required side effects occur (SSE/push/history/notification).
- Documentation updates are included in the same change.
- No unresolved contract drift remains.
