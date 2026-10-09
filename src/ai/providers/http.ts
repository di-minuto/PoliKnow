/** Error de la API del proveedor, con un mensaje que se puede enseñar al usuario. */
export class AIRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AIRequestError";
  }
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 90_000;

function friendly(status: number, provider: string, model?: string): string {
  if (status === 401 || status === 403) return `La clave de API de ${provider} no es válida o no tiene permiso.`;
  if (status === 429) return `${provider} ha limitado las peticiones (cuota o límite por minuto). Prueba en un rato.`;
  if (status === 404) {
    return `${provider} no encuentra el modelo ${model ? `«${model}»` : "configurado"}: puede que ya no exista. Revisa AI_MODEL o bórrala para usar el modelo por defecto.`;
  }
  if (status >= 500) return `${provider} no responde ahora mismo. Prueba en un rato.`;
  return `${provider} ha rechazado la petición (error ${status}).`;
}

/** POST JSON con tiempo máximo y errores legibles. Nunca incluye la clave en el mensaje. */
export async function postJson(
  fetcher: FetchLike,
  provider: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const timeout = (error as { name?: string })?.name === "TimeoutError";
    throw new AIRequestError(timeout ? `${provider} ha tardado demasiado en responder.` : `No se ha podido conectar con ${provider}.`);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`[ia] ${provider} ${response.status}: ${detail.slice(0, 500)}`);
    const model = (body as { model?: unknown }).model;
    throw new AIRequestError(friendly(response.status, provider, typeof model === "string" ? model : undefined), response.status);
  }
  return response.json();
}
