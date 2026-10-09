import type { Metadata } from "next";
import Link from "next/link";
import { UploadForm } from "@/components/documents/upload-form";
import { loadLibraryOptions } from "@/server/library-options";

export const metadata: Metadata = { title: "Subir documentos" };

export default async function UploadPage({ searchParams }: PageProps<"/biblioteca/subir">) {
  const { asignatura } = await searchParams;
  const options = await loadLibraryOptions();
  const defaultSubjectId =
    typeof asignatura === "string" && options.subjects.some((s) => s.id === asignatura) ? asignatura : undefined;

  return (
    <>
      <header className="mb-6">
        <Link href="/biblioteca" className="text-sm text-muted hover:underline">
          ← Biblioteca
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Subir documentos</h1>
        <p className="mt-1 text-muted">El texto se lee en tu dispositivo y queda guardado para buscarlo.</p>
      </header>
      <UploadForm options={options} defaultSubjectId={defaultSubjectId} />
    </>
  );
}
