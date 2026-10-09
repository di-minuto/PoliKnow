import type { Response } from "@/domain/questions/grading";

/*
 * Respuestas de un simulacro que no se pudieron enviar por falta de red.
 * Se guardan en el dispositivo y se envían al volver la conexión.
 */

export type PendingAnswer = { response: Response | null; timeSpentSeconds: number | null };
type Pending = Record<string, PendingAnswer>;

const key = (attemptId: string) => `examen:${attemptId}`;

export function readPending(attemptId: string): Pending {
  try {
    return JSON.parse(localStorage.getItem(key(attemptId)) ?? "{}") as Pending;
  } catch {
    return {};
  }
}

export function writePending(attemptId: string, pending: Pending) {
  try {
    if (Object.keys(pending).length === 0) localStorage.removeItem(key(attemptId));
    else localStorage.setItem(key(attemptId), JSON.stringify(pending));
  } catch {
    // sin almacenamiento: la respuesta solo vive en memoria
  }
}
