import type { AssessmentTopic, Topic } from "./types";

export type TopicNode = Topic & { children: TopicNode[]; depth: number };

/**
 * Árbol de temas ordenado por posición (los subtemas cuelgan de su padre).
 * Un tema cuyo padre no existe se trata como raíz.
 */
export function buildTopicTree(topics: readonly Topic[]): TopicNode[] {
  const byPosition = (a: Topic, b: Topic) => a.position - b.position || a.name.localeCompare(b.name, "es");
  const ids = new Set(topics.map((t) => t.id));
  const children = new Map<string | null, Topic[]>();
  for (const t of topics) {
    const parent = t.parentId && ids.has(t.parentId) ? t.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), t]);
  }
  const build = (parent: string | null, depth: number, seen: Set<string>): TopicNode[] =>
    (children.get(parent) ?? [])
      .slice()
      .sort(byPosition)
      .filter((t) => !seen.has(t.id))
      .map((t) => {
        const next = new Set(seen).add(t.id);
        return { ...t, depth, children: build(t.id, depth + 1, next) };
      });
  return build(null, 0, new Set());
}

/** Recorrido en orden del árbol: útil para listas con sangría. */
export function flattenTree(nodes: readonly TopicNode[]): TopicNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children)]);
}

/** Ids de un tema y todos sus descendientes (no puede ser su propio padre). */
export function descendantIds(topics: readonly Topic[], topicId: string): Set<string> {
  const result = new Set<string>([topicId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of topics) {
      if (t.parentId && result.has(t.parentId) && !result.has(t.id)) {
        result.add(t.id);
        changed = true;
      }
    }
  }
  return result;
}

/**
 * Mueve un elemento una posición arriba o abajo entre sus hermanos.
 * Devuelve las nuevas posiciones (0..n-1) de los elementos que cambian.
 */
export function moveSibling<T extends { id: string; position: number }>(
  siblings: readonly T[],
  id: string,
  direction: "up" | "down",
): { id: string; position: number }[] {
  const ordered = siblings.slice().sort((a, b) => a.position - b.position);
  const index = ordered.findIndex((s) => s.id === id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= ordered.length) return [];
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  return ordered
    .map((s, position) => ({ id: s.id, position, changed: s.position !== position }))
    .filter((s) => s.changed)
    .map(({ id: itemId, position }) => ({ id: itemId, position }));
}

/** Peso relativo (0..1) de cada tema dentro de una evaluación. */
export function topicShares(entries: readonly AssessmentTopic[]): Map<string, number> {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  return new Map(
    entries.map((e) => [e.topicId, total > 0 ? e.weight / total : entries.length ? 1 / entries.length : 0]),
  );
}

/** Siguiente posición libre al añadir un elemento al final. */
export function nextPosition(items: readonly { position: number }[]): number {
  return items.reduce((max, i) => Math.max(max, i.position + 1), 0);
}
