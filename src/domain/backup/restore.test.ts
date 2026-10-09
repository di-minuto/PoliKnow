import { describe, expect, it } from "vitest";
import { BACKUP_FORMAT, BACKUP_VERSION, backupSchema, countRows, stripRow, zipFilePath, type Backup, type Row } from "./format";
import { planRestore, remapJson, type RestoreContext } from "./restore";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const USER = id(999);

function backup(tables: Record<string, Row[]>, extra: Partial<Backup> = {}): Backup {
  return backupSchema.parse({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: "2026-10-09T10:00:00Z", tables, ...extra });
}

function context(over: Partial<RestoreContext> = {}): RestoreContext {
  let n = 500;
  return { userId: USER, existingDocuments: new Map(), filesAvailable: new Set(), newId: () => id(n++), ...over };
}

const rowsOf = (plan: ReturnType<typeof planRestore>, table: string) => plan.inserts.find((i) => i.table === table)?.rows ?? [];

const base = {
  courses: [{ id: id(1), name: "3º", user_id: "otro", created_at: "2026-01-01" }],
  subjects: [{ id: id(2), course_id: id(1), code: "CPA", name: "Concurrencia" }],
};

describe("formato", () => {
  it("rechaza archivos que no son copias o de versiones futuras", () => {
    expect(backupSchema.safeParse({ format: "otro", version: 1, exportedAt: "", tables: {} }).success).toBe(false);
    expect(backupSchema.safeParse({ format: BACKUP_FORMAT, version: BACKUP_VERSION + 1, exportedAt: "", tables: {} }).success).toBe(false);
  });

  it("quita el dueño y las columnas calculadas", () => {
    expect(stripRow({ id: "a", user_id: "u", tsv: "x", name: "n" })).toEqual({ id: "a", name: "n" });
  });

  it("cuenta filas y nombra los archivos del ZIP", () => {
    expect(countRows({ a: [1, 2], b: [] })).toEqual({ a: 2, b: 0 });
    expect(zipFilePath("d1", "tema 1.pdf")).toBe("files/d1/tema 1.pdf");
  });
});

describe("remapJson", () => {
  it("sustituye ids conocidos a cualquier profundidad y deja el resto", () => {
    const ids = new Map([[id(1), id(101)]]);
    expect(remapJson({ a: [id(1), { b: id(1) }], c: id(2), d: "hola", e: 3 }, ids)).toEqual({
      a: [id(101), { b: id(101) }],
      c: id(2),
      d: "hola",
      e: 3,
    });
  });
});

