import { FileImage, FileText, Presentation, type LucideIcon } from "lucide-react";
import { EXTRACTION_STATUS_LABELS } from "@/domain/documents/schemas";
import type { ExtractionStatus } from "@/domain/documents/types";
import { detectFormat } from "@/documents/format";

export function formatIcon(filename: string | null, mimeType: string | null): LucideIcon {
  const format = detectFormat(filename ?? "", mimeType);
  if (format === "pptx") return Presentation;
  if (format === "image") return FileImage;
  return FileText;
}

export function formatSize(bytes: number | null): string | null {
  if (bytes === null) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

const STATUS_CLASS: Record<ExtractionStatus, string> = {
  pending: "bg-border/60 text-muted",
  processing: "bg-primary-soft text-primary",
  done: "bg-success-soft text-success",
  failed: "bg-danger-soft text-danger",
  not_applicable: "bg-border/60 text-muted",
};

export function ExtractionBadge({ status, noText }: { status: ExtractionStatus; noText?: boolean }) {
  const label = status === "done" && noText ? "Sin texto" : EXTRACTION_STATUS_LABELS[status];
  const cls = status === "done" && noText ? STATUS_CLASS.not_applicable : STATUS_CLASS[status];
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}
