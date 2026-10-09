"use client";

import { useRouter } from "next/navigation";
import { inputClass } from "./styles";

/** Desplegable que navega al elegir (filtros en la URL). */
export function SelectNav({
  label,
  value,
  options,
}: {
  label: string;
  value: string;
  options: { href: string; label: string; value: string }[];
}) {
  const router = useRouter();
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => {
        const option = options.find((o) => o.value === e.target.value);
        if (option) router.push(option.href);
      }}
      className={inputClass}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
