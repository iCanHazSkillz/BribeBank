import type { Response } from "express";
import { randomUUID } from "crypto";

type SseClient = {
  id: string;
  familyId: string;
  res: Response;
};

const clients = new Map<string, SseClient>();

export function addClient(familyId: string, res: Response): string {
  const id = randomUUID();
  clients.set(id, { id, familyId, res });
  return id;
}

export function removeClient(id: string) {
  const client = clients.get(id);
  if (!client) return;
  try {
    client.res.end();
  } catch {
    // ignore
  }
  clients.delete(id);
}

export function broadcastToFamily(
  familyId: string,
  payload: unknown
): void {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const c of clients.values()) {
    if (c.familyId !== familyId) continue;
    try {
      c.res.write(data);
    } catch {
      // if write fails, drop the client
      clients.delete(c.id);
    }
  }
}
