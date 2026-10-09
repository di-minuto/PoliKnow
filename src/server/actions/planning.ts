"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { availabilityInput, blockedDayInput, firstError, optionalText } from "@/domain/academic/schemas";
import { applySession, COMPLETION, EMPTY_TOPIC_STATE, statusFor } from "@/domain/scheduler/session";
import { toLocalDayKey } from "@/lib/dates";
import { failure, success, type ActionState } from "@/lib/action-state";
import { getCurrentUser } from "@/server/auth";
import { estimatedTopicMinutes, replan } from "@/server/planner";
import { getProfile } from "@/server/profile";
import * as repo from "@/server/repositories/planning";

export async function saveAvailabilityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const parsed = availabilityInput.safeParse({
    hoursByWeekday: Array.from({ length: 7 }, (_, d) => formData.get(`weekday:${d}`)),
  });
  if (!parsed.success) return failure(firstError(parsed.error));
  try {
    await repo.saveWeeklyAvailability(
      user.id,
      parsed.data.hoursByWeekday.map((h) => Math.round(h * 60)),
    );
  } catch (error) {
    console.error(error);
    return failure("No se ha podido guardar la disponibilidad.");
  }
  revalidatePath("/ajustes");
  return success();
}

export async function addBlockedDayAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const parsed = blockedDayInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return failure(firstError(parsed.error));
  try {
    await repo.addBlockedDay(user.id, parsed.data.day, parsed.data.reason);
  } catch (error) {
    console.error(error);
    return failure("No se ha podido añadir el día.");
  }
  revalidatePath("/ajustes");
  return success();
}

export async function removeBlockedDayAction(formData: FormData): Promise<void> {
  await getCurrentUser();
  await repo.removeBlockedDay(z.uuid().parse(formData.get("id")));
  revalidatePath("/ajustes");
}

// ---------------------------------------------------------------- plan y sesiones

const sessionInput = z.object({
  taskId: z.uuid(),
  completion: z.enum(COMPLETION, { error: "Di si lo has completado." }),
  difficulty: z.coerce.number({ error: "Elige la dificultad." }).int().min(1, "Elige la dificultad.").max(5),
  notUnderstood: z.boolean(),
  notes: optionalText(2000),
  durationSeconds: z.coerce.number().int().min(0).max(86400).default(0),
});

/** Al cerrar una sesión: se guarda, se actualiza el tema y se recalcula el plan. */
export async function closeSessionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const parsed = sessionInput.safeParse({
    taskId: formData.get("taskId"),
    completion: formData.get("completion") ?? undefined,
    difficulty: formData.get("difficulty") ?? undefined,
    notUnderstood: formData.get("notUnderstood") === "on",
    notes: formData.get("notes"),
    durationSeconds: formData.get("durationSeconds") || 0,
  });
  if (!parsed.success) return failure(firstError(parsed.error));
  const input = parsed.data;
  try {
    const task = await repo.getTask(input.taskId);
    if (!task) return failure("Esta tarea ya no está en el plan.");
    await repo.recordSession({
      planTaskId: task.id,
      subjectId: task.subjectId,
      topicId: task.topicId,
      durationSeconds: input.durationSeconds,
      completed: input.completion === "yes",
      perceivedDifficulty: input.difficulty,
      notUnderstood: input.notUnderstood,
      notes: input.notes,
    });
    await repo.setTaskStatus(task.id, statusFor(input.completion));

    if (task.topicId) {
      const profile = await getProfile();
      const today = toLocalDayKey(new Date(), profile.timezone);
      const record = (await repo.listTopicProgress()).find((p) => p.topicId === task.topicId);
      const toDay = (iso: string | null) => (iso ? toLocalDayKey(new Date(iso), profile.timezone) : null);
      const before = record
        ? { ...record, lastStudiedDay: toDay(record.lastStudiedAt), nextReviewDay: toDay(record.nextReviewAt) }
        : EMPTY_TOPIC_STATE;
      const after = applySession(
        before,
        {
          taskType: task.type,
          plannedMinutes: task.minutes,
          measuredMinutes: Math.round(input.durationSeconds / 60),
          completion: input.completion,
          difficulty: input.difficulty,
          notUnderstood: input.notUnderstood,
        },
        await estimatedTopicMinutes(task.topicId),
        today,
      );
      await repo.saveStudyProgress(user.id, task.topicId, {
        coverage: after.coverage,
        lastStudiedAt: after.lastStudiedDay === before.lastStudiedDay ? (record?.lastStudiedAt ?? null) : new Date().toISOString(),
        // Al mediodía UTC: cae en el mismo día en cualquier zona de Europa.
        nextReviewAt:
          after.nextReviewDay === before.nextReviewDay ? (record?.nextReviewAt ?? null) : after.nextReviewDay ? `${after.nextReviewDay}T12:00:00Z` : null,
        notUnderstoodCount: after.notUnderstoodCount,
        priorityAdjustment: after.priorityAdjustment,
      });
    }
    await replan();
  } catch (error) {
    console.error(error);
    return failure("No se ha podido guardar la sesión. Inténtalo de nuevo.");
  }
  revalidatePath("/", "layout");
  redirect("/hoy?sesion=hecha");
}

/** Marca la tarea como empezada (al pulsar el cronómetro). */
export async function markTaskStartedAction(taskId: string): Promise<void> {
  await getCurrentUser();
  const task = await repo.getTask(z.uuid().parse(taskId));
  if (task && task.status === "pending") await repo.setTaskStatus(task.id, "in_progress");
}

/** Saltar una tarea: su trabajo se reparte en los días siguientes. */
export async function skipTaskAction(formData: FormData): Promise<void> {
  await getCurrentUser();
  await repo.setTaskStatus(z.uuid().parse(formData.get("id")), "skipped");
  await replan();
  revalidatePath("/", "layout");
  redirect(formData.get("back") === "/plan" ? "/plan" : "/hoy");
}

export async function replanAction(): Promise<void> {
  await getCurrentUser();
  await replan();
  revalidatePath("/", "layout");
}
