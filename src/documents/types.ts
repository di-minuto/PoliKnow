/** Una unidad de texto extraída: una página de PDF, una diapositiva o el documento entero. */
export type ExtractedPage = {
  /** Número de página o diapositiva (1..n); null si el formato no tiene páginas. */
  page: number | null;
  /** Título de la diapositiva o encabezado detectado, si lo hay. */
  heading?: string | null;
  text: string;
};

export type ExtractedDocument = {
  pages: ExtractedPage[];
  pageCount: number | null;
};

/** Fragmento listo para guardar en document_chunks. */
export type TextChunk = {
  chunkIndex: number;
  pageFrom: number | null;
  pageTo: number | null;
  heading: string | null;
  content: string;
};

/** Formato a partir del tipo MIME o, si falta, de la extensión. */
export type DocumentFormat = "pdf" | "docx" | "pptx" | "text" | "image" | "unsupported";
