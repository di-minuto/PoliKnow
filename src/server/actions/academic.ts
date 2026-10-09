"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { descendantIds, moveSibling, nextPosition } from "@/domain/academic/logic";
import {
  assessmentInput,
  assessmentTopicsInput,
  courseInput,
  firstError,
  readAssessmentTopicsForm,
  subjectInput,
  topicInput,
} from "@/domain/academic/schemas";
import { failure, success, type ActionState } from "@/lib/action-state";
import { zonedLocalToUtc } from "@/lib/dates";
import { getCurrentUser } from "@/server/auth";
import { getProfile } from "@/server/profile";
import * as repo from "@/server/repositories/academic";

/*
 * Server Actions de la jerarquía académica. Cada una comprueba la sesión,
 * valida la entrada con zod y delega en el repositorio (RLS hace el resto).
 */

const fields = (formData: FormData) => Object.fromEntries(formData.entries());
const idSchema = z.uuid();

function readId(formData: FormData, key = "id"): string {
  return idSchema.parse(formData.get(key));
}

async function guard(run: () => Promise<void>): Promise<ActionState> {
  try {
    await run();
    return success();
  } catch (error) {
    if (error instanceof z.ZodError) return failure(firstError(error));
    console.error(error);
    return failure("No se ha podido guardar. Inténtalo de nuevo.");
  }
}

const revalidateSubjects = () => revalidatePath("/asignaturas", "layout");

// ---------------------------------------------------------------- cursos

export async function createCourseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await getCurrentUser();
  return guard(async () => {
    await repo.createCourse(courseInput.parse(fields(formData)));
    revalidateSubjects();
  });
}

export async function updateCourseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await getCurrentUser();
  return guard(async () => {
    await repo.updateCourse(readId(formData), courseInput.parse(fields(formData)));
    revalidateSubjects();
  });
}

export async function deleteCourseAction(formData: FormData): Promise<void> {
  await getCurrentUser();
  await repo.deleteCourse(readId(formData));
  revalidateSubjects();
}

// ---------------------------------------------------------------- asignaturas

export async function createSubjectAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await getCurrentUser();
  let newId = "";
  const state = await guard(async () => {
    const input = subjectInput.parse(fields(formData));
    const existing = await repo.listSubjects();
    newId = await repo.createSubject(input, nextPosition(existing.filter((s) => s.courseId === input.courseId)));
    revalidateSubjects();
  });
  if (state.ok) redirect(`/asignaturas/${newId}`);
  return state;
}

export async function updateSubjectAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await getCurrentUser();
  return guard(async () => {
    await repo.updateSubject(readId(formData), subjectInput.parse(fields(formData)));
    revalidateSubjects();
  });
}

export async function deleteSubjectAction(formData: FormData): Promise<void> {
  await getCurrentUser();
  await repo.deleteSubject(readId(formData));
  revalidateSubjects();
  redirect("/asignaturas");
}

// ---------------------------------------------------------------- temas

export async function createTopicAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await getCurrentUser();
  return guard(async () => {
    const input = topicInput.parse(fields(formData));
    const siblings = (await repo.listTopics(input.subjectId)).filter((t) => t.parentId === input.parentId);
    await repo.createTopic(input, nextPosition(siblings));
    revalidateSubjects();
  });
}

export async function updateTopicAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await getCurrentUser();
  return guard(async () => {
    const id = readId(formData);
    const input = topicInput.parse(fields(formData));
    const topics = await repo.listTopics(input.subjectId);
    const current = topics.find((t) => t.id === id);
    if (!current) throw new z.ZodError([{ code: "custom", path: ["id"], message: "El tema no existe.", input: id }]);
    if (input.parentId && descendantIds(topics, id).has(input.parentId)) {
      throw new z.ZodError([
        { code: "custom", path: ["parentId"], message: "Un tema no puede estar dentro de sí mismo.", input: id },
      ]);
    }
    // Si cambia de padre, pasa al final de sus nuevos hermanos.
    const position =
      current.parentId === input.parentId
        ? undefined
        : nextPosition(topics.filter((t) => t.parentId === input.parentId && t.id !== id));
    await repo.updateTopic(id, input, position);
    revalidateSubjects();
  });
}

export async function deleteTopicAction(formData: FormData): Promise<void> {
  await getCurrentUser();
  await repo.deleteTopic(readId(formData));
  revalidateSubjects();
}

export async function moveTopicAction(formData: FormData): Promise<void> {
  await getCurrentUser();
  const id = readId(formData);
  const direction = z.enum(["up", "down"]).parse(formData.get("direction"));
  const topic = await repo.getTopic(id);
  if (!topic) return;
  const siblings = (await repo.listTopics(topic.subjectId)).filter((t) => t.parentId === topic.parentId);
  await repo.setPositions("topics", moveSibling(siblings, id, direction));
  revalidateSubjects();
}

// ---------------------------------------------------------------- evaluaciones

async function readAssessment(formData: FormData): Promise<repo.AssessmentValues> {
  const input = assessmentInput.parse(fields(formData));
  const { timezone } = await getProfile();
  const { examAtLocal, ...rest } = input;
  return { ...rest, examAt: examAtLocal ? zonedLocalToUtc(examAtLocal, timezone) : null };
}

export async function createAssessmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await getCurrentUser();
  let newId = "";
  let subjectId = "";
  const state = await guard(async () => {
    const values = await readAssessment(formData);
    subjectId = values.subjectId;
    const existing = await repo.listAssessments(values.subjectId);
    newId = await repo.createAssessment(values, nextPosition(existing));
    revalidateSubjects();
    revalidatePath("/hoy");
  });
  if (state.ok) redirect(`/asignaturas/${subjectId}/evaluaciones/${newId}`);
  return state;
}

export async function updateAssessmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await getCurrentUser();
  return guard(async () => {
    await repo.updateAssessment(readId(formData), await readAssessment(formData));
    revalidateSubjects();
    revalidatePath("/hoy");
  });
}

export async function deleteAssessmentAction(formData: FormData): Promise<void> {
  await getCurrentUser();
  const id = readId(formData);
  const assessment = await repo.getAssessment(id);
  await repo.deleteAssessment(id);
  revalidateSubjects();
  revalidatePath("/hoy");
  redirect(assessment ? `/asignaturas/${assessment.subjectId}` : "/asignaturas");
}

export async function saveAssessmentTopicsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await getCurrentUser();
  return guard(async () => {
    const input = assessmentTopicsInput.parse(readAssessmentTopicsForm(formData));
    await repo.replaceAssessmentTopics(input.assessmentId, input.topics);
    revalidateSubjects();
  });
}
