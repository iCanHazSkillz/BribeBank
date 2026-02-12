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
- Parent password recovery via family recovery key
- Reward template CRUD and assignment
- Bounty template CRUD, assignment, verification, and denial
- Optional task deadlines and deadline warning notifications
- Optional photo proof for task completion
- Ticket grants and conversion-rate configuration
- Store item CRUD and purchase tracking
- Wheel segment configuration, reset, and spins
- Template export/import (rewards and bounties)
- Per-family history and notification management

### Child features
- Wallet of assigned rewards
- Task workflow (accept/complete/resubmit denied work)
- History and unread notifications
- Store purchases with ticket balance
- Wheel spin experience (if enabled by family)

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

## Self-Hoster Emergency Recovery
If a parent loses both password and family recovery key, the self-hoster can run a maintenance command from the API project:

```bash
cd bribebank-api
npx tsx src/scripts/recoverParentPassword.ts --username <parentUsername> --new-password "<newPassword>"
```

Optional:

```bash
npx tsx src/scripts/recoverParentPassword.ts --username <parentUsername> --new-password "<newPassword>" --force-rotate-key false
```

Notes:
- Command only recovers `PARENT` accounts.
- By default it rotates the family recovery key and prints the new key once.
- Recovery actions are audited as `MASTER_PASSWORD_RECOVERY` history events.

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
- Scheduled/recurring bounties
- Exportable history for parents
- Additional reporting/analytics for family activity

## License
TBD.
