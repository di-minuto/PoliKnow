import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicEnv } from "./env";

describe("variables públicas", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("acepta una clave publicable completa", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_abc-DEF_123");
    expect(getPublicEnv().NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe("sb_publishable_abc-DEF_123");
  });

  it("explica el error si la clave se copió recortada", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_abc…");
    expect(() => getPublicEnv()).toThrow(/recortada/);
  });
});
