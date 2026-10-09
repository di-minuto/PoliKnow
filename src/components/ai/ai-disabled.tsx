import { cardClass } from "@/components/ui/styles";

/** Cómo activar la IA (variables de entorno en Vercel; las claves nunca van en el código). */
export function AIDisabled({ reason, feature }: { reason?: string | null; feature: string }) {
  return (
    <div className={`${cardClass} flex flex-col gap-3 p-5 text-sm`}>
      <p className="text-base font-medium">{feature} necesita la IA, que ahora está desactivada.</p>
      {reason && <p className="text-danger">{reason}</p>}
      <p className="text-muted">
        Todo lo demás funciona sin ella. Para activarla, en Vercel → tu proyecto → Settings → Environment Variables añade
        (y vuelve a desplegar):
      </p>
      <ul className="flex flex-col gap-1.5 pl-5 [list-style:disc]">
        <li>
          <strong>Claude:</strong> <code>AI_PROVIDER=anthropic</code> y <code>ANTHROPIC_API_KEY</code>.
        </li>
        <li>
          <strong>OpenAI:</strong> <code>AI_PROVIDER=openai</code> y <code>OPENAI_API_KEY</code>.
        </li>
        <li>
          <strong>Gratis con Gemini:</strong> <code>AI_PROVIDER=openai</code>, <code>OPENAI_API_KEY</code> = tu clave de Google AI
          Studio, <code>AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai</code> y{" "}
          <code>AI_MODEL=gemini-2.5-flash</code>.
        </li>
      </ul>
      <p className="text-muted">La clave se queda en el servidor; nunca llega al navegador ni al repositorio.</p>
    </div>
  );
}
