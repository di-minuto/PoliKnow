import { inputClass } from "./styles";

const LABELS = ["", "Muy baja", "Baja", "Media", "Alta", "Muy alta"];

/** Selector 1–5 con etiquetas en español. */
export function LevelSelect({
  name,
  defaultValue,
  allowEmpty = false,
}: {
  name: string;
  defaultValue?: number | null;
  allowEmpty?: boolean;
}) {
  return (
    <select name={name} defaultValue={defaultValue ?? (allowEmpty ? "" : 3)} className={inputClass}>
      {allowEmpty && <option value="">Sin indicar</option>}
      {[1, 2, 3, 4, 5].map((n) => (
        <option key={n} value={n}>
          {n} · {LABELS[n]}
        </option>
      ))}
    </select>
  );
}
