/** Tareas para las que se usa la IA. Cada una tiene su prompt versionado (Fase 9). */
export type AITask =
  | "analyze_document"
  | "generate_questions"
  | "generate_exercise"
  | "explain_answer"
  | "classify_topic"
  | "detect_concepts"
  | "build_mock_exam"
  | "plan_assist"
  | "assistant_chat";

export type AIMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AICompletionRequest = {
  task: AITask;
  system?: string;
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Versión del prompt; forma parte de la clave de caché. */
  promptVersion?: string;
  /** Pedir al proveedor que responda solo JSON (si lo admite). */
  json?: boolean;
};

export type AIUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type AICompletionResult = {
  text: string;
  provider: string;
  model: string;
  usage?: AIUsage;
  /** true si la respuesta viene de la caché y no ha costado tokens. */
  cached?: boolean;
  /** true si el proveedor cortó la respuesta por llegar al máximo de tokens. */
  truncated?: boolean;
};
