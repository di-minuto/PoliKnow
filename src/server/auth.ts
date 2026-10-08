import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string | null;
};

/**
 * Usuario autenticado de la petición actual (Data Access Layer).
 * Verifica el JWT con getClaims y redirige al login si no hay sesión.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) {
    redirect("/login");
  }
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
});
