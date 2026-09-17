/**
 * KOLEKSİYON → WEB SİTESİ — WooCommerce içe aktarım CSV'si üretir.
 *
 * Sıraç (2026-09-17): "Buradaki değişiklikler de siteye yansısın."
 *
 * SİTEYE BİZ YAZMIYORUZ. Bu dosya yalnız bir CSV metni üretir; onu
 * WooCommerce'in kendi içe aktarıcısına (Ürünler → İçe Aktar, "mevcut
 * ürünleri güncelle") kullanıcı yükler. API anahtarı istemez ve her gönderim
 * bir insanın gözünden geçer.
 *
 * HAM İÇERİK CSV'DEN GELİR, SİTEDEN OKUNAN JSON'DAN DEĞİL. Ölçüldü
 * (2026-09-17): Store API açıklamayı İŞLENMİŞ döndürüyor — `<p>` sarmalı
 * eklenmiş ve düz tırnaklar kıvrılmış:
 *     CSV : [vc_tta_section title="Size" tab_id="1734009303758-…"]
 *     API : <p>[vc_tta_section title=&#8221;Size&#8221; tab_id=&#8221;…</p>
 * O metin siteye geri yazılsaydı WPBakery `title` niteliğini okuyamaz,
 * akordeon tümden çökerdi. Bu yüzden kullanıcı her gönderimde WooCommerce'ten
 * güncel dışa aktarımı verir; ham metnin tek doğru kaynağı o.
 *
 * DEĞİŞTİRME HEDEFLİ. Yalnız ilgili `[vc_tta_section]` bloğunun
 * `[vc_column_text]` gövdesi yenilenir. Shortcode kabuğu, `tab_id`, `css`,
 * bölüm sırası ve ekibin yönetmediği bölümler ("Delivery & Returns",
 * "Assistance") olduğu gibi kalır. Açıklamayı sıfırdan kurmak, o iki bölümü
 * 185 üründen silmek olurdu.
 */

/** Panelde düzenlenen üç alan — siteye giden tek şey bunlar. */
export type WebTextField = "designers_note" | "size_fit" | "details_care";

/**
 * Föy alanı → sitede kabul edilen bölüm başlıkları, ÖNCELİK SIRASIYLA.
 *
 * Site iki adlandırma kullanıyor: giysilerde "Size & Fit" / "Details & Care"
 * (134 ve 140 ürün), kilim ve sandıklarda kısa hali "Size" / "Details"
 * (45 + 45). Uzun ad önce denenir; bir üründe ikisi birden varsa metin bir
 * kez yazılır.
 */
export const SECTION_TITLES: Record<WebTextField, string[]> = {
  designers_note: ["designer's note", "designers note"],
  size_fit: ["size & fit", "size"],
  details_care: ["details & care", "details"],
};

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…",
};

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** Başlığı karşılaştırılabilir hale getirir: "Size &amp; Fit" → "size & fit",
 *  "Designer’s Note" → "designer's note". */
