/*
 * Texto de preguntas, explicaciones y respuestas de la IA: párrafos, listas
 * con «- », **negrita**, bloques ```código```, `código en línea` y citas [n]
 * enlazadas a su fuente. Sin HTML: todo se pinta como texto.
 */

export type Citation = { n: number; href: string; label: string };

function Plain({ text, citations }: { text: string; citations?: Citation[] }) {
  if (!citations?.length) return <>{text}</>;
  const parts = text.split(/(\[\d{1,2}(?:\s*,\s*\d{1,2})*\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const nums = /^\[[\d,\s]+\]$/.test(part) ? part.slice(1, -1).split(",").map((x) => Number(x.trim())) : null;
        if (!nums) return <span key={i}>{part}</span>;
        return (
          <span key={i}>
            {nums.map((n, j) => {
              const c = citations.find((x) => x.n === n);
              return c ? (
                <a key={j} href={c.href} title={c.label} aria-label={`Fuente ${n}: ${c.label}`} className="align-super text-xs font-semibold text-primary hover:underline">
                  [{n}]
                </a>
              ) : (
                <span key={j}>[{n}]</span>
              );
            })}
          </span>
        );
      })}
    </>
  );
}

function Inline({ text, citations }: { text: string; citations?: Citation[] }) {
  const parts = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
          <code key={i} className="rounded bg-primary-soft px-1 py-0.5 font-mono text-[0.9em]">
            {part.slice(1, -1)}
          </code>
        ) : part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <strong key={i}>
            <Plain text={part.slice(2, -2)} citations={citations} />
          </strong>
        ) : (
          <Plain key={i} text={part} citations={citations} />
        ),
      )}
    </>
  );
}

/** Un párrafo; si todas sus líneas empiezan por «- » o «1. », es una lista. */
function Paragraph({ text, citations }: { text: string; citations?: Citation[] }) {
  const lines = text.split("\n");
  const bullet = /^\s*[-*•]\s+/;
  const numbered = /^\s*\d+[.)]\s+/;
  if (lines.length > 0 && lines.every((l) => bullet.test(l) || numbered.test(l))) {
    const ordered = lines.every((l) => numbered.test(l));
    const Tag = ordered ? "ol" : "ul";
    return (
      <Tag className={`flex flex-col gap-1 pl-5 ${ordered ? "list-decimal" : "list-disc"}`}>
        {lines.map((l, i) => (
          <li key={i}>
            <Inline text={l.replace(ordered ? numbered : bullet, "")} citations={citations} />
          </li>
        ))}
      </Tag>
    );
  }
  return (
    <p className="whitespace-pre-line">
      <Inline text={text} citations={citations} />
    </p>
  );
}

export function CodeBlock({ code, language }: { code: string; language?: string | null }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-border bg-background p-3 text-sm leading-relaxed">
      <code className="font-mono" data-language={language ?? undefined}>
        {code}
      </code>
    </pre>
  );
}

export function RichText({ text, className = "", citations }: { text: string; className?: string; citations?: Citation[] }) {
  const blocks = text.split(/```([^\n`]*)\n([\s\S]*?)```/g);
  // split con 2 grupos: [texto, lenguaje, código, texto, lenguaje, código, ...]
  const out: React.ReactNode[] = [];
  for (let i = 0; i < blocks.length; i += 3) {
    const prose = blocks[i];
    prose
      .split(/\n{2,}/)
      .filter((p) => p.trim())
      .forEach((p, j) =>
        out.push(
          <Paragraph key={`p${i}-${j}`} text={p.trim()} citations={citations} />,
        ),
      );
    if (i + 2 < blocks.length) out.push(<CodeBlock key={`c${i}`} language={blocks[i + 1] || null} code={blocks[i + 2].replace(/\n$/, "")} />);
  }
  return <div className={`flex flex-col gap-2 leading-relaxed ${className}`}>{out}</div>;
}