describe("planRestore", () => {
  it("da ids nuevos y traduce las referencias, sin user_id", () => {
    const plan = planRestore(backup(base), context());
    const [course] = rowsOf(plan, "courses");
    const [subject] = rowsOf(plan, "subjects");
    expect(course.id).not.toBe(id(1));
    expect(course).not.toHaveProperty("user_id");
    expect(subject.course_id).toBe(course.id);
    expect(plan.inserts.map((i) => i.table)).toEqual(["courses", "subjects"]);
  });

  it("inserta los temas padre antes que los subtemas", () => {
    const plan = planRestore(
      backup({
        ...base,
        topics: [
          { id: id(4), subject_id: id(2), parent_id: id(3), name: "Hijo" },
          { id: id(3), subject_id: id(2), parent_id: null, name: "Padre" },
        ],
      }),
      context(),
    );
    const [parent, child] = rowsOf(plan, "topics");
    expect(parent.name).toBe("Padre");
    expect(child.parent_id).toBe(parent.id);
  });

  it("pone después las referencias a la misma tabla (variantes)", () => {
    const plan = planRestore(
      backup({
        ...base,
        questions: [
          { id: id(10), subject_id: id(2), variant_of: null, content: {} },
          { id: id(11), subject_id: id(2), variant_of: id(10), content: { ver: id(10) } },
        ],
      }),
      context(),
    );
    const [original, variant] = rowsOf(plan, "questions");
    expect(variant.variant_of).toBeNull();
    expect(variant.content).toEqual({ ver: original.id });
    expect(plan.updates).toEqual([{ table: "questions", id: variant.id, patch: { variant_of: original.id } }]);
  });

  it("reutiliza un documento que ya está en la cuenta (misma huella) sin copiar su texto", () => {
    const tables = {
      ...base,
      documents: [{ id: id(20), subject_id: id(2), sha256: "abc", storage_path: "u/d/a.pdf", original_filename: "a.pdf" }],
      document_chunks: [{ id: id(21), document_id: id(20), chunk_index: 0, content: "x" }],
      questions: [{ id: id(22), subject_id: id(2), document_id: id(20) }],
    };
    const plan = planRestore(backup(tables), context({ existingDocuments: new Map([["abc", id(300)]]), filesAvailable: new Set([id(20)]) }));
    expect(rowsOf(plan, "documents")).toEqual([]);
    expect(rowsOf(plan, "document_chunks")).toEqual([]);
    expect(rowsOf(plan, "questions")[0].document_id).toBe(id(300));
    expect(plan.uploads).toEqual([]);
    expect(plan.skipped.reusedDocuments).toBe(1);
  });

  it("sube los documentos que vienen en el ZIP a una ruta nueva", () => {
    const tables = {
      ...base,
      documents: [{ id: id(20), subject_id: id(2), sha256: "abc", storage_path: "viejo/x/a.pdf", original_filename: "a.pdf", mime_type: "application/pdf" }],
    };
    const plan = planRestore(backup(tables), context({ filesAvailable: new Set([id(20)]) }));
    const [doc] = rowsOf(plan, "documents");
    expect(doc.storage_path).toBe(`${USER}/${doc.id}/a.pdf`);
    expect(plan.uploads).toEqual([{ from: id(20), documentId: doc.id, storagePath: doc.storage_path, mimeType: "application/pdf" }]);
  });

  it("sin archivo, salta el documento y deja vacías las referencias opcionales", () => {
    const tables = {
      ...base,
      documents: [{ id: id(20), subject_id: id(2), sha256: "abc", storage_path: "u/d/a.pdf" }],
      document_chunks: [{ id: id(21), document_id: id(20), chunk_index: 0, content: "x" }],
      questions: [{ id: id(22), subject_id: id(2), document_id: id(20) }],
    };
    const plan = planRestore(backup(tables), context());
    expect(rowsOf(plan, "documents")).toEqual([]);
    expect(rowsOf(plan, "document_chunks")).toEqual([]);
    expect(rowsOf(plan, "questions")[0].document_id).toBeNull();
    expect(plan.skipped).toMatchObject({ documentsWithoutFile: 1, orphanRows: 1 });
  });

  it("descarta las filas cuya referencia obligatoria no existe", () => {
    const plan = planRestore(backup({ ...base, topics: [{ id: id(5), subject_id: id(77), name: "Huérfano" }] }), context());
    expect(rowsOf(plan, "topics")).toEqual([]);
    expect(plan.skipped.orphanRows).toBe(1);
  });

  it("no pisa la disponibilidad ni los días bloqueados que ya tengas", () => {
    const plan = planRestore(
      backup({ availability_rules: [{ id: id(30), weekday: 1, minutes: 120 }], blocked_days: [{ id: id(31), day: "2026-12-25" }] }),
      context(),
    );
    expect(plan.inserts).toEqual([
      { table: "availability_rules", rows: [{ weekday: 1, minutes: 120 }], onConflict: "user_id,weekday" },
      { table: "blocked_days", rows: [{ day: "2026-12-25" }], onConflict: "user_id,day" },
    ]);
  });

  it("copia el perfil y los tipos propios con el nuevo dueño", () => {
    const plan = planRestore(
      backup({}, {
        profile: { id: "viejo", display_name: "Luis", timezone: "Europe/Madrid", settings: { a: 1 }, created_at: "x" },
        catalogs: { question_types: [{ code: "mio", label: "Mío", user_id: "viejo" }], profiles: [{ id: "x" }] },
      }),
      context(),
    );
    expect(plan.profile).toEqual({ display_name: "Luis", timezone: "Europe/Madrid", settings: { a: 1 } });
    expect(plan.catalogs).toEqual([{ table: "question_types", rows: [{ code: "mio", label: "Mío", user_id: USER }] }]);
  });
});
