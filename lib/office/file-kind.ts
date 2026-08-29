import {
  Folder, FileText, Table2, Image as ImageIcon, FileType2, FileSpreadsheet,
  FileArchive, Film, Music, File as FileIcon, FolderOpen, Palette, Globe,
  StickyNote, Link2 as LinkIcon, type LucideIcon,
} from "lucide-react";

/**
 * DOSYA TÜRÜ = GÖRSEL KİMLİK.
 *
 * Sıraç (2026-08-29): "Hepsi aynı duruyor. Sheet anlaşılmıyor, Word
 * anlaşılmıyor… kompozisyon kötü, anlaşılır durmuyor."
 *
 * AF Teamwork'te her şey aynı nötr kartla çiziliyordu: klasör de, yazı da,
 * tablo da, yüklenen PDF de. Drive'ın işi kolaylaştıran tek şeyi budur —
 * ikona bakınca ne olduğunu bilmek. Burası o eşlemenin TEK kaynağı: ikon +
 * renk + insan diliyle tür adı.
 *
 * Renkler kişi paletinden (lib/design/person-colors.ts) geliyor ki uygulama
 * tek renk ailesinde kalsın.
 */

export type FileKind = {
  icon: LucideIcon;
  /** Kart kimlik rengi. */
  hex: string;
  /** Kartın alt satırında görünen tür adı. */
  label: string;
};

export const KIND_FOLDER: FileKind = { icon: Folder, hex: "#c98e20", label: "Klasör" };
export const KIND_DOC: FileKind = { icon: FileText, hex: "#2563c9", label: "Yazı" };
export const KIND_SHEET: FileKind = { icon: Table2, hex: "#1f6e4d", label: "Tablo" };

/** MIME (ya da dosya adı uzantısı) → kimlik. */
export function fileKindOf(mime: string | null | undefined, name: string | null | undefined): FileKind {
  const m = (mime ?? "").toLowerCase();
  const ext = (name ?? "").toLowerCase().split(".").pop() ?? "";

  if (m.startsWith("image/")) return { icon: ImageIcon, hex: "#7c3aed", label: "Görsel" };
  if (m.startsWith("video/")) return { icon: Film, hex: "#cc2e93", label: "Video" };
  if (m.startsWith("audio/")) return { icon: Music, hex: "#cc2e93", label: "Ses" };
  if (m === "application/pdf" || ext === "pdf") return { icon: FileType2, hex: "#d23320", label: "PDF" };

  if (["doc", "docx", "odt", "rtf"].includes(ext)) return { icon: FileText, hex: "#2563c9", label: "Word" };
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) return { icon: FileSpreadsheet, hex: "#1f6e4d", label: "Excel" };
  if (["ppt", "pptx", "key", "odp"].includes(ext)) return { icon: FileType2, hex: "#df7314", label: "Sunum" };
  if (["md", "markdown"].includes(ext)) return { icon: FileText, hex: "#5b6e8a", label: "Markdown" };
  if (["txt", "log"].includes(ext)) return { icon: FileText, hex: "#5b6e8a", label: "Metin" };
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return { icon: FileArchive, hex: "#998a2e", label: "Arşiv" };

  return { icon: FileIcon, hex: "#5b6e8a", label: ext ? ext.toUpperCase() : "Dosya" };
}

/** Dış bağlantı türü → kimlik. Drive/Canva/Figma… hepsi kendi rengiyle. */
export function linkKindOf(documentType: string | null | undefined): FileKind {
  switch (documentType) {
    case "drive_link":   return { icon: FolderOpen, hex: "#1f6e4d", label: "Drive" };
    case "google_doc":   return { icon: FileText, hex: "#2563c9", label: "Google Doküman" };
    case "google_sheet": return { icon: FileSpreadsheet, hex: "#1f6e4d", label: "Google E-Tablo" };
    case "canva":        return { icon: Palette, hex: "#1796a4", label: "Canva" };
    case "figma":        return { icon: Palette, hex: "#7c3aed", label: "Figma" };
    case "pdf_link":     return { icon: FileType2, hex: "#d23320", label: "PDF bağlantısı" };
    case "word_link":    return { icon: FileText, hex: "#2563c9", label: "Word bağlantısı" };
    case "excel_link":   return { icon: FileSpreadsheet, hex: "#1f6e4d", label: "Excel bağlantısı" };
    case "website":      return { icon: Globe, hex: "#5b6e8a", label: "Web sayfası" };
    case "internal_note": return { icon: StickyNote, hex: "#c98e20", label: "Dahili not" };
    default:             return { icon: LinkIcon, hex: "#5b6e8a", label: "Bağlantı" };
  }
}

/** 1536000 → "1,5 MB" */
export function humanSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
