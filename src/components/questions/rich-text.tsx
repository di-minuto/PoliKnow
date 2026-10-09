/*
 * Texto de preguntas y explicaciones: párrafos, bloques ```código``` y
 * `código en línea`. Sin HTML: todo se pinta como texto.
 */

function Inline({ text }: { text: string }) {
  const parts = text.split(/(`[^`\n]+`)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
          <code key={i} className="rounded bg-primary-soft px-1 py-0.5 font-mono text-[0.9em]">
            {part.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
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

export function RichText({ text, className = "" }: { text: string; className?: string }) {
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
          <p key={`p${i}-${j}`} className="whitespace-pre-line">
            <Inline text={p.trim()} />
          </p>,
        ),
      );
    if (i + 2 < blocks.length) out.push(<CodeBlock key={`c${i}`} language={blocks[i + 1] || null} code={blocks[i + 2].replace(/\n$/, "")} />);
  }
  return <div className={`flex flex-col gap-2 leading-relaxed ${className}`}>{out}</div>;
}
