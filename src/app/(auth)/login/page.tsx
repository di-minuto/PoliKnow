import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold">Estudio</h1>
        <p className="mb-8 mt-1 text-muted">Tu sistema de preparación de exámenes.</p>
        {error === "confirm" && (
          <p role="alert" className="mb-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            El enlace de confirmación no es válido o ha caducado.
          </p>
        )}
        <LoginForm next={typeof next === "string" ? next : undefined} />
      </div>
    </main>
  );
}
