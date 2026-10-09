"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { firstError } from "@/domain/academic/schemas";
import {
  documentMetadataInput,
  newDocumentInput,
  readDocumentForm,
  type DocumentMetadataInput,
} from "@/domain/documents/schemas";
import { buildStoragePath } from "@/domain/documents/types";
import { detectFormat } from "@/documents/format";
import { failure, success, type ActionState } from "@/lib/action-state";
import { getCurrentUser } from "@/server/auth";
import { listAssessments, listTopics } from "@/server/repositories/academic";
import * as repo from "@/server/repositories/documents";

/*
 * El archivo no pasa por el servidor (límite de 4,5 MB de Vercel): aquí solo
 * se valida y se crea la fila; el navegador sube el archivo directamente a
 * Supabase Storage con la sesión del usuario y después guarda el texto.
 */

export type PrepareUploadResult =
  | { ok: true; documentId: string; storagePath: string; extract: boolean }
  | { ok: false; error: string; duplicateOf?: { id: string; title: string } };

/** Descarta temas o evaluaciones que no sean de la asignatura elegida. */
async function keepOwnLinks<T extends DocumentMetadataInput>(input: T): Promise<T> {
  const [topics, assessments] = await Promise.all([listTopics(input.subjectId), listAssessments(input.subjectId)]);
  const topicIds = new Set(topics.map((t) => t.id));
  const assessmentIds = new Set(assessments.map((a) => a.id));
  return {
    ...input,
    topicIds: input.topicIds.filter((id) => topicIds.has(id)),
    assessmentIds: input.assessmentIds.filter((id) => assessmentIds.has(id)),
  };
}

export async function prepareUploadAction(raw: unknown): Promise<PrepareUploadResult> {
  const user = await getCurrentUser();
  const parsed = newDocumentInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const format = detectFormat(parsed.data.originalFilename, parsed.data.mimeType);
  if (format === "unsupported") {
    return { ok: false, error: "Formato no admitido. Usa PDF, DOCX, PPTX, TXT, Markdown o imágenes." };
  }
  try {
    const duplicate = await repo.findDocumentBySha(parsed.data.sha256);
    if (duplicate) return { ok: false, error: `Ya tienes este archivo: «${duplicate.title}».`, duplicateOf: duplicate };
    const input = await keepOwnLinks(parsed.data);
    const documentId = crypto.randomUUID();
    const storagePath = buildStoragePath(user.id, documentId, input.originalFilename);
    const extract = format !== "image";
    await repo.createDocument(documentId, input, storagePath, extract ? "pending" : "not_applicable");
    return { ok: true, documentId, storagePath, extract };
  } catch (error) {
    console.error(error);
    return { ok: false, error: "No se ha podido registrar el documento. Inténtalo de nuevo." };
  }
}

/** Si la subida a Storage falla, se borra la fila para no dejar documentos sin archivo. */
export async function abortUploadAction(documentId: string): Promise<void> {
  await getCurrentUser();
  await repo.deleteDocument(z.uuid().parse(documentId));
}

/** Tras subir y leer documentos desde el navegador, refresca las páginas afectadas. */
export async function revalidateLibraryAction(): Promise<void> {
  await getCurrentUser();
  revalidatePath("/biblioteca", "layout");
  revalidatePath("/asignaturas", "layout");
}

export async function updateDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await getCurrentUser();
  const id = z.uuid().safeParse(formData.get("id"));
  const parsed = documentMetadataInput.safeParse(readDocumentForm(formData));
  if (!id.success) return failure("Documento no válido.");
  if (!parsed.success) return failure(firstError(parsed.error));
  try {
    await repo.updateDocument(id.data, await keepOwnLinks(parsed.data));
  } catch (error) {
    console.error(error);
    return failure("No se ha podido guardar. Inténtalo de nuevo.");
  }
  revalidatePath("/biblioteca", "layout");
  return success();
}

export async function deleteDocumentAction(formData: FormData): Promise<void> {
  await getCurrentUser();
  await repo.deleteDocument(z.uuid().parse(formData.get("id")));
  revalidatePath("/biblioteca", "layout");
  revalidatePath("/asignaturas", "layout");
  redirect("/biblioteca");
}
