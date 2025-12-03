![alt text](https://github.com/iCanHazSkillz/BribeBank/blob/master/bribebank-frontend/src/assets/BribeBankLogo.webp?raw=true)
# BribeBank

BribeBank is a **family rewards wallet** for parents and kids.

Parents create a family, add their children, and assign:

- **Rewards** (prize cards) that live in each child’s wallet
- **Bounties** (tasks/chores) that pay out rewards when verified

The app uses **real-time updates (SSE)** so that when a child starts/completes a task or claims a reward, the parent’s admin dashboard refreshes immediately.

---

## Features

### For Parents (Admin Dashboard)

- Create and manage a **family**
- Add / edit / disable **users** (parents and children)
- Create **reward templates**:
  - Title, description, emoji, theme color
  - Assign to one or more children
- Create **bounty templates** (tasks):
  - Title, emoji, reward value (`"$5"`, `"30 mins TV"`, etc.)
  - Optional **FCFS** (first-come-first-served) behaviour
  - Card theme color
- Approve / deny **reward claims**
- Verify **completed bounties** and automatically grant a reward
- View **history** of actions per child
- Receive and clear **notifications**

### For Kids (Wallet View)

- Personal **wallet** of reward cards, grouped by template/status
- **Task tab** showing active bounties:
  - Accept / reject offered tasks
  - Mark tasks as completed
- **History tab** of approved/denied rewards & verified tasks
- In-app **notifications** for:
  - New rewards assigned
  - New tasks assigned
  - Tasks verified / rewards granted
- Live updates via **Server-Sent Events (SSE)** whenever parents act

---

## Tech Stack

### Backend (`bribebank-api`)

- **Node.js** + **TypeScript**
- **Express**
- **Prisma** ORM
- **PostgreSQL**
- **JWT** authentication
- **Server-Sent Events (SSE)** for real-time updates
- Centralised `prisma` client (`src/lib/prisma.ts`)
- History & Notification services: `src/services/historyService.ts`, `notificationService.ts`

### Frontend (`bribebank-frontend`)

- **React** + **TypeScript**
- **Vite**
- Tailwind-style utility classes
- `lucide-react` icons
- Core components:
  - `AdminView` (parent dashboard)
  - `WalletView` (child wallet/tasks)
  - `PrizeCard`
- `storageService.ts` as a single client for all API calls

### Deployment

- Root-level `docker-compose.yml`:
  - API container (bribebank-api)
  - Frontend container (bribebank-frontend)
  - Postgres DB
- Designed to work behind your own reverse proxy (e.g. `api.bribebank.yourdomain.com`, `bribebank.yourdomain.com`).

---

## Project Structure

```text
BribeBank/
├── bribebank-api/          # Backend API (Express + Prisma)
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/     # Tracked Prisma migrations
│   ├── src/
│   │   ├── controllers/    # auth, rewards, bounties, users, etc.
│   │   ├── routes/         # /auth, /families, /rewards, /bounties, /history, /notifications, /events
│   │   ├── services/       # historyService, notificationService, SSE broadcaster
│   │   ├── realtime/       # SSE wiring
│   │   ├── lib/            # prisma client, helpers
│   │   └── types/          # shared backend types (e.g. sseEvents)
│   └── package.json
│
├── bribebank-frontend/     # React frontend
│   ├── components/         # AdminView, WalletView, PrizeCard, LoginView, etc.
│   ├── services/           # storageService.ts
│   ├── types.ts            # base frontend types
│   ├── types/              # additional shared types (e.g. SSE event types)
│   ├── config.ts           # API base URL config
│   ├── App.tsx / index.tsx
│   └── package.json
│
├── docker-compose.yml      # Multi-container setup
├── reset-db.sh             # Dev DB reset helper
└── README.md
```

---

## Running Locally (Dev)
### Backend (bribebank-api)
`cd bribebank-api`

create `.env` file with your favorite editor


**.env should define something like:**

```text
DATABASE_URL=postgresql://bribebank:password@localhost:5432/bribebank?schema=public
JWT_SECRET=change-me
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

Then:

```text
npm install
npx prisma migrate dev
npm run dev`    # or npm run start
```

API will typically be on http://localhost:3001.

### Frontend (bribebank-frontend)
`cd bribebank-frontend`

`npm install`


**config.ts should point to the API:**
```text
export const API_BASE =
  import.meta.env.VITE_API_BASE || "http://localhost:3001";

```
(Optional) set VITE_API_BASE in .env:

`VITE_API_BASE=http://localhost:3001`


Then:

`npm run dev`


Frontend will run on http://localhost:5173.

### Running with Docker

From the repo root:

`docker compose build`

`docker compose up -d`


## Roadmap Ideas

- Scheduled / recurring bounties

- In-app currency system and store for purchasing kid's wanted items

- Expiry for tasks

- Exportable history for parents

## License

TBD.
