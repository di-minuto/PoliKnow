/*
 * Gráficas sencillas en SVG, sin librerías: se pintan en el servidor y pesan
 * poco en el móvil. Los colores salen de las variables del tema.
 */

const fmt = (n: number, d = 1) => String(Math.round(n * 10 ** d) / 10 ** d).replace(".", ",");

/** Barra de progreso 0..1 con su porcentaje. */
export function ProgressBar({ value, label, tone = "primary" }: { value: number | null; label: string; tone?: "primary" | "success" }) {
  const pct = value === null ? null : Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-medium">{pct === null ? "sin datos" : `${pct}%`}</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-border"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? 0}
      >
        <div className={`h-full ${tone === "success" ? "bg-success" : "bg-primary"}`} style={{ width: `${pct ?? 0}%` }} />
      </div>
    </div>
  );
}

/** Minutos por día como barras. */
export function DailyBars({ data }: { data: { day: string; minutes: number }[] }) {
  const W = 320;
  const H = 120;
  const max = Math.max(60, ...data.map((d) => d.minutes));
  const bw = W / data.length;
  const total = data.reduce((s, d) => s + d.minutes, 0);
  const label = (day: string) => {
    const [, m, d] = day.split("-");
    return `${Number(d)}/${Number(m)}`;
  };
  return (
    <svg
      viewBox={`0 0 ${W} ${H + 18}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Minutos estudiados en los últimos ${data.length} días: ${Math.round(total)} en total`}
    >
      <line x1={0} x2={W} y1={H} y2={H} className="stroke-border" />
      <text x={W} y={10} textAnchor="end" className="fill-muted text-[9px]">
        {max >= 120 ? `${fmt(max / 60)} h` : `${max} min`}
      </text>
      {data.map((d, i) => {
        const h = (d.minutes / max) * (H - 14);
        return (
          <g key={d.day}>
            <title>{`${label(d.day)}: ${d.minutes} min`}</title>
            <rect x={i * bw + 1.5} y={H - h} width={bw - 3} height={h} rx={2} className="fill-primary" />
            {i % 7 === data.length % 7 && (
              <text x={i * bw + bw / 2} y={H + 13} textAnchor="middle" className="fill-muted text-[9px]">
                {label(d.day)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Evolución de notas (0..10). Los simulacros y exámenes, con punto relleno. */
export function GradeLine({ points }: { points: { finishedAt: string; grade: number; exam: boolean }[] }) {
  const W = 320;
  const H = 130;
  const pad = 16;
  const x = (i: number) => pad + (points.length === 1 ? (W - 2 * pad) / 2 : (i * (W - 2 * pad)) / (points.length - 1));
  const y = (g: number) => 8 + ((10 - g) / 10) * (H - 16);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.grade).toFixed(1)}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Evolución de notas: ${points.map((p) => fmt(p.grade)).join(", ")}`}
    >
      {[0, 5, 10].map((g) => (
        <g key={g}>
          <line x1={pad} x2={W - 4} y1={y(g)} y2={y(g)} className="stroke-border" strokeDasharray={g === 5 ? "4 3" : undefined} />
          <text x={0} y={y(g) + 3} className="fill-muted text-[9px]">
            {g}
          </text>
        </g>
      ))}
      <path d={path} fill="none" className="stroke-primary" strokeWidth={2} strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle
          key={`${p.finishedAt}-${i}`}
          cx={x(i)}
          cy={y(p.grade)}
          r={p.exam ? 4 : 3}
          className={p.exam ? "fill-primary" : "fill-surface stroke-primary"}
          strokeWidth={p.exam ? 0 : 2}
        >
          <title>{`${fmt(p.grade)}${p.exam ? " (simulacro/examen)" : ""}`}</title>
        </circle>
      ))}
    </svg>
  );
}
