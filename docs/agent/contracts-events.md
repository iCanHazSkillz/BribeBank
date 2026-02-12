# Event Contracts (SSE)

Canonical source: `bribebank-api/src/types/sseEvents.ts`
Frontend mirror: `bribebank-frontend/types/sseEvents.ts`

## Transport
- Endpoint: `GET /events?token=<jwt>`
- Content type: `text/event-stream`
- Scope: family-scoped fanout from backend event bus
- Initial handshake payload: `{"type":"CONNECTED"}`

## Event matrix

### `CONNECTED`
- Purpose: confirms SSE stream attachment.
- Payload shape (current runtime): `{ "type": "CONNECTED" }`
- Note: backend type definition includes optional message/timestamp fields in union variants; runtime currently sends type-only payload at connect.

### `CHILD_ACTION`
- Trigger examples: reward claimed, task completed.
- Required fields:
  - `type`: `CHILD_ACTION`
  - `subtype`: `REWARD_CLAIMED | TASK_COMPLETED`
  - `id`: assignment id
  - `userId`: child id
  - `timestamp`: epoch millis

### `TEMPLATE_UPDATE`
- Trigger examples: reward/bounty template create/update/delete.
- Required fields:
  - `type`: `TEMPLATE_UPDATE`
  - `familyId`
  - `target`: `REWARD_TEMPLATE | BOUNTY_TEMPLATE`
  - `action`: `CREATED | UPDATED | DELETED`
  - `timestamp`

### `WALLET_UPDATE`
- Trigger examples: assignment lifecycle changes, ticket effects, wheel updates.
- Required fields:
  - `type`: `WALLET_UPDATE`
  - `familyId`
  - `reason`: union-backed reason code
  - `timestamp`
- Important drift warning:
  - Backend includes reasons such as `TASK_DENIED` and `CONVERSION_RATE_UPDATED`.
  - Frontend union currently omits at least those two values.
  - Keep both unions synchronized when editing reasons.

### `TICKETS_GIVEN`
- Trigger: parent grants tickets.
- Required fields:
  - `type`: `TICKETS_GIVEN`
  - `familyId`
  - `userId`
  - `amount`
  - `newBalance`
  - `timestamp`

### `STORE_ITEM_ADDED | STORE_ITEM_UPDATED | STORE_ITEM_DELETED`
- Trigger: store item CRUD.
- Required fields:
  - `type`
  - `familyId`
  - `itemId`
  - `timestamp`

### `STORE_PURCHASE`
- Trigger: child purchases item.
- Required fields:
  - `type`: `STORE_PURCHASE`
  - `familyId`
  - `userId`
  - `itemId`
  - `assignmentId`
  - `newBalance`
  - `timestamp`

## Example payloads

```json
{ "type": "CONNECTED" }
```

```json
{
  "type": "WALLET_UPDATE",
  "familyId": "fam_123",
  "reason": "TASK_VERIFIED",
  "timestamp": 1760000000000
}
```

```json
{
  "type": "STORE_PURCHASE",
  "familyId": "fam_123",
  "userId": "usr_456",
  "itemId": "item_789",
  "assignmentId": "assign_abc",
  "newBalance": 17,
  "timestamp": 1760000001111
}
```

## Change checklist for SSE
1. Update backend union in `bribebank-api/src/types/sseEvents.ts`.
2. Update frontend union in `bribebank-frontend/types/sseEvents.ts`.
3. Update emitters in controllers/services.
4. Update frontend consumers/switch handlers.
5. Update this document with any payload or reason changes.