function normalizeTitle(raw: string): string {
  return decode(raw).replace(/[’‘`]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
}

/* Tırnak olarak geçebilecek biçimler. Apostrof (') BİLEREK YOK: başlığın
   kendisinde geçiyor ("Designer's Note") ve tırnak sayılsaydı başlık orada
   kesilirdi. Ham dışa aktarımda 921/921 düz tırnak ölçüldü, kıvrık biçimler
   eski elle düzenlemelere karşı savunma olarak duruyor. */
const Q = `(?:&#8220;|&#8221;|&#8243;|&quot;|["“”″])`;
const TITLE_RE = new RegExp(`title=${Q}([\\s\\S]*?)${Q}`);
const SECTION_RE = /\[vc_tta_section\b([^\]]*)\]([\s\S]*?)\[\/vc_tta_section\]/g;
/* Gövde sarmalı. Ham dışa aktarımda 921/921 bölümde var; yine de yokluğu
   sessizce geçilmez, o bölüm "yazılamadı" diye raporlanır. */
const BODY_RE = /(\[vc_column_text\b[^\]]*\])([\s\S]*?)(\[\/vc_column_text\])/;

/** Düz metni bölüm gövdesine uygun HTML'e çevirir. */
export function textToBody(text: string): string {
  const html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    /* Köşeli parantez WordPress'te kısa kod açar — metinde kalırsa sayfa
       beklenmedik biçimde işlenir. */
    .replace(/\[/g, "&#91;")
    .replace(/\]/g, "&#93;")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .join("<br />\n");
  return `\n${html}\n`;
}

export interface RewriteResult {
  /** Yeni ham açıklama. Hiçbir alan yazılamadıysa girdiyle aynıdır. */
  description: string;
  /** Gerçekten değiştirilen alanlar. */
  written: WebTextField[];
  /** Sitede karşılık bölümü bulunamayan alanlar — CSV'ye girmemeli. */
  missing: WebTextField[];
}

/**
 * Ham açıklamada verilen alanların bölüm gövdelerini yeniler.
 *
 * `texts` içinde yalnız GÖNDERİLECEK alanlar bulunur; listede olmayan alanın
 * bölümüne dokunulmaz.
 */
export function rewriteDescription(
  raw: string,
  texts: Partial<Record<WebTextField, string>>,
): RewriteResult {
  const wanted = Object.keys(texts) as WebTextField[];
  if (!raw || wanted.length === 0) return { description: raw, written: [], missing: wanted };

  /* Hangi başlık hangi alana ait? Uzun ad önce gelsin diye öncelik sırası
     puana çevrilir: aynı üründe "Size & Fit" de "Size" da varsa uzun olan
     kazanır. */
  const claim = new Map<string, { field: WebTextField; rank: number }>();
  for (const field of wanted) {
    SECTION_TITLES[field].forEach((title, rank) => claim.set(title, { field, rank }));
  }

  const chosen = new Map<WebTextField, { rank: number; index: number }>();
  const blocks: { index: number; field: WebTextField; rank: number; body: boolean }[] = [];
  let m: RegExpExecArray | null;
  SECTION_RE.lastIndex = 0;
  while ((m = SECTION_RE.exec(raw)) !== null) {
    const titleMatch = m[1].match(TITLE_RE);
    if (!titleMatch) continue;
    const owner = claim.get(normalizeTitle(titleMatch[1]));
    if (!owner) continue;
    blocks.push({ index: m.index, field: owner.field, rank: owner.rank, body: BODY_RE.test(m[2]) });
    const best = chosen.get(owner.field);
    if (!best || owner.rank < best.rank) chosen.set(owner.field, { rank: owner.rank, index: m.index });
  }

  /* Yazma SONDAN BAŞA: önceki bölümün uzunluğu değişince sonraki bölümün
     konumu kayardı. */
  const edits = [...chosen.entries()]
    .map(([field, c]) => ({ field, ...c }))
    .sort((a, b) => b.index - a.index);

  let out = raw;
  const written: WebTextField[] = [];
  const missing: WebTextField[] = [];

  for (const edit of edits) {
    const block = blocks.find((b) => b.index === edit.index);
    if (!block?.body) { missing.push(edit.field); continue; }
    SECTION_RE.lastIndex = edit.index;
    const at = SECTION_RE.exec(out);
    if (!at || at.index !== edit.index) { missing.push(edit.field); continue; }
    const inner = at[2].replace(BODY_RE, (_all, open: string, _old: string, close: string) =>
      `${open}${textToBody(texts[edit.field] ?? "")}${close}`);
    out = out.slice(0, at.index) + `[vc_tta_section${at[1]}]${inner}[/vc_tta_section]` + out.slice(at.index + at[0].length);
    written.push(edit.field);
  }
  SECTION_RE.lastIndex = 0;

  for (const field of wanted) if (!chosen.has(field) && !missing.includes(field)) missing.push(field);
  return { description: out, written, missing };
}

/**
 * WooCommerce içe aktarıcısının okuyacağı CSV.
 *
 * YALNIZ İKİ SÜTUN: `ID` eşleme için, `Description` değişen içerik. İçe
 * aktarıcı yalnız verilen sütunları işler; fiyat, stok, kategori CSV'de
 * bulunmadığı için onlara dokunmaz. (WooCommerce belgesi bunu açıkça
 * yazmıyor, o yüzden ilk gönderim TEK ÜRÜNLE denenmeli — belgenin kendi
 * önerisi de bu.)
 *
 * UTF-8 BOM eklenir: dosya Excel'de açılırsa Türkçe harfler bozulmasın.
 */
export function toImportCsv(rows: { id: number; description: string }[]): string {
  const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = ["ID,Description", ...rows.map((r) => `${r.id},${cell(r.description)}`)];
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Ham dışa aktarımdan ürün ID'si → açıklama. Yalnız ana ürünler; varyantın
 *  kendi açıklaması yok, ebeveyninin akordeonunu gösterir. */
export function readExportedDescriptions(csvText: string): Map<number, string> {
  const rows = parseCsvRows(csvText);
  const head = rows.shift();
  if (!head) return new Map();
  const idAt = head.findIndex((h) => h.trim().toLowerCase() === "id");
  const descAt = head.findIndex((h) => h.trim().toLowerCase() === "description");
  const typeAt = head.findIndex((h) => h.trim().toLowerCase() === "type");
  if (idAt < 0 || descAt < 0) return new Map();
  const out = new Map<number, string>();
  for (const r of rows) {
    const id = Number(r[idAt]);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (typeAt >= 0 && r[typeAt] === "variation") continue;
    out.set(id, r[descAt] ?? "");
  }
  return out;
}

/** RFC4180. `split(",")` olmaz: Description alanında virgül, satır sonu ve
 *  tırnak var — satırı kesmek dosyayı paramparça eder. */
function parseCsvRows(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c !== '"') { field += c; continue; }
      if (src[i + 1] === '"') { field += '"'; i++; continue; }
      quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1);
}
