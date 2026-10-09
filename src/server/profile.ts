import "server-only";
import { cache } from "react";
import { DEFAULT_TIMEZONE } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./auth";

export type Profile = {
  id: string;
  displayName: string | null;
  timezone: string;
};

export const getProfile = cache(async (): Promise<Profile> => {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, timezone")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar el perfil: ${error.message}`);
  // Cuentas creadas antes de instalar las tablas no tienen perfil: se crea ahora.
  if (!data) await supabase.from("profiles").insert({ id: user.id }).select("id").maybeSingle();

  return {
    id: user.id,
    displayName: data?.display_name ?? null,
    timezone: data?.timezone ?? DEFAULT_TIMEZONE,
  };
});
