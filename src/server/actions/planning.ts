"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { availabilityInput, blockedDayInput, firstError } from "@/domain/academic/schemas";
import { failure, success, type ActionState } from "@/lib/action-state";
import { getCurrentUser } from "@/server/auth";
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
