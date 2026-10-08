import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");
const migrationsDir = join(root, "supabase", "migrations");

const USER_A = "00000000-0000-0000-0000-00000000000a";
const USER_B = "00000000-0000-0000-0000-00000000000b";

let db: PGlite;

/** Ejecuta `fn` como usuario autenticado (rol + claim), igual que Supabase. */
async function asUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}';`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; reset request.jwt.claim.sub;`);
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(join(__dirname, "supabase-stub.sql"), "utf8"));
  for (const file of readdirSync(migrationsDir).sort()) {
    await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  }
  // Supabase concede estos permisos por defecto al rol authenticated.
  await db.exec(`
    grant usage on schema public to authenticated;
    grant all on all tables in schema public to authenticated;
  `);
  await db.exec(`
    insert into auth.users (id, email) values
      ('${USER_A}', 'a@example.com'), ('${USER_B}', 'b@example.com');
  `);
}, 60_000);

async function createSubject(userId: string) {
  return asUser(userId, async () => {
    const course = await db.query<{ id: string }>(
      `insert into courses (name, academic_year) values ('Curso', '2026-27') returning id`,
    );
    const subject = await db.query<{ id: string }>(
      `insert into subjects (course_id, name) values ($1, 'CPA') returning id`,
      [course.rows[0].id],
    );
    return subject.rows[0].id;
  });
}

describe("migraciones", () => {
  it("crea un perfil al registrarse un usuario", async () => {
    const res = await db.query<{ display_name: string }>(
      `select display_name from profiles where id = $1`,
      [USER_A],
    );
    expect(res.rows[0]?.display_name).toBe("a");
  });

  it("siembra los catálogos de tipos", async () => {
    const docTypes = await db.query(`select code from document_types`);
    const qTypes = await db.query(`select code from question_types`);
    expect(docTypes.rows).toHaveLength(8);
    expect(qTypes.rows).toHaveLength(9);
  });

  it("crea el bucket privado de documentos", async () => {
    const res = await db.query<{ public: boolean }>(
      `select public from storage.buckets where id = 'documents'`,
    );
    expect(res.rows[0]?.public).toBe(false);
  });
});

describe("RLS", () => {
  it("cada usuario solo ve sus propios datos", async () => {
    await createSubject(USER_A);
    const seenByB = await asUser(USER_B, () => db.query(`select * from subjects`));
    const seenByA = await asUser(USER_A, () => db.query(`select * from subjects`));
    expect(seenByB.rows).toHaveLength(0);
    expect(seenByA.rows.length).toBeGreaterThan(0);
  });

  it("no permite insertar filas a nombre de otro usuario", async () => {
    await expect(
      asUser(USER_B, () =>
        db.query(`insert into courses (user_id, name) values ($1, 'x')`, [USER_A]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("los catálogos del sistema son visibles pero no modificables", async () => {
    const rows = await asUser(USER_A, () => db.query(`select code from question_types`));
    expect(rows.rows.length).toBe(9);
    const updated = await asUser(USER_A, () =>
      db.query(`update question_types set label = 'x' where code = 'true_false'`),
    );
    expect(updated.affectedRows).toBe(0);
  });

  it("permite añadir tipos propios", async () => {
    await asUser(USER_A, () =>
      db.query(`insert into document_types (code, label, user_id) values ('cheatsheet', 'Chuleta', $1)`, [
        USER_A,
      ]),
    );
    const seenByB = await asUser(USER_B, () =>
      db.query(`select code from document_types where code = 'cheatsheet'`),
    );
    expect(seenByB.rows).toHaveLength(0);
  });
});

describe("integridad de las preguntas", () => {
  it("una pregunta oficial exige examen oficial", async () => {
    const subjectId = await createSubject(USER_A);
    await expect(
      asUser(USER_A, () =>
        db.query(
          `insert into questions (subject_id, question_type, source_type, stem)
           values ($1, 'multiple_choice', 'official_exam', '¿?')`,
          [subjectId],
        ),
      ),
    ).rejects.toThrow(/questions_official_consistency/);
  });

  it("una pregunta de IA no puede asociarse a un examen oficial", async () => {
    const subjectId = await createSubject(USER_A);
    await expect(
      asUser(USER_A, async () => {
        const exam = await db.query<{ id: string }>(
          `insert into official_exams (subject_id, title, year) values ($1, 'Enero 2025', 2025) returning id`,
          [subjectId],
        );
        await db.query(
          `insert into questions (subject_id, question_type, source_type, stem, official_exam_id, ai_model)
           values ($1, 'multiple_choice', 'ai_generated', '¿?', $2, 'modelo')`,
          [subjectId, exam.rows[0].id],
        );
      }),
    ).rejects.toThrow(/questions_official_consistency/);
  });

  it("indexa el enunciado para búsqueda en español", async () => {
    const subjectId = await createSubject(USER_A);
    const found = await asUser(USER_A, async () => {
      await db.query(
        `insert into questions (subject_id, question_type, source_type, stem)
         values ($1, 'theory', 'manual', 'Explica la cláusula reduction de OpenMP')`,
        [subjectId],
      );
      return db.query(
        `select stem from questions where tsv @@ websearch_to_tsquery('spanish', 'openmp reduction')`,
      );
    });
    expect(found.rows).toHaveLength(1);
  });
});
