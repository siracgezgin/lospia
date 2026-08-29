/**
 * Üretim föyünün E-POSTA gövdesi.
 *
 * Aslı Hanım (2026-08-28), Volkan'a sistemi anlatırken:
 *   "Burada bir üretim föyünde olması gereken her şeyin bilgisini buradaki
 *    operasyon sisteminde giriyoruz. Üreticiye bu föy gidiyor. Aynı mail
 *    sistemiyle."
 * Sıraç üreticiye sistem erişimi vermeyi önerdi, Aslı reddetti:
 *   "Bence mail olarak gitmesiyle başta daha sağlıklı yani."
 *
 * Yani üretici uygulamaya GİRMEZ; föyü okunur bir e-posta olarak alır.
 * Gövde tek sayfalık çıktının metin karşılığıdır — aynı alanlar, aynı sıra.
 *
 * FİYAT GİTMEZ. Kâğıt çıktıda da varsayılan böyle (Aslı Hanım, 2026-08-23:
 * "kâğıt atölyeye gidiyor, web satış fiyatını görmesi gerekmiyor"); ustaya
 * giden mailde de web satış fiyatı ve maliyet kalemleri yer almaz. Ustanın
 * kendi birim ödemesi ödeme tablosunun konusudur, föyün değil.
 */

import type { ProductionSheet, SheetMaterialWithMaterial } from "@/types";

export type SheetEmailContext = {
  sheet: ProductionSheet;
  bom: SheetMaterialWithMaterial[];
  manufacturerName: string | null;
  seasonName: string | null;
  /** Gönderen kişinin görünen adı — imza satırı. */
  senderName: string;
  /** Gönderenin eklediği serbest not. */
  note?: string | null;
};

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const has = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "";

function dateTR(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

/** Beden dağılımı → "S: 4 · M: 6 · L: 2" */
function sizeLine(dist: unknown): string {
  if (!dist || typeof dist !== "object") return "";
  return Object.entries(dist as Record<string, unknown>)
    .filter(([, qty]) => Number(qty) > 0)
    .map(([size, qty]) => `${size.toUpperCase()}: ${qty}`)
    .join(" · ");
}

function totalQty(dist: unknown): number {
  if (!dist || typeof dist !== "object") return 0;
  return Object.values(dist as Record<string, unknown>)
    .reduce<number>((a, q) => a + (Number(q) || 0), 0);
}

/** Ölçü tablosu → satır listesi. */
function measureRows(m: unknown): [string, string][] {
  if (!m || typeof m !== "object") return [];
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(m as Record<string, unknown>)) {
    if (!has(v)) continue;
    if (typeof v === "object") {
      // { S: 40, M: 42 } biçimi → tek satırda topla
      const inner = Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => has(x))
        .map(([sz, x]) => `${sz.toUpperCase()} ${x}`)
        .join(" · ");
      if (inner) out.push([k, inner]);
    } else {
      out.push([k, String(v)]);
    }
  }
  return out;
}

