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

  return {
    id: user.id,
    displayName: data?.display_name ?? null,
    timezone: data?.timezone ?? DEFAULT_TIMEZONE,
  };
});
