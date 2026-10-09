import JSZip from "jszip";
import { decodeXmlEntities } from "../normalize";
import type { ExtractedDocument, ExtractedPage } from "../types";

/** Texto de un fragmento XML de Office: une <w:t>/<a:t> y respeta tabuladores y saltos. */
function runsText(xml: string, prefix: "w" | "a"): string {
  const pattern = new RegExp(
    `<${prefix}:t(?:\\s[^>]*)?>([\\s\\S]*?)</${prefix}:t>|<${prefix}:tab\\s*/>|<${prefix}:br\\s*/>`,
    "g",
  );
  let out = "";
  for (const m of xml.matchAll(pattern)) {
    if (m[1] !== undefined) out += decodeXmlEntities(m[1]);
    else if (m[0].includes(":tab")) out += "\t";
    else out += "\n";
  }
  return out;
}

async function loadZip(data: ArrayBuffer | Uint8Array): Promise<JSZip> {
  try {
    return await JSZip.loadAsync(data);
  } catch {
    throw new Error("El archivo está dañado o no es un documento de Office válido.");
  }
}

const HEADING_STYLE = /<w:pStyle w:val="(?:heading|t[ií]?tulo|title|subtitle)[^"]*"/i;

/**
 * DOCX: cada encabezado (estilos Título/Heading) abre una sección nueva,
 * así los fragmentos conservan el apartado al que pertenecen.
 */
export async function extractDocx(data: ArrayBuffer | Uint8Array): Promise<ExtractedDocument> {
  const zip = await loadZip(data);
  const file = zip.file("word/document.xml");
  if (!file) throw new Error("El DOCX no tiene contenido (falta word/document.xml).");
  const xml = await file.async("string");
  const body = xml.slice(xml.indexOf("<w:body"));

  const sections: ExtractedPage[] = [{ page: null, heading: null, text: "" }];
  for (const paragraph of body.split(/<\/w:p>/)) {
    const text = runsText(paragraph, "w").trim();
    if (!text) continue;
    if (HEADING_STYLE.test(paragraph)) {
      sections.push({ page: null, heading: text, text: `${text}\n\n` });
    } else {
      sections[sections.length - 1].text += `${text}\n\n`;
    }
  }
  return { pages: sections.filter((s) => s.text.trim()), pageCount: null };
}

function slideNumber(path: string): number {
  return Number(/(\d+)\.xml$/.exec(path)?.[1] ?? 0);
}

function paragraphs(xml: string): string[] {
  return xml
    .split(/<\/a:p>/)
    .map((p) => runsText(p, "a").trim())
    .filter(Boolean);
}

/** PPTX: una "página" por diapositiva, con su título y las notas del orador. */
export async function extractPptx(data: ArrayBuffer | Uint8Array): Promise<ExtractedDocument> {
  const zip = await loadZip(data);
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => slideNumber(a) - slideNumber(b));
  if (slidePaths.length === 0) throw new Error("El PPTX no tiene diapositivas.");

  const pages: ExtractedPage[] = [];
  for (const [index, path] of slidePaths.entries()) {
    const xml = await zip.file(path)!.async("string");
    let heading: string | null = null;
    const lines: string[] = [];
    for (const shape of xml.split(/<\/p:sp>/)) {
      const shapeParagraphs = paragraphs(shape);
      if (shapeParagraphs.length === 0) continue;
      if (!heading && /<p:ph[^>]*type="(?:title|ctrTitle)"/.test(shape)) heading = shapeParagraphs.join(" ");
      lines.push(...shapeParagraphs);
    }

    const rels = zip.file(path.replace("slides/", "slides/_rels/").replace(/\.xml$/, ".xml.rels"));
    const notesTarget = rels && /Target="\.\.\/notesSlides\/([^"]+)"/.exec(await rels.async("string"))?.[1];
    const notesFile = notesTarget ? zip.file(`ppt/notesSlides/${notesTarget}`) : null;
    if (notesFile) {
      const notes = paragraphs(await notesFile.async("string")).filter((l) => !/^\d+$/.test(l));
      if (notes.length) lines.push(`Notas: ${notes.join(" ")}`);
    }

    pages.push({ page: index + 1, heading, text: lines.join("\n\n") });
  }
  return { pages, pageCount: slidePaths.length };
}
