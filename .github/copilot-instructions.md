# BribeBank - AI Agent Instructions

## Architecture Overview

**BribeBank** is a family rewards system with a **PostgreSQL + Prisma backend** and **React + TypeScript frontend**, deployed via Docker Compose. Parents assign rewards and tasks (bounties) to children. Real-time updates use **Server-Sent Events (SSE)** via `bribebank-api/src/realtime/eventBus.ts`.

### Key Components

- **Backend (bribebank-api)**: Express + Prisma ORM, JWT auth, SSE broadcasting
- **Frontend (bribebank-frontend)**: React + Vite, Tailwind utilities, `storageService.ts` as single API client
- **Database**: PostgreSQL with Prisma migrations in `bribebank-api/prisma/migrations/`

## Project Structure

```
bribebank-api/
├── prisma/schema.prisma       # Database schema - source of truth
├── src/
│   ├── controllers/           # Business logic (authController, bountyController, etc.)
│   ├── routes/                # Express routes (/auth, /families, /rewards, /bounties, /events)
│   ├── services/              # historyService, notificationService
│   ├── realtime/eventBus.ts   # SSE client management & broadcasting
│   └── lib/prisma.ts          # Centralized Prisma client

bribebank-frontend/
├── components/                # AdminView (parents), WalletView (children)
├── services/storageService.ts # ALL backend API calls go through here
├── types.ts                   # Frontend type definitions
└── config.ts                  # API_BASE from VITE_API_URL env var
```

## Critical Patterns

### 1. Database Changes (Prisma Workflow)

**Always** update `prisma/schema.prisma` first, then:

```bash
# Inside Docker container:
docker exec -it bribebank-api npx prisma migrate dev --name descriptive_name

# Or in dev environment:
npx prisma migrate dev --name descriptive_name
npx prisma generate  # Regenerates @prisma/client types
```

**Never** manually edit migrations. Schema is single source of truth.

### 2. Real-Time Updates (SSE)

Controllers broadcast family-scoped events via `broadcastToFamily(familyId, payload)`:

```typescript
// Example from bountyController.ts
import { broadcastToFamily } from "../realtime/eventBus.js";

broadcastToFamily(familyId, {
  type: "BOUNTY_VERIFIED",
  userId: assignment.userId,
  // ... event data
});
```

Clients connect to `/events` endpoint which maintains SSE connections per family.

### 3. Frontend API Calls

**All** backend communication goes through `storageService.ts`. Pattern:

```typescript
// storageService.ts
methodName: async (params): Promise<ReturnType> => {
  const token = getAuthToken();
  if (!token) throw new Error("Not authenticated");
  
  const res = await fetch(apiUrl(`/endpoint`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    console.error("Operation failed", res.status, body);
    throw new Error(body?.error || "Operation failed");
  }

  return await res.json();
}
```

**Never** call `fetch()` directly from components - always add methods to `storageService`.

### 4. Type Alignment

Frontend `types.ts` mirrors Prisma enums but uses different conventions:

- **Prisma**: `PascalCase` enums (e.g., `PARENT`, `CHILD`)
- **Frontend**: TypeScript enums (e.g., `UserRole.ADMIN`, `UserRole.USER`)
- **Mapping happens in storageService**: Backend `role === "PARENT"` → Frontend `UserRole.ADMIN`

When adding Prisma models, update both `schema.prisma` AND `bribebank-frontend/types.ts`.

### 5. Authentication & Authorization

- JWT tokens stored in localStorage as `bribebank_token`
- Middleware in `src/middleware/authMiddleware.ts` validates tokens
- Controllers access authenticated user via `req.user` (populated by middleware)
- Role checks: `if (req.user.role !== 'PARENT')` for admin-only operations

## Development Workflows

### Running Locally

**Backend:**
```bash
cd bribebank-api
npm install
npx prisma migrate dev  # Apply migrations
npm run dev             # tsx watch mode on :3001
```

**Frontend:**
```bash
cd bribebank-frontend
npm install
npm run dev             # Vite dev server on :5173
```

**Environment vars:**
- Backend `.env`: `DATABASE_URL`, `JWT_SECRET`, `PORT`, `CORS_ORIGIN`
- Frontend uses `VITE_API_URL` (e.g., `http://localhost:3001`)

### Docker Development

```bash
# From repo root
docker compose up -d

# Run migrations inside container
docker exec -it bribebank-api npx prisma migrate dev

# View logs
docker logs -f bribebank-api
docker logs -f bribebank-frontend
```

### Adding New Features

**Example: Adding StoreItem support**

1. **Update Prisma schema** (`schema.prisma`):
   ```prisma
   model StoreItem {
     id       String @id @default(cuid())
     familyId String
     family   Family @relation(fields: [familyId], references: [id])
     title    String
     cost     Int
     // ...
   }
   ```

2. **Run migration**:
   ```bash
   docker exec -it bribebank-api npx prisma migrate dev --name add_store_items
   ```

3. **Add controller** (`src/controllers/storeController.ts`)

4. **Add routes** (`src/routes/storeItems.ts`)

5. **Update frontend types** (`bribebank-frontend/types.ts`)

6. **Add storageService methods** (`services/storageService.ts`)

7. **Broadcast SSE events** if real-time updates needed

## Common Issues

### "Cannot find module '@prisma/client'"
Run `npx prisma generate` after any schema changes or fresh npm install.

### SSE Connections Not Working
- Check CORS settings in `bribebank-api/src/server.ts`
- Verify `/events` route is registered
- Ensure `broadcastToFamily()` is called with correct `familyId`

### Type Mismatches Between Frontend/Backend
- Check enum mapping in `storageService.ts` (e.g., `PARENT` → `UserRole.ADMIN`)
- Verify Prisma schema matches frontend `types.ts` interfaces

### Docker Container Issues
```bash
# Rebuild after package.json changes
docker compose build --no-cache

# Check container health
docker ps
docker exec -it bribebank-api node --version
```

## Code Style

- **Backend**: ES Modules (`import`/`export`), `.js` extensions in imports
- **Frontend**: React functional components, TypeScript strict mode
- **API responses**: Always include error messages in catch blocks
- **Logging**: Use `console.error()` for errors, include context (status codes, bodies)

## Testing Strategy

Currently manual testing via UI. When adding tests:
- Backend: Jest with Prisma mock client
- Frontend: Vitest + React Testing Library
- E2E: Consider Playwright for critical flows (login → assign reward → approve)

---

**Key Files to Reference:**
- `bribebank-api/prisma/schema.prisma` - Database schema
- `bribebank-api/src/realtime/eventBus.ts` - SSE implementation
- `bribebank-frontend/services/storageService.ts` - API client
- `bribebank-frontend/types.ts` - Frontend type definitions
