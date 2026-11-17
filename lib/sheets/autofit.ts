/**
 * SATIR İÇERİĞE GÖRE UZAR — kaydırılan metin yarıda kesilmez.
 *
 * Sıraç (18.11.2026): "Excel neden yarım çıkıyor hâlâ?" Satır yüksekliği
 * Excel'den geldiği gibi sabit duruyordu; panelin yazı tipi ve sütun
 * genişliği Excel'inkiyle birebir aynı olmadığı için "metni kaydır" açık
 * hücrede metin bir-iki satır fazla tutuyor, fazlası alttan kesiliyordu
 * (başlık satırı, "Açıklama" sütunu).
 *
 * Kural Excel'in kendi kuralı: kaydırılan metin satırı UZATIR. Kayıtlı
 * yükseklik alt sınırdır (kullanıcı satırı büyütebilir, fotoğraf için yer
 * açabilir); içerik sığmıyorsa satır içeriğin gerektirdiği kadar çizilir.
 * Kayıtlı veri DEĞİŞMEZ — bu yalnız çizim hesabıdır.
 *
 * Ölçüm tarayıcının kendi metin ölçeriyle (canvas) yapılır; sunucuda ve yazı
 * tipi yüklenmeden çağrılmaz (çağıran bekler).
 */

import { colWidth, mergesOf, rowHeight, type Cell, type Sheet } from "@/lib/sheets/model";

/** Hücre yazısı: text-[13.5px], kaydırmada leading-[1.35], px-1.5. */
const FONT_PX = 13.5;
const LINE_PX = FONT_PX * 1.35;
/** Yatay: 6+6 dolgu, 1 kenarlık, 1 pay. Dikey: alt kenarlık + yuvarlama payı. */
const PAD_X = 14;
const PAD_Y = 3;

let ctx: CanvasRenderingContext2D | null = null;
let family = "";
const widths = new Map<string, number>();

function measure(text: string, bold: boolean, italic: boolean): number {
  const font = `${italic ? "italic " : ""}${bold ? 600 : 500} ${FONT_PX}px ${family}`;
  const k = `${font}|${text}`;
  const hit = widths.get(k);
  if (hit !== undefined) return hit;
  ctx!.font = font;
  const w = ctx!.measureText(text).width;
  if (widths.size > 50_000) widths.clear();
  widths.set(k, w);
  return w;
}

/** `white-space: pre-wrap; overflow-wrap: break-word` ile kaç satır tutar. */
function lineCount(text: string, avail: number, bold: boolean, italic: boolean): number {
  let lines = 0;
  for (const para of text.split("\n")) {
    if (measure(para, bold, italic) <= avail) { lines++; continue; }
    let x = 0;
    lines++;
    /* Boşluk kendinden önceki kelimeye yapışık sayılır; satır sonuna denk
       gelen boşluk taşma yaratmaz (tarayıcı da asar). */
    for (const token of para.split(/(?<=\s)(?=\S)/)) {
      const word = token.replace(/\s+$/, "");
      const ww = measure(word, bold, italic);
      if (ww > avail) {
        /* Sütundan uzun tek kelime ÖNCE yeni satıra iner, sonra harf harf
           kırılır (tarayıcı da böyle yapar: "On / e / Siz / e"). */
        if (x > 0) { lines++; x = 0; }
        for (const ch of token) {
          const cw = measure(ch, bold, italic);
          if (x + cw > avail && x > 0) { lines++; x = 0; }
          x += cw;
        }
        continue;
      }
      if (x + ww > avail && x > 0) { lines++; x = 0; }
      x += measure(token, bold, italic);
    }
  }
  return lines;
}

/**
 * Kayıtlı yüksekliği yetmeyen satırlar → gereken yükseklik (piksel).
 * `textOf` hücrenin EKRANDA görünen metnini verir (formül sonucu, sayı biçimi).
 */
export function fitRowHeights(sheet: Sheet, textOf: (_r: number, _c: number, _cell: Cell) => string): Map<number, number> {
  const out = new Map<number, number>();
  if (typeof document === "undefined") return out;
  if (!ctx) ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return out;
  family = getComputedStyle(document.body).fontFamily || "sans-serif";

  /* Birleştirme: çapa hücresi alanın genişliğini kullanır; birden çok SATIRA
     yayılan alan satır uzatmaz (hangi satırın uzayacağı belirsiz), alanın
     çapa olmayan hücreleri de çizilmez. */
  const spans = new Map<string, number>();
  const skip = new Set<string>();
  for (const m of mergesOf(sheet)) {
    for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) skip.add(`${r}:${c}`);
    if (m.r1 !== m.r2) continue;
    skip.delete(`${m.r1}:${m.c1}`);
    let w = 0;
    for (let c = m.c1; c <= m.c2; c++) w += colWidth(sheet, c);
    spans.set(`${m.r1}:${m.c1}`, w);
  }

  for (const [k, cell] of Object.entries(sheet.cells)) {
    if (!cell.s?.w || cell.img || skip.has(k)) continue;
    const sep = k.indexOf(":");
    const r = Number(k.slice(0, sep)), c = Number(k.slice(sep + 1));
    const text = textOf(r, c, cell);
    if (!text) continue;
    const avail = Math.max(8, (spans.get(k) ?? colWidth(sheet, c)) - PAD_X);
    const need = Math.ceil(lineCount(text, avail, !!cell.s.b, !!cell.s.i) * LINE_PX + PAD_Y);
    if (need > rowHeight(sheet, r) && need > (out.get(r) ?? 0)) out.set(r, need);
  }
  return out;
}

/* ── Yazı tipi hazır mı? (useSyncExternalStore için) ─────────────────────── */

export function subscribeFontsReady(cb: () => void): () => void {
  let alive = true;
  if (typeof document !== "undefined" && document.fonts) {
    void document.fonts.ready.then(() => { if (alive) cb(); });
    document.fonts.addEventListener?.("loadingdone", cb);
  }
  return () => { alive = false; if (typeof document !== "undefined") document.fonts?.removeEventListener?.("loadingdone", cb); };
}
export const fontsReady = () => typeof document !== "undefined" && (!document.fonts || document.fonts.status === "loaded");
export const fontsReadyOnServer = () => false;
