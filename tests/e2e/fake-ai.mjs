// IA simulada para los tests e2e: API compatible con OpenAI (chat/completions)
// que responde según la tarea, sin red ni coste. GET /calls cuenta las llamadas.
import { createServer } from "node:http";

const port = Number(process.env.FAKE_AI_PORT ?? 3199);
let calls = 0;

function answer(system, user) {
  if (system.includes("prepara preguntas de examen")) {
    const count = Number(/Genera (\d+) preguntas/.exec(user)?.[1] ?? 3);
    const questions = [
      { type: "true_false", stem: "La cláusula reduction combina los resultados parciales de cada hilo.", answer: true, explanation: "Crea una copia privada por hilo [1].", difficulty: 2, source_ref: "[1]" },
      { type: "multiple_choice", stem: "¿Qué directiva serializa un bloque entero de código?", options: ["atomic", "critical", "barrier", "single"], answer: "B", explanation: "critical protege un bloque; atomic, una sola operación.", difficulty: 3, source_ref: "[1]" },
      { type: "true_false", stem: "atomic sirve para proteger bloques de varias instrucciones.", answer: false, explanation: "Solo una operación de memoria.", difficulty: 2, source: "official_exam" },
    ];
    return JSON.stringify({ questions: questions.slice(0, count) });
  }
  if (system.includes("Analizas apuntes")) {
    const topic = /Temas de la asignatura:\n- (.+)/.exec(user)?.[1] ?? null;
    return "```json\n" + JSON.stringify({ summary: "Resumen simulado: explica reduction, critical y atomic en OpenMP.", concepts: ["reduction", "critical", "atomic"], topics: topic ? [topic] : [], difficulty: 3 }) + "\n```";
  }
  if (system.includes("tutor universitario")) {
    return "Has confundido **critical** con **atomic**.\n\n- critical protege un bloque.\n- atomic, una operación [1].";
  }
  if (system.includes("asistente de estudio")) {
    const last = user;
    if (/estudiar hoy/i.test(last)) return system.includes("Plan de hoy") ? "Hoy te toca lo que marca tu plan." : "No veo tu plan.";
    return system.includes("[1] «") ? "Según tus apuntes, **critical** serializa un bloque y **atomic** una sola operación [1]." : "En tus documentos no aparece.";
  }
  return "ok";
}

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/calls") return res.end(String(calls));
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.url !== "/v1/chat/completions" || req.headers.authorization !== "Bearer e2e-key") {
      res.writeHead(401).end("{}");
      return;
    }
    calls++;
    const data = JSON.parse(body);
    const system = data.messages.find((m) => m.role === "system")?.content ?? "";
    const user = data.messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: answer(system, user) } }], usage: { prompt_tokens: 100, completion_tokens: 50 } }));
  });
}).listen(port, "127.0.0.1", () => console.log(`IA simulada en ${port}`));
