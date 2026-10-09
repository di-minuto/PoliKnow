import type { ExtractedDocument, ExtractedPage } from "../types";

/** TXT y Markdown: los encabezados "# ..." abren sección. */
export function extractPlainText(data: ArrayBuffer | Uint8Array): ExtractedDocument {
  const text = new TextDecoder("utf-8").decode(data).replace(/^﻿/, "");
  const sections: ExtractedPage[] = [{ page: null, heading: null, text: "" }];
  for (const line of text.split(/\r?\n/)) {
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    if (heading) sections.push({ page: null, heading: heading[1].trim(), text: `${heading[1].trim()}\n\n` });
    else sections[sections.length - 1].text += `${line}\n`;
  }
  return { pages: sections.filter((s) => s.text.trim()), pageCount: null };
}
