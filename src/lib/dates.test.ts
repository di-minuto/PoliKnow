import { describe, expect, it } from "vitest";
import {
  countdownLabel,
  daysBetween,
  daysUntil,
  formatDayHeading,
  toLocalDayKey,
  utcToZonedLocal,
  zonedLocalToUtc,
} from "./dates";

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


describe("zonas horarias en formularios", () => {
  it("interpreta la hora del formulario en la zona del usuario", () => {
    // Octubre: Madrid es UTC+2
    expect(zonedLocalToUtc("2026-10-20T09:00", "Europe/Madrid")).toBe("2026-10-20T07:00:00.000Z");
    // Noviembre: tras el cambio de hora, UTC+1
    expect(zonedLocalToUtc("2026-11-05T09:00", "Europe/Madrid")).toBe("2026-11-05T08:00:00.000Z");
  });

  it("ida y vuelta conserva la hora local", () => {
    for (const local of ["2026-03-29T10:30", "2026-10-25T12:00", "2027-01-15T08:15"]) {
      expect(utcToZonedLocal(zonedLocalToUtc(local, "Europe/Madrid"), "Europe/Madrid")).toBe(local);
    }
  });

  it("rechaza valores mal formados", () => {
    expect(() => zonedLocalToUtc("mañana")).toThrow(RangeError);
  });
});

describe("cuenta atrás", () => {
  const now = new Date("2026-10-09T08:00:00Z");

  it("cuenta días en la zona del usuario", () => {
    expect(daysUntil("2026-10-09T18:00:00Z", now)).toBe(0);
    expect(daysUntil("2026-10-09T22:30:00Z", now)).toBe(1); // ya es día 10 en Madrid
    expect(daysUntil("2026-11-05T08:00:00Z", now)).toBe(27);
  });

  it("etiqueta en español", () => {
    expect(countdownLabel(0)).toBe("Hoy");
    expect(countdownLabel(1)).toBe("Mañana");
    expect(countdownLabel(27)).toBe("Faltan 27 días");
    expect(countdownLabel(-3)).toBe("Hace 3 días");
  });
});