export function buildSheetEmail(ctx: SheetEmailContext): { subject: string; text: string; html: string } {
  const { sheet, bom, manufacturerName, seasonName, senderName, note } = ctx;

  const title = sheet.title || "Üretim Föyü";
  const code = sheet.product_code ?? "";
  const subject = `Üretim Föyü — ${title}${code ? ` (${code})` : ""}`;

  /* Künye: yalnız DOLU alanlar. Boş satır göndermek üreticiyi "burada bir şey
     eksik mi?" diye düşündürüyor; eksikse zaten föy konfirme edilmiyor. */
  const facts: [string, string][] = [];
  const push = (label: string, v: unknown) => { if (has(v)) facts.push([label, String(v)]); };
  push("Ürün", title);
  push("Ürün kodu", code);
  push("Ürün tipi", sheet.product_kind);
  push("Renk", sheet.colorway);
  push("Kategori", sheet.category);
  push("Sezon", seasonName);
  push("Usta / Üretici", manufacturerName ?? sheet.producer);
  push("Teslim tarihi", dateTR(sheet.delivery_date));
  push("Dikim teslim", dateTR(sheet.sewing_delivery_date));

  const sizes = sizeLine(sheet.size_distribution);
  const qty = totalQty(sheet.size_distribution);
  if (sizes) facts.push(["Beden dağılımı", sizes]);
  if (qty > 0) facts.push(["Toplam adet", String(qty)]);

  const measures = measureRows(sheet.measurements);

  const materials = bom
    .map((b) => {
      const name = b.material?.name ?? "";
      if (!name) return null;
      const parts = [name];
      if (has(b.material?.code)) parts.push(`(${b.material!.code})`);
      // Reçetede tüketim + fire var; ustaya giden rakam ikisinin toplamıdır.
      const net = Number(b.consumption) || 0;
      const withWaste = net * (1 + (Number(b.waste_pct) || 0) / 100);
      const amount = net > 0
        ? `${withWaste.toFixed(2).replace(/\.00$/, "").replace(".", ",")} ${b.material?.unit ?? ""}`.trim()
        : "";
      if (amount) parts.push(`— ${amount}`);
      if (has(b.note)) parts.push(`· ${b.note}`);
      return parts.join(" ");
    })
    .filter((v): v is string => !!v);

  // ── Düz metin ────────────────────────────────────────────────────────────
  const lines: string[] = [`ÜRETİM FÖYÜ — ${title}`, ""];
  if (note?.trim()) lines.push(note.trim(), "");
  for (const [k, v] of facts) lines.push(`${k}: ${v}`);
  if (measures.length) {
    lines.push("", "ÖLÇÜLER");
    for (const [k, v] of measures) lines.push(`  ${k}: ${v}`);
  }
  if (materials.length) {
    lines.push("", "MALZEME / REÇETE");
    for (const m of materials) lines.push(`  • ${m}`);
  }
  if (has(sheet.description)) lines.push("", "AÇIKLAMA", String(sheet.description));
  lines.push("", `— ${senderName} · Aslı Filinta`);
  const text = lines.join("\n");

  // ── HTML ─────────────────────────────────────────────────────────────────
  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;white-space:nowrap;vertical-align:top">${esc(k)}</td>` +
    `<td style="padding:4px 0;color:#111827;font-weight:600">${esc(v)}</td></tr>`;

  const section = (heading: string, inner: string) =>
    `<h2 style="margin:24px 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">${esc(heading)}</h2>${inner}`;

  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#111827;max-width:640px">` +
    `<h1 style="margin:0 0 4px;font-size:20px;letter-spacing:-.01em">${esc(title)}</h1>` +
    `<p style="margin:0 0 16px;color:#6b7280;font-size:13px">Üretim Föyü${code ? ` · ${esc(code)}` : ""}</p>` +
    (note?.trim()
      ? `<p style="margin:0 0 16px;padding:10px 12px;background:#f9fafb;border-left:3px solid #d1d5db;white-space:pre-line">${esc(note.trim())}</p>`
      : "") +
    `<table style="border-collapse:collapse">${facts.map(([k, v]) => row(k, v)).join("")}</table>` +
    (measures.length
      ? section("Ölçüler", `<table style="border-collapse:collapse">${measures.map(([k, v]) => row(k, v)).join("")}</table>`)
      : "") +
    (materials.length
      ? section("Malzeme / Reçete",
          `<ul style="margin:0;padding-left:18px">${materials.map((m) => `<li style="margin:2px 0">${esc(m)}</li>`).join("")}</ul>`)
      : "") +
    (has(sheet.description)
      ? section("Açıklama", `<p style="margin:0;white-space:pre-line">${esc(sheet.description)}</p>`)
      : "") +
    `<p style="margin:28px 0 0;padding-top:12px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:13px">` +
    `${esc(senderName)} · Aslı Filinta</p></div>`;

  return { subject, text, html };
}
