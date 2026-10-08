import { describe, expect, it } from "vitest";
import { daysBetween, formatDayHeading, toLocalDayKey } from "./dates";

describe("fechas", () => {
  it("formatea el día en español", () => {
    expect(formatDayHeading(new Date("2026-10-12T10:00:00Z"))).toBe("lunes, 12 de octubre");
  });

  it("usa la zona horaria del usuario para decidir el día", () => {
    // 23:30 UTC del 11 ya es día 12 en Madrid (UTC+2 en octubre)
    const lateNight = new Date("2026-10-11T23:30:00Z");
    expect(toLocalDayKey(lateNight, "Europe/Madrid")).toBe("2026-10-12");
    expect(toLocalDayKey(lateNight, "UTC")).toBe("2026-10-11");
  });

  it("cuenta días entre fechas, también con cambio de hora", () => {
    expect(daysBetween("2026-10-08", "2026-10-12")).toBe(4);
    expect(daysBetween("2026-10-20", "2026-11-03")).toBe(14);
  });
});
