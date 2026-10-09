/*
 * Recuperación para el asistente sin embeddings: palabras clave de la
 * pregunta → búsqueda de texto completo de Postgres (OR entre términos).
 */

const STOPWORDS = new Set(
  (
    "a al algo algun alguna algunas alguno algunos ante antes aqui asi aun bien cada como con contra cual cuales cuando de del desde " +
    "donde dos el ella ellas ellos en entre era es esa esas ese eso esos esta estas este esto estos fue ha hace hay la las le les lo los " +
    "mas me mi mis mucho muy nada ni no nos o otra otro para pero poco por porque que quien se ser si sin sobre son su sus tambien " +
    "tan te tiene tu tus un una uno unos unas y ya yo " +
    "explica explicame explicar dime dame pon ponme puedes podrias quiero necesito sabes ayuda ayudame hola gracias " +
    "diferencia diferencias entre parecido parecida similar ejemplo ejemplos pregunta preguntame preguntas ejercicio " +
    "concepto tema temas cosa cosas favor vale ok bueno deberia debo hoy llevo peor mejor he has esta estoy"
  ).split(" "),
);

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Términos útiles de la pregunta (sin palabras vacías), en orden y sin repetir. */
export function keywords(question: string, max = 8): string[] {
  const out: string[] = [];
  for (const raw of question.split(/[^\p{L}\p{N}_#+.-]+/u)) {
    const word = raw.replace(/^[.-]+|[.-]+$/g, "");
    const key = strip(word);
    if (key.length < 3 && !/\d/.test(key)) continue;
    if (STOPWORDS.has(key) || out.some((w) => strip(w) === key)) continue;
    out.push(word);
    if (out.length >= max) break;
  }
  return out;
}

/** Consulta para websearch_to_tsquery: «critical or atomic or openmp». */
export function searchQuery(question: string): string | null {
  const words = keywords(question).map((w) => w.replace(/["']/g, ""));
  return words.length ? words.join(" or ") : null;
}

/** Números de cita [n] usados en la respuesta, en orden de aparición y sin repetir. */
export function citedSources(answer: string, available: number): number[] {
  const seen: number[] = [];
  for (const match of answer.matchAll(/\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g)) {
    for (const n of match[1].split(",").map((x) => Number(x.trim()))) {
      if (n >= 1 && n <= available && !seen.includes(n)) seen.push(n);
    }
  }
  return seen;
}

/** Temas o intenciones que piden el estado de estudio (plan, temas flojos, fallos). */
export function wantsStudyState(question: string): { plan: boolean; weak: boolean; mistakes: boolean } {
  const q = strip(question);
  return {
    plan: /\b(hoy|manana|estudi(o|ar)|plan|semana|toca)\b/.test(q),
    weak: /\b(peor|debil|flojo|fallo|mejorar|llevo)/.test(q),
    mistakes: /\b(fallad[oa]|falle|fallo|error|equivoqu)/.test(q),
  };
}
