import "server-only";
import type { LibraryOptions } from "@/components/documents/options";
import { buildTopicTree, flattenTree } from "@/domain/academic/logic";
import { listAssessments, listSubjects, listTopics } from "@/server/repositories/academic";
import { listDocumentTypes } from "@/server/repositories/documents";

export async function loadLibraryOptions(): Promise<LibraryOptions> {
  const [subjects, topics, assessments, types] = await Promise.all([
    listSubjects(),
    listTopics(),
    listAssessments(),
    listDocumentTypes(),
  ]);
  const active = subjects.filter((s) => !s.archived);
  return {
    subjects: active.map((s) => ({ id: s.id, label: s.code ? `${s.code} · ${s.name}` : s.name, color: s.color })),
    topics: active.flatMap((s) =>
      flattenTree(buildTopicTree(topics.filter((t) => t.subjectId === s.id))).map((t) => ({
        id: t.id,
        subjectId: s.id,
        name: t.name,
        depth: t.depth,
      })),
    ),
    assessments: assessments.map((a) => ({ id: a.id, subjectId: a.subjectId, name: a.name })),
    types,
  };
}
