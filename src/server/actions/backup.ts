"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth";

/** Tras importar una copia cambia casi todo: se refrescan todas las páginas. */
export async function revalidateAfterImportAction(): Promise<void> {
  await getCurrentUser();
  revalidatePath("/", "layout");
}
