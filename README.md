![BribeBank logo](https://github.com/iCanHazSkillz/BribeBank/blob/master/bribebank-frontend/src/assets/BribeBankLogo.webp?raw=true)

# BribeBank

BribeBank is a family rewards wallet for parents and kids.

Parents create a family, add children, and manage:
- Rewards (prize cards in a child wallet)
- Bounties (tasks/chores that grant rewards or tickets)
- Store and wheel systems driven by tickets

The app supports real-time updates through SSE and web push notifications.

## Features

### Parent/Admin features
- Family and user management (parent/child roles)
- In-app account self-delete with typed confirmation (`DELETE`)
- Parent password recovery via family recovery key
- Reward template CRUD and assignment
- Bounty template CRUD, assignment, verification, denial, and cancellation
- Recurring task series (daily/weekly/monthly/yearly) with schedule selectors
- Parent pause/resume controls for recurring series in Manage activity feed
- Recurring streak counters and milestone rewards (tickets or custom)
- Optional task deadlines and deadline warning notifications
- Optional photo proof for task completion
- Ticket grants and conversion-rate configuration
- Family timezone setting for recurrence scheduling (container timezone fallback until set)
- Store item CRUD and purchase tracking
- Wheel segment configuration, reset, and spins
- Template export/import (rewards and bounties)
- Per-family history and notification management

### Child features
- Wallet of assigned rewards
- Task workflow (accept/complete/resubmit denied work)
- Recurring task cards with streak display and paused-state lockout when parent pauses series
- History and unread notifications
- Store purchases with ticket balance
- Wheel spin experience (if enabled by family)
- In-app account self-delete from profile menu with typed confirmation (`DELETE`)

## Tech Stack

### Backend (`bribebank-api`)
- Node.js + TypeScript
- Express
- Prisma ORM
- PostgreSQL
- JWT auth
- Server-Sent Events (SSE)
- Web Push (VAPID)

### Frontend (`bribebank-frontend`)
- React + TypeScript
- Vite
- Tailwind-style utility classes
- `storageService.ts` (primary API client)
- `apiService.ts` (auth-focused API client)

### Deployment
- `docker-compose.yml` with API, frontend, and Postgres services
- Designed for reverse proxy deployment

## Project Structure

```text
BribeBank/
├── bribebank-api/
│   ├── prisma/schema.prisma
│   ├── src/controllers/
│   ├── src/routes/
│   ├── src/services/
│   ├── src/realtime/
│   ├── src/types/
│   └── package.json
├── bribebank-frontend/
│   ├── components/
│   ├── services/
│   ├── types.ts
│   ├── types/
│   ├── config.ts
│   └── package.json
├── docs/agent/
├── docker-compose.yml
├── .env.example
└── README.md
```

## Running Locally (Dev)

### Backend (`bribebank-api`)
1. `cd bribebank-api`
2. Create `.env` using values compatible with your Postgres instance.

Example:

```text
DATABASE_URL=postgresql://bribebank:password@localhost:5432/bribebank?schema=public
JWT_SECRET=change-me
PORT=3001
```

3. Run:

```bash
npm install
npx prisma migrate dev
npm run dev
```

API defaults to `http://localhost:3001`.

### Frontend (`bribebank-frontend`)
1. `cd bribebank-frontend`
2. Set `VITE_API_URL` in `.env`.

Example:

```text
VITE_API_URL=http://localhost:3001
```

3. Run:

```bash
npm install
npm run dev
```

Frontend defaults to `http://localhost:5173`.

### Running with Docker
From repo root:

```bash
docker compose build
docker compose up -d
```

## Environment Notes
- Frontend reads `VITE_API_URL` from build/runtime environment (`bribebank-frontend/config.ts`).
- Backend CORS allowlist is currently hardcoded in `bribebank-api/src/server.ts`.
- Backend `JWT_SECRET` and `DATABASE_URL` are loaded through backend env.
- Password changes immediately invalidate old sessions by bumping a server-side `sessionVersion`.
- Admin deep links support both `adminTab=manage` and legacy `adminTab=approvals` (mapped to Manage).
- Recurring scheduling uses `family.timezone` when set; otherwise it falls back to container timezone (or UTC).

## PWA Update Behavior
- App update checks happen on startup and when the app returns to foreground.
- Frontend serves `/version.json` (build metadata: `buildId`, `releaseVersion`, optional `builtAt`) and uses it to detect newer builds.
- Service worker uses network-first for HTML navigation (with cache fallback) and cache-backed static assets.
- When a newer build is detected, the app performs one guarded auto-reload to apply the update.

## Self-Hoster Emergency Recovery
If a parent loses both password and family recovery key, use one of the following methods.

### Preferred (production container)
Run inside the already-built API container so Prisma Client and schema stay in sync:

```bash
docker compose -f docker-compose.yml exec bribebank-api \
  node dist/scripts/recoverParentPassword.js --username <parentUsername> --new-password "<newPassword>"
```

Optional:

```bash
docker compose -f docker-compose.yml exec bribebank-api \
  node dist/scripts/recoverParentPassword.js --username <parentUsername> --new-password "<newPassword>" --force-rotate-key false
```

### Host fallback (outside container)
If you must run from host, install deps and regenerate Prisma client first:

```bash
cd bribebank-api
npm install
npx prisma generate
npm run recover:parent-password -- --username <parentUsername> --new-password "<newPassword>"
```

Notes:
- Command only recovers `PARENT` accounts.
- By default it rotates the family recovery key and prints the new key once.
- Recovery actions are audited as `MASTER_PASSWORD_RECOVERY` history events.
- If you see `Unknown argument sessionVersion` or `passwordRecoveryKeyHash`, your local Prisma client is stale. Run `npx prisma generate` and retry.

## Self-Hoster User/Family Management
BribeBank also includes host-level listing and deletion tooling.

### Docker assumptions (production)
- Run host tooling from the running API container (`bribebank-api`).
- Self-hoster management is CLI-only (no self-hoster HTTP API).

### CLI list/delete commands (inside running container)

Run directly from host against the running container:

```bash
docker compose exec bribebank-api node dist/scripts/selfHosterList.js --families
docker compose exec bribebank-api node dist/scripts/selfHosterList.js --users
docker compose exec bribebank-api node dist/scripts/selfHosterList.js --users --family-id <familyId>
docker compose exec bribebank-api node dist/scripts/selfHosterDelete.js --user-id <userId> --yes
docker compose exec bribebank-api node dist/scripts/selfHosterDelete.js --family-id <familyId> --yes
```

Or open a shell first:

```bash
docker compose exec bribebank-api sh
node dist/scripts/selfHosterList.js --families
node dist/scripts/selfHosterList.js --users --family-id <familyId>
node dist/scripts/selfHosterDelete.js --user-id <userId> --yes
node dist/scripts/selfHosterDelete.js --family-id <familyId> --yes
```

Notes:
- Deletion commands require `--yes`.
- User deletion follows app deletion rules:
  - deleting the final account deletes the family
  - deleting a parent that would leave zero parents also tears down the family

## Agent and Contract Docs
- System map: `docs/agent/system-map.md`
- REST contracts: `docs/agent/contracts-rest.md`
- Event contracts: `docs/agent/contracts-events.md`
- Feature matrix: `docs/agent/feature-capability-matrix.md`
- Change playbook: `docs/agent/change-playbook.md`
- Agent entrypoint: `.github/copilot-instructions.md`

## Doc Sync Checklist
When behavior changes, update docs in the same PR/change set:
- `README.md` for env/setup/feature summary changes
- `docs/agent/contracts-rest.md` for route changes
- `docs/agent/contracts-events.md` for SSE changes
- `docs/agent/feature-capability-matrix.md` for capability status
- `.github/copilot-instructions.md` for ownership/convention changes

### Lightweight validation commands
Use ripgrep from repo root:

```bash
rg "VITE_API_URL|DATABASE_URL|JWT_SECRET" README.md .env.example bribebank-frontend/config.ts docker-compose.yml
rg "app.use\(|router\.(get|post|put|patch|delete)" bribebank-api/src/server.ts bribebank-api/src/routes
rg "type:" bribebank-api/src/types/sseEvents.ts bribebank-frontend/types/sseEvents.ts
```

## Roadmap Ideas
- Exportable history for parents
- Additional reporting/analytics for family activity

## License
TBD.
