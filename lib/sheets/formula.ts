/**
 * Formül motoru — Excel/Sheets söz dizimi.
 *
 * Aslı Hanım (2026-08-24): "Sheets kısmını tamamen Excel gibi yapalım."
 * Tablo modülünde formül HİÇ yoktu; hücreler düz metin kutusuydu, "=A1*B1"
 * yazınca ekranda "=A1*B1" görünüyordu. Bu dosya o eksiği kapatır.
 *
 * Dışarıya tek kapı: evaluateGrid() — tüm ızgarayı bir kez hesaplar ve
 * "satır:sütun" → görüntülenecek değer haritası döndürür.
 *
 * TASARIM KARARLARI
 *  • Hazır bir kütüphane KULLANILMADI. Panelin hızı yeni düzeltildi; sırf
 *    formül için ~1MB'lık bir paket taşımak mantıksızdı (kullanıcı kararı,
 *    2026-08-24).
 *  • Döngüsel referans sessizce sonsuz döngüye girmez: hesaplama sırasında
 *    ziyaret edilen hücreler işaretlenir, kendine dönen zincir #DÖNGÜ! olur.
 *  • Türkçe ondalık ayracı KABUL EDİLİR: "12,5" sayı sayılır. Ekip Excel'den
 *    kopyalayıp yapıştırıyor ve Türkçe Excel virgül yazıyor.
 *  • Hata değerleri Excel'in kendi dilinde değil, TÜRKÇE gösterilir
 *    (#BÖL/0!, #AD?, #DEĞER!) — ekran dili Türkçe.
 */

import { getCell, key, parseA1, sheetByName, type Sheet, type WorkbookSnapshot } from "./model";

export type FormulaError = "#BÖL/0!" | "#AD?" | "#DEĞER!" | "#BAŞV!" | "#DÖNGÜ!" | "#YOK";
export type Scalar = number | string | boolean | FormulaError;

const ERRORS: FormulaError[] = ["#BÖL/0!", "#AD?", "#DEĞER!", "#BAŞV!", "#DÖNGÜ!", "#YOK"];
export const isError = (v: unknown): v is FormulaError =>
  typeof v === "string" && (ERRORS as string[]).includes(v);

/** Ham metin sayı mı? Türkçe virgüllü yazım da sayılır. */
export function parseNumber(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  // Yüzde: "%20" ya da "20%"
  const pct = /^%\s*(-?[\d.,]+)$|^(-?[\d.,]+)\s*%$/.exec(t);
  if (pct) {
    const n = toNum(pct[1] ?? pct[2]);
    return n === null ? null : n / 100;
  }
  return toNum(t);
}

function toNum(s: string): number | null {
  const t = s.trim().replace(/\s/g, "");
  if (!/^-?(\d+([.,]\d+)?|[.,]\d+)$/.test(t)) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// ── Sözcükleyici ────────────────────────────────────────────────────────────

type Tok =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "ref"; v: string; sheet?: string }
  | { t: "name"; v: string; sheet?: string }
  | { t: "op"; v: string }
  | { t: "("; }
  | { t: ")"; }
  | { t: ","; }
  | { t: ":"; };

/** "A" / "$A" — tüm sütun kısayolunun yarısı. */
const COL_ONLY = /^\$?[A-Za-z]{1,3}$/;
/** "12" / "$12" — tüm satır kısayolunun yarısı. */
const ROW_ONLY = /^\$?\d{1,7}$/;

/**
 * "Sayfa2!" önekinden sonra gelen parça. Normal bir hücre olabilir (A1) ya da
 * tüm sütun / tüm satır kısayolunun yarısı olabilir (A:A, 3:3) — ikincisinde
 * ad belirteci üretilir ve aralığı ayrıştırıcı kurar.
 */
function qualifiedRef(word: string, sheet: string): Tok | null {
  if (parseA1(word)) return { t: "ref", v: word, sheet };
  if (COL_ONLY.test(word) || ROW_ONLY.test(word)) return { t: "name", v: word.toUpperCase(), sheet };
  return null;
}

function tokenize(src: string): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " " || ch === "\t" || ch === "\n") { i++; continue; }
    if (ch === "(") { out.push({ t: "(" }); i++; continue; }
    if (ch === ")") { out.push({ t: ")" }); i++; continue; }
    if (ch === "," || ch === ";") { out.push({ t: "," }); i++; continue; }
    if (ch === ":") { out.push({ t: ":" }); i++; continue; }

    if (ch === '"') {
      let j = i + 1;
      let s = "";
      while (j < src.length) {
        if (src[j] === '"') {
          if (src[j + 1] === '"') { s += '"'; j += 2; continue; }
          break;
        }
        s += src[j]; j++;
      }
      if (j >= src.length) return null; // kapanmamış tırnak
      out.push({ t: "str", v: s });
      i = j + 1;
      continue;
    }

    // Çok karakterli operatörler önce
    const two = src.slice(i, i + 2);
    if (two === "<>" || two === "<=" || two === ">=") { out.push({ t: "op", v: two }); i += 2; continue; }
    if ("+-*/^&=<>%".includes(ch)) { out.push({ t: "op", v: ch }); i++; continue; }

    // Sayı
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const n = Number(src.slice(i, j));
      if (!Number.isFinite(n)) return null;
      out.push({ t: "num", v: n });
      i = j;
      continue;
    }

    // Tırnaklı sayfa adı: 'Ürün Listesi'!A1
    if (ch === "'") {
      let j = i + 1;
      let nm = "";
      while (j < src.length && src[j] !== "'") { nm += src[j]; j++; }
      if (j >= src.length || src[j + 1] !== "!") return null;
      j += 2;
      let k2 = j;
      while (k2 < src.length && /[A-Za-z0-9$]/.test(src[k2])) k2++;
      const refWord = src.slice(j, k2);
      const tok = qualifiedRef(refWord, nm);
      if (!tok) return null;
      out.push(tok);
      i = k2;
      continue;
    }

    // Ad / referans (Sayfa2!A1 dahil)
    if (/[A-Za-z_$ÇĞİÖŞÜçğıöşü]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_.$ÇĞİÖŞÜçğıöşü]/.test(src[j])) j++;
      const word = src.slice(i, j);
      if (src[j] === "!") {
        let k2 = j + 1;
        while (k2 < src.length && /[A-Za-z0-9$]/.test(src[k2])) k2++;
        const refWord = src.slice(j + 1, k2);
        const tok = qualifiedRef(refWord, word);
        if (!tok) return null;
        out.push(tok);
        i = k2;
        continue;
      }
      out.push(parseA1(word) ? { t: "ref", v: word } : { t: "name", v: word.toUpperCase() });
      i = j;
      continue;
    }

    return null; // tanınmayan karakter
  }
  return out;
}

// ── Ayrıştırıcı (özyinelemeli iniş) ─────────────────────────────────────────

type Node =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "ref"; r: number; c: number; sheet?: string }
  /**
   * Aralık. r2 / c2 = -1 ise "sayfanın sonuna kadar" demektir — tüm sütun
   * (A:A → r2 = -1) ve tüm satır (3:3 → c2 = -1) kısayolları böyle taşınır;
   * gerçek sınır hesaplama anında DOLU alana göre daraltılır (bkz. resolveRange).
   */
  | { k: "range"; r1: number; c1: number; r2: number; c2: number; sheet?: string }
  | { k: "un"; op: string; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "pct"; a: Node }
  | { k: "call"; name: string; args: Node[] };

class Parser {
  private i = 0;
  constructor(private toks: Tok[]) {}

  private peek(): Tok | undefined { return this.toks[this.i]; }
  private eat(): Tok | undefined { return this.toks[this.i++]; }
  private isOp(...vals: string[]): boolean {
    const t = this.peek();
    return !!t && t.t === "op" && vals.includes(t.v);
  }

  parse(): Node | null {
    const n = this.compare();
    if (!n || this.i !== this.toks.length) return null;
    return n;
  }

  private compare(): Node | null {
    let a = this.concat();
    if (!a) return null;
    while (this.isOp("=", "<>", "<", ">", "<=", ">=")) {
      const op = (this.eat() as { v: string }).v;
      const b = this.concat();
      if (!b) return null;
      a = { k: "bin", op, a, b };
    }
    return a;
  }

  private concat(): Node | null {
    let a = this.addsub();
    if (!a) return null;
    while (this.isOp("&")) {
      this.eat();
      const b = this.addsub();
      if (!b) return null;
      a = { k: "bin", op: "&", a, b };
    }
    return a;
  }

  private addsub(): Node | null {
    let a = this.muldiv();
    if (!a) return null;
    while (this.isOp("+", "-")) {
      const op = (this.eat() as { v: string }).v;
      const b = this.muldiv();
      if (!b) return null;
      a = { k: "bin", op, a, b };
    }
    return a;
  }

  private muldiv(): Node | null {
    let a = this.unary();
    if (!a) return null;
    while (this.isOp("*", "/")) {
      const op = (this.eat() as { v: string }).v;
      const b = this.unary();
      if (!b) return null;
      a = { k: "bin", op, a, b };
    }
    return a;
  }

  private unary(): Node | null {
    if (this.isOp("-", "+")) {
      const op = (this.eat() as { v: string }).v;
      const a = this.unary();
      if (!a) return null;
      return op === "-" ? { k: "un", op: "-", a } : a;
    }
    return this.power();
  }

  private power(): Node | null {
    const a = this.postfix();
    if (!a) return null;
    if (this.isOp("^")) {
      this.eat();
      const b = this.unary();   // sağ birleşimli
      if (!b) return null;
      return { k: "bin", op: "^", a, b };
    }
    return a;
  }

  private postfix(): Node | null {
    let a = this.primary();
    if (!a) return null;
    while (this.isOp("%")) { this.eat(); a = { k: "pct", a }; }
    return a;
  }

  private primary(): Node | null {
    const t = this.eat();
    if (!t) return null;

    if (t.t === "num") {
      // Tüm satır kısayolu: 3:5
      if (this.peek()?.t === ":" && Number.isInteger(t.v) && t.v >= 1) {
        const save = this.i;
        this.eat();
        const t2 = this.peek();
        if (t2 && t2.t === "num" && Number.isInteger(t2.v) && t2.v >= 1) {
          this.eat();
          const r1 = Math.min(t.v, t2.v) - 1;
          const r2 = Math.max(t.v, t2.v) - 1;
          return { k: "range", r1, c1: 0, r2, c2: -1 };
        }
        this.i = save;
      }
      return { k: "num", v: t.v };
    }
    if (t.t === "str") return { k: "str", v: t.v };

    if (t.t === "(") {
      const n = this.compare();
      if (!n) return null;
      const close = this.eat();
      if (!close || close.t !== ")") return null;
      return n;
    }

    if (t.t === "ref") {
      const a = parseA1(t.v)!;
      // Aralık? A1:B9  (sayfa adı baştaki referanstan alınır)
      if (this.peek()?.t === ":") {
        this.eat();
        const t2 = this.eat();
        if (!t2 || t2.t !== "ref") return null;
        const b = parseA1(t2.v)!;
        return {
          k: "range",
          r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c),
          r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c),
          sheet: t.sheet,
        };
      }
      return { k: "ref", r: a.r, c: a.c, sheet: t.sheet };
    }

    if (t.t === "name") {
      // Tüm sütun kısayolu: A:C  (Sayfa2!A:A dahil)
      if (COL_ONLY.test(t.v) && this.peek()?.t === ":") {
        const save = this.i;
        this.eat();
        const t2 = this.peek();
        if (t2 && t2.t === "name" && COL_ONLY.test(t2.v)) {
          this.eat();
          const a = colToIndex(t.v.replace("$", ""));
          const b = colToIndex(t2.v.replace("$", ""));
          return { k: "range", r1: 0, c1: Math.min(a, b), r2: -1, c2: Math.max(a, b), sheet: t.sheet };
        }
        this.i = save;
      }
      if (t.v === "TRUE" || t.v === "DOĞRU") return { k: "num", v: 1 };
      if (t.v === "FALSE" || t.v === "YANLIŞ") return { k: "num", v: 0 };
      if (this.peek()?.t !== "(") return null;   // çıplak ad → #AD?
      this.eat();
      const args: Node[] = [];
      if (this.peek()?.t === ")") { this.eat(); return { k: "call", name: t.v, args }; }
      for (;;) {
        const a = this.compare();
        if (!a) return null;
        args.push(a);
        const nx = this.eat();
        if (!nx) return null;
        if (nx.t === ")") break;
        if (nx.t !== ",") return null;
      }
      return { k: "call", name: t.v, args };
    }

    return null;
  }
}

// ── Değerlendirici ──────────────────────────────────────────────────────────

type EvalCtx = {
  /** Formülün YAŞADIĞI sayfa — sayfa adı verilmemiş referanslar buna bakar. */
  sheet: Sheet;
  /** Kitabın tamamı; "Sayfa2!A1" için gerekli. */
  wb: WorkbookSnapshot;
  /** Önbellek anahtarı "sayfaId|satır:sütun" — sayfalar arası karışmasın. */
  cache: Map<string, Scalar>;
  visiting: Set<string>;
  /** Sayfa id → dolu alanın son satır/sütunu (tüm sütun kısayolunu daraltır). */
  bounds: Map<string, { r: number; c: number }>;
  /** Güvenlik sayacı: kötü niyetli/patolojik tabloda tarayıcı donmasın. */
  budget: { left: number };
  /** Hesaplanmakta olan hücre — SATIR()/SÜTUN() bunu okur. */
  cur: { r: number; c: number } | null;
};

const newCtx = (sheet: Sheet, wb: WorkbookSnapshot): EvalCtx => ({
  sheet, wb,
  cache: new Map(), visiting: new Set(), bounds: new Map(),
  budget: { left: 3_000_000 }, cur: null,
});

const ck = (sheetId: string, r: number, c: number) => `${sheetId}|${key(r, c)}`;

function sheetOf(ctx: EvalCtx, name?: string): Sheet | null {
  if (!name) return ctx.sheet;
  return sheetByName(ctx.wb, name) ?? null;
}

/** Sayfanın DOLU alanı — "A:A" gibi kısayollar 5000 satır taramasın. */
function usedBounds(ctx: EvalCtx, sheet: Sheet): { r: number; c: number } {
  const hit = ctx.bounds.get(sheet.id);
  if (hit) return hit;
  let mr = 0;
  let mc = 0;
  for (const k of Object.keys(sheet.cells)) {
    const sep = k.indexOf(":");
    const r = Number(k.slice(0, sep));
    const c = Number(k.slice(sep + 1));
    if (Number.isFinite(r) && r > mr) mr = r;
    if (Number.isFinite(c) && c > mc) mc = c;
  }
  const out = { r: mr, c: mc };
  ctx.bounds.set(sheet.id, out);
  return out;
}

type RangeBox = { r1: number; c1: number; r2: number; c2: number; sheet?: string };

/** Aralığın gerçek sınırları (-1 uçları dolu alana göre kapatılır). */
function resolveRange(ctx: EvalCtx, node: Extract<Node, { k: "range" }>): RangeBox | null {
  const sh = sheetOf(ctx, node.sheet);
  if (!sh) return null;
  let { r2, c2 } = node;
  if (r2 < 0 || c2 < 0) {
    const b = usedBounds(ctx, sh);
    if (r2 < 0) r2 = Math.max(node.r1, Math.min(b.r, sh.rows - 1));
    if (c2 < 0) c2 = Math.max(node.c1, Math.min(b.c, sh.cols - 1));
  }
  return { r1: node.r1, c1: node.c1, r2, c2, sheet: node.sheet };
}

/** Aralık ya da tek hücre başvurusunu kutuya çevirir (arama fonksiyonları için). */
function boxOf(ctx: EvalCtx, node: Node | undefined): RangeBox | null {
  if (!node) return null;
  if (node.k === "range") return resolveRange(ctx, node);
  if (node.k === "ref") return { r1: node.r, c1: node.c, r2: node.r, c2: node.c, sheet: node.sheet };
  return null;
}

/**
 * Bir hücrenin HESAPLANMIŞ değeri (formülse çözülür).
 * `sheetName` verilirse o sayfadan okur (sayfa yoksa #BAŞV!).
 */
function cellValue(ctx: EvalCtx, r: number, c: number, sheetName?: string): Scalar {
  let sheet = ctx.sheet;
  if (sheetName) {
    const found = sheetByName(ctx.wb, sheetName);
    if (!found) return "#BAŞV!";
    sheet = found;
  }
  const k = ck(sheet.id, r, c);
  const cached = ctx.cache.get(k);
  if (cached !== undefined) return cached;
  if (ctx.visiting.has(k)) return "#DÖNGÜ!";
  if (ctx.budget.left-- <= 0) return "#DEĞER!";

  const cell = getCell(sheet, r, c);
  if (!cell) return "";

  if (cell.f && cell.f.trim().startsWith("=")) {
    ctx.visiting.add(k);
    // Formül KENDİ sayfasının ve KENDİ konumunun bağlamında çözülür.
    const out = evalFormula({ ...ctx, sheet, cur: { r, c } }, cell.f);
    ctx.visiting.delete(k);
    ctx.cache.set(k, out);
    return out;
  }

  const raw = cell.v ?? "";
  const n = parseNumber(raw);
  const out: Scalar = n !== null ? n : raw;
  ctx.cache.set(k, out);
  return out;
}

function flatten(ctx: EvalCtx, node: Node): Scalar[] {
  if (node.k === "range") {
    const rg = resolveRange(ctx, node);
    if (!rg) return ["#BAŞV!"];
    const out: Scalar[] = [];
    for (let r = rg.r1; r <= rg.r2; r++)
      for (let c = rg.c1; c <= rg.c2; c++) out.push(cellValue(ctx, r, c, node.sheet));
    return out;
  }
  return [evalNode(ctx, node)];
}

/** Kutudaki değerleri satır satır okur (arama fonksiyonları için). */
function boxValues(ctx: EvalCtx, box: RangeBox): Scalar[][] {
  const out: Scalar[][] = [];
  for (let r = box.r1; r <= box.r2; r++) {
    const row: Scalar[] = [];
    for (let c = box.c1; c <= box.c2; c++) row.push(cellValue(ctx, r, c, box.sheet));
    out.push(row);
  }
  return out;
}

const num = (v: Scalar): number | FormulaError => {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (isError(v)) return v;
  if (v === "") return 0;
  const n = parseNumber(v);
  return n === null ? "#DEĞER!" : n;
};

const text = (v: Scalar): string => {
  // Sayı metne çevrilirken TÜRKÇE ondalık ayracı kullanılır — "=A1&" TL""
  // sonucu "12,5 TL" olmalı, "12.5 TL" değil. Tam sayı olduğu gibi yazılır.
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    return String(Number(v.toFixed(10))).replace(".", ",");
  }
  if (typeof v === "boolean") return v ? "DOĞRU" : "YANLIŞ";
  return String(v);
};

// ── Tarih yardımcıları ──────────────────────────────────────────────────────
// Bu tabloda tarih METİNDİR ("05.09.2026"). Ekip Excel'den bu biçimde
// kopyalıyor; seri numarasına çevirmek ekranı anlaşılmaz yapardı. Tarih
// fonksiyonları hem bu metni hem de Excel seri numarasını KABUL EDER, hep
// "gg.aa.yyyy" döndürür; iki tarih arasındaki farkı GÜNSAY/TAMİŞGÜNÜ verir.

const DAY_MS = 86_400_000;
const pad2 = (n: number) => String(n).padStart(2, "0");

function mkDate(y: number, mo: number, d: number): Date | null {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Skaleri tarihe çevirir; olmuyorsa null. */
function toDate(v: Scalar): Date | null {
  if (isError(v)) return null;
  if (typeof v === "number") {
    if (v <= 0 || v > 2_958_465) return null;
    const dt = new Date(Math.round((v - 25569) * DAY_MS));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const s = String(v).trim();
  let m = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/.exec(s);
  if (m) return mkDate(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return mkDate(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

const fmtDate = (d: Date) => `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
const dayNo = (d: Date) => Math.round(d.getTime() / DAY_MS);
const fromDayNo = (n: number) => new Date(n * DAY_MS);

function evalNode(ctx: EvalCtx, node: Node): Scalar {
  switch (node.k) {
    case "num": return node.v;
    case "str": return node.v;
    case "ref": return cellValue(ctx, node.r, node.c, node.sheet);
    case "range": {
      // Tek hücrelik aralık skalerdir; çok hücreli aralık skaler bağlamda hata.
      const rg = resolveRange(ctx, node);
      if (!rg) return "#BAŞV!";
      if (rg.r1 === rg.r2 && rg.c1 === rg.c2) return cellValue(ctx, rg.r1, rg.c1, node.sheet);
      return "#DEĞER!";
    }
    case "pct": {
      const a = num(evalNode(ctx, node.a));
      return isError(a) ? a : a / 100;
    }
    case "un": {
      const a = num(evalNode(ctx, node.a));
      return isError(a) ? a : -a;
    }
    case "bin": {
      const av = evalNode(ctx, node.a);
      const bv = evalNode(ctx, node.b);
      if (isError(av)) return av;
      if (isError(bv)) return bv;

      if (node.op === "&") return text(av) + text(bv);

      if (["=", "<>", "<", ">", "<=", ">="].includes(node.op)) {
        const bothNum = typeof av !== "string" || parseNumber(av) !== null;
        const cmp =
          bothNum && (typeof bv !== "string" || parseNumber(bv) !== null)
            ? compareNums(num(av), num(bv))
            : text(av).localeCompare(text(bv), "tr");
        if (isError(cmp as Scalar)) return cmp as FormulaError;
        const n = cmp as number;
        switch (node.op) {
          case "=":  return n === 0;
          case "<>": return n !== 0;
          case "<":  return n < 0;
          case ">":  return n > 0;
          case "<=": return n <= 0;
          default:   return n >= 0;
        }
      }

      const a = num(av); if (isError(a)) return a;
      const b = num(bv); if (isError(b)) return b;
      switch (node.op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return b === 0 ? "#BÖL/0!" : a / b;
        case "^": return Math.pow(a, b);
        default:  return "#DEĞER!";
      }
    }
    case "call": return callFn(ctx, node);
  }
}

function compareNums(a: number | FormulaError, b: number | FormulaError): number | FormulaError {
  if (isError(a)) return a;
  if (isError(b)) return b;
  return a === b ? 0 : a < b ? -1 : 1;
}

/** Sayısal toplama yardımcısı: metin ve boş hücreler ATLANIR (Excel gibi). */
function numsOf(vals: Scalar[]): number[] | FormulaError {
  const out: number[] = [];
  for (const v of vals) {
    if (isError(v)) return v;
    if (v === "" || v === null || v === undefined) continue;
    if (typeof v === "boolean") { out.push(v ? 1 : 0); continue; }
    if (typeof v === "number") { out.push(v); continue; }
    const n = parseNumber(v);
    if (n !== null) out.push(n);
  }
  return out;
}

/**
 * FONKSİYON KİTAPLIĞI
 *
 * Excel'de en çok kullanılan fonksiyonlar. Her fonksiyonun İngilizce adı esastır
 * (formüller Excel'den kopyalanıp yapıştırılıyor); yaygın Türkçe karşılıkları da
 * kabul edilir. Tanınmayan ad → #AD?.
 */
function callFn(ctx: EvalCtx, node: Extract<Node, { k: "call" }>): Scalar {
  const name = node.name;
  const args = node.args;
  const argVals = () => args.flatMap((a) => flatten(ctx, a));
  const at = (i: number): Scalar => (args[i] ? evalNode(ctx, args[i]) : "");
  const first = () => at(0);
  const nAt = (i: number) => num(at(i));
  const sAt = (i: number) => text(at(i));
  const optNum = (i: number, dflt: number): number | FormulaError => (args[i] ? num(at(i)) : dflt);
  const listAt = (i: number): Scalar[] => (args[i] ? flatten(ctx, args[i]) : []);
  /** Tek aralık argümanının sayıları (LARGE/RANK gibi "aralık + k" imzaları için). */
  const numsAt = (i: number) => numsOf(listAt(i));

  switch (name) {
    // ── Toplama / sayma ─────────────────────────────────────────────────────
    case "SUM": case "TOPLA": {
      const ns = numsOf(argVals()); if (isError(ns)) return ns;
      return ns.reduce((s, n) => s + n, 0);
    }
    case "PRODUCT": case "ÇARPIM": {
      const ns = numsOf(argVals()); if (isError(ns)) return ns;
      return ns.length ? ns.reduce((s, n) => s * n, 1) : 0;
    }
    case "SUMPRODUCT": case "TOPLA.ÇARPIM": {
      const cols = args.map((a) => numsOf(flatten(ctx, a)));
      for (const c of cols) if (isError(c)) return c;
      const lists = cols as number[][];
      if (!lists.length) return 0;
      const len = Math.min(...lists.map((l) => l.length));
      let total = 0;
      for (let i = 0; i < len; i++) total += lists.reduce((p, l) => p * l[i], 1);
      return total;
    }
    case "AVERAGE": case "ORTALAMA": {
      const ns = numsOf(argVals()); if (isError(ns)) return ns;
      return ns.length ? ns.reduce((s, n) => s + n, 0) / ns.length : "#BÖL/0!";
    }
    case "MEDIAN": case "ORTANCA": {
      const ns = numsOf(argVals()); if (isError(ns)) return ns;
      if (!ns.length) return "#BÖL/0!";
      const s = [...ns].sort((a, b) => a - b);
      const mid = s.length >> 1;
      return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    }
    case "MIN": case "ENKÜÇÜK": {
      const ns = numsOf(argVals()); if (isError(ns)) return ns;
      return ns.length ? Math.min(...ns) : 0;
    }
    case "MAX": case "ENBÜYÜK": {
      const ns = numsOf(argVals()); if (isError(ns)) return ns;
      return ns.length ? Math.max(...ns) : 0;
    }
    case "COUNT": case "SAY": {
      const ns = numsOf(argVals()); if (isError(ns)) return ns;
      return ns.length;
    }
    case "COUNTA": case "DOLUSAY":
      return argVals().filter((v) => v !== "" && v !== null && v !== undefined).length;
    case "COUNTBLANK": case "BOŞLUKSAY":
      return argVals().filter((v) => v === "" || v === null || v === undefined).length;
    case "LARGE": case "BÜYÜK": case "SMALL": case "KÜÇÜK": {
      const ns = numsAt(0); if (isError(ns)) return ns;
      const k = nAt(1); if (isError(k)) return k;
      const i = Math.trunc(k);
      if (i < 1 || i > ns.length) return "#YOK";
      const asc = [...ns].sort((a, b) => a - b);
      return name === "LARGE" || name === "BÜYÜK" ? asc[asc.length - i] : asc[i - 1];
    }
    case "RANK": case "RANKEŞİT": case "RANK.EŞİT": {
      const x = nAt(0); if (isError(x)) return x;
      const ns = numsAt(1); if (isError(ns)) return ns;
      const asc = optNum(2, 0);
      if (isError(asc)) return asc;
      if (!ns.includes(x)) return "#YOK";
      return asc ? ns.filter((n) => n < x).length + 1 : ns.filter((n) => n > x).length + 1;
    }
    case "STDEV": case "STDSAPMA": case "STDEVP": case "STDSAPMAS":
    case "VAR": case "VARP": {
      const ns = numsOf(argVals()); if (isError(ns)) return ns;
      const pop = name === "STDEVP" || name === "STDSAPMAS" || name === "VARP";
      const denom = pop ? ns.length : ns.length - 1;
      if (denom <= 0) return "#BÖL/0!";
      const mean = ns.reduce((s, n) => s + n, 0) / ns.length;
      const v = ns.reduce((s, n) => s + (n - mean) ** 2, 0) / denom;
      return name === "VAR" || name === "VARP" ? v : Math.sqrt(v);
    }

    // ── Matematik ───────────────────────────────────────────────────────────
    case "ROUND": case "YUVARLA":
    case "ROUNDUP": case "YUKARIYUVARLA":
    case "ROUNDDOWN": case "AŞAĞIYUVARLA": {
      const a = nAt(0); if (isError(a)) return a;
      const dRaw = optNum(1, 0); if (isError(dRaw)) return dRaw;
      const p = Math.pow(10, Math.trunc(dRaw));
      const x = (a + (a >= 0 ? Number.EPSILON : -Number.EPSILON)) * p;
      if (name === "ROUNDUP" || name === "YUKARIYUVARLA") return (a < 0 ? -Math.ceil(Math.abs(x)) : Math.ceil(x)) / p;
      if (name === "ROUNDDOWN" || name === "AŞAĞIYUVARLA") return (a < 0 ? -Math.floor(Math.abs(x)) : Math.floor(x)) / p;
      return Math.round(x) / p;
    }
    case "CEILING": case "TAVANAYUVARLA": {
      const a = nAt(0); if (isError(a)) return a;
      const s = optNum(1, 1); if (isError(s)) return s;
      if (s === 0) return 0;
      return Math.ceil(a / s) * s;
    }
    case "FLOOR": case "TABANAYUVARLA": {
      const a = nAt(0); if (isError(a)) return a;
      const s = optNum(1, 1); if (isError(s)) return s;
      if (s === 0) return "#BÖL/0!";
      return Math.floor(a / s) * s;
    }
    case "INT": case "TAMSAYI": { const a = nAt(0); return isError(a) ? a : Math.floor(a); }
    case "TRUNC": case "NSAT": {
      const a = nAt(0); if (isError(a)) return a;
      const d = optNum(1, 0); if (isError(d)) return d;
      const p = Math.pow(10, Math.trunc(d));
      return Math.trunc(a * p) / p;
    }
    case "MOD": case "MODÜLO": {
      const a = nAt(0); if (isError(a)) return a;
      const b = nAt(1); if (isError(b)) return b;
      if (b === 0) return "#BÖL/0!";
      return a - b * Math.floor(a / b);       // Excel: işaret bölene uyar
    }
    case "ABS": case "MUTLAK": { const a = nAt(0); return isError(a) ? a : Math.abs(a); }
    case "SIGN": case "İŞARET": { const a = nAt(0); return isError(a) ? a : Math.sign(a); }
    case "SQRT": case "KAREKÖK": {
      const a = nAt(0); if (isError(a)) return a;
      return a < 0 ? "#DEĞER!" : Math.sqrt(a);
    }
    case "POWER": case "KUVVET": {
      const a = nAt(0); if (isError(a)) return a;
      const b = optNum(1, 0); if (isError(b)) return b;
      return Math.pow(a, b);
    }
    case "EXP": { const a = nAt(0); return isError(a) ? a : Math.exp(a); }
    case "LN": { const a = nAt(0); if (isError(a)) return a; return a <= 0 ? "#DEĞER!" : Math.log(a); }
    case "LOG10": { const a = nAt(0); if (isError(a)) return a; return a <= 0 ? "#DEĞER!" : Math.log10(a); }
    case "LOG": {
      const a = nAt(0); if (isError(a)) return a;
      const b = optNum(1, 10); if (isError(b)) return b;
      if (a <= 0 || b <= 0 || b === 1) return "#DEĞER!";
      return Math.log(a) / Math.log(b);
    }
    case "PI": return Math.PI;

    // ── Mantık ──────────────────────────────────────────────────────────────
    case "IF": case "EĞER": {
      const cond = first();
      if (isError(cond)) return cond;
      const branch = truthy(cond) ? args[1] : args[2];
      return branch ? evalNode(ctx, branch) : truthy(cond);
    }
    case "IFS": case "ÇOKEĞER": {
      for (let i = 0; i + 1 < args.length; i += 2) {
        const c = evalNode(ctx, args[i]);
        if (isError(c)) return c;
        if (truthy(c)) return evalNode(ctx, args[i + 1]);
      }
      return "#YOK";
    }
    case "IFERROR": case "EĞERHATA": {
      const v = first();
      return isError(v) ? (args[1] ? evalNode(ctx, args[1]) : "") : v;
    }
    case "IFNA": case "EĞERYOKSA": {
      const v = first();
      return v === "#YOK" ? (args[1] ? evalNode(ctx, args[1]) : "") : v;
    }
    case "AND": case "VE": {
      const vals = argVals();
      for (const v of vals) if (isError(v)) return v;
      return vals.filter((v) => v !== "").every(truthy);
    }
    case "OR": case "YADA": case "VEYA": {
      const vals = argVals();
      for (const v of vals) if (isError(v)) return v;
      return vals.filter((v) => v !== "").some(truthy);
    }
    case "XOR": {
      const vals = argVals();
      for (const v of vals) if (isError(v)) return v;
      return vals.filter((v) => v !== "" && truthy(v)).length % 2 === 1;
    }
    case "NOT": case "DEĞİL": {
      const v = first();
      return isError(v) ? v : !truthy(v);
    }
    case "TRUE": case "DOĞRU": return true;
    case "FALSE": case "YANLIŞ": return false;
    case "NA": case "YOKSAY": return "#YOK";

    // ── Bilgi ───────────────────────────────────────────────────────────────
    case "ISNUMBER": case "ESAYIYSA": {
      const v = first();
      return !isError(v) && (typeof v === "number" || (v !== "" && parseNumber(String(v)) !== null));
    }
    case "ISTEXT": case "EMETİNSE": {
      const v = first();
      return !isError(v) && typeof v === "string" && v !== "" && parseNumber(v) === null;
    }
    case "ISBLANK": case "EBOŞSA": return first() === "";
    case "ISERROR": case "EHATALIYSA": return isError(first());

    // ── Ölçütlü toplama / sayma ─────────────────────────────────────────────
    case "SUMIF": case "ETOPLA": case "AVERAGEIF": case "ETOPORTALAMA": {
      const box = boxOf(ctx, args[0]);
      if (!box) return "#DEĞER!";
      const crit = at(1);
      if (isError(crit)) return crit;
      const target = args[2] ? boxOf(ctx, args[2]) : box;
      if (!target) return "#DEĞER!";
      let total = 0;
      let hits = 0;
      for (let dr = 0; dr <= box.r2 - box.r1; dr++) {
        for (let dc = 0; dc <= box.c2 - box.c1; dc++) {
          if (!matchCriteria(cellValue(ctx, box.r1 + dr, box.c1 + dc, box.sheet), crit)) continue;
          const n = num(cellValue(ctx, target.r1 + dr, target.c1 + dc, target.sheet));
          if (!isError(n)) { total += n; hits++; }
        }
      }
      if (name === "SUMIF" || name === "ETOPLA") return total;
      return hits ? total / hits : "#BÖL/0!";
    }
    case "COUNTIF": case "EĞERSAY": {
      const box = boxOf(ctx, args[0]);
      if (!box) return "#DEĞER!";
      const crit = at(1);
      if (isError(crit)) return crit;
      let n = 0;
      for (let r = box.r1; r <= box.r2; r++)
        for (let c = box.c1; c <= box.c2; c++)
          if (matchCriteria(cellValue(ctx, r, c, box.sheet), crit)) n++;
      return n;
    }
    case "SUMIFS": case "ÇOKETOPLA":
    case "COUNTIFS": case "ÇOKEĞERSAY":
    case "AVERAGEIFS": case "ÇOKETOPORTALAMA": {
      const counting = name === "COUNTIFS" || name === "ÇOKEĞERSAY";
      const target = counting ? null : boxOf(ctx, args[0]);
      if (!counting && !target) return "#DEĞER!";
      const rest = counting ? args : args.slice(1);
      const pairs: { box: RangeBox; crit: Scalar }[] = [];
      for (let i = 0; i + 1 < rest.length; i += 2) {
        const b = boxOf(ctx, rest[i]);
        if (!b) return "#DEĞER!";
        const cv = evalNode(ctx, rest[i + 1]);
        if (isError(cv)) return cv;
        pairs.push({ box: b, crit: cv });
      }
      if (!pairs.length) return "#DEĞER!";
      const base = pairs[0].box;
      let total = 0;
      let hits = 0;
      for (let dr = 0; dr <= base.r2 - base.r1; dr++) {
        for (let dc = 0; dc <= base.c2 - base.c1; dc++) {
          const ok = pairs.every((p) =>
            matchCriteria(cellValue(ctx, p.box.r1 + dr, p.box.c1 + dc, p.box.sheet), p.crit));
          if (!ok) continue;
          hits++;
          if (target) {
            const n = num(cellValue(ctx, target.r1 + dr, target.c1 + dc, target.sheet));
            if (!isError(n)) total += n;
          }
        }
      }
      if (counting) return hits;
      if (name === "SUMIFS" || name === "ÇOKETOPLA") return total;
      return hits ? total / hits : "#BÖL/0!";
    }

    // ── Arama ───────────────────────────────────────────────────────────────
    case "VLOOKUP": case "DÜŞEYARA": case "HLOOKUP": case "YATAYARA": {
      const lookup = at(0);
      if (isError(lookup)) return lookup;
      const box = boxOf(ctx, args[1]);
      if (!box) return "#DEĞER!";
      const idx = nAt(2);
      if (isError(idx)) return idx;
      const i = Math.trunc(idx);
      // Excel'in "yaklaşık" varsayılanı sıralı olmayan veride SESSİZCE yanlış
      // sonuç verir; burada varsayılan TAM eşleşmedir (bulunamazsa #YOK).
      const approx = args[3] ? truthy(at(3)) : false;
      const vertical = name === "VLOOKUP" || name === "DÜŞEYARA";
      const span = vertical ? box.r2 - box.r1 : box.c2 - box.c1;
      const depth = vertical ? box.c2 - box.c1 + 1 : box.r2 - box.r1 + 1;
      if (i < 1 || i > depth) return "#BAŞV!";
      let found = -1;
      for (let k = 0; k <= span; k++) {
        const v = vertical
          ? cellValue(ctx, box.r1 + k, box.c1, box.sheet)
          : cellValue(ctx, box.r1, box.c1 + k, box.sheet);
        const cmp = looseCompare(v, lookup);
        if (cmp === 0) { found = k; break; }
        if (approx && cmp !== null && cmp < 0) found = k;
      }
      if (found < 0) return "#YOK";
      return vertical
        ? cellValue(ctx, box.r1 + found, box.c1 + i - 1, box.sheet)
        : cellValue(ctx, box.r1 + i - 1, box.c1 + found, box.sheet);
    }
    case "MATCH": case "KAÇINCI": {
      const lookup = at(0);
      if (isError(lookup)) return lookup;
      const box = boxOf(ctx, args[1]);
      if (!box) return "#DEĞER!";
      const mode = args[2] ? num(at(2)) : 0;
      if (isError(mode)) return mode;
      const vals = boxValues(ctx, box).flat();
      let best = -1;
      for (let k = 0; k < vals.length; k++) {
        const cmp = looseCompare(vals[k], lookup);
        if (cmp === 0) { best = k; break; }
        if (mode === 1 && cmp !== null && cmp < 0) best = k;
        if (mode === -1 && cmp !== null && cmp > 0) best = k;
      }
      return best < 0 ? "#YOK" : best + 1;
    }
    case "INDEX": case "İNDİS": {
      const box = boxOf(ctx, args[0]);
      if (!box) return "#DEĞER!";
      const h = box.r2 - box.r1 + 1;
      const w = box.c2 - box.c1 + 1;
      const a = args[1] ? num(at(1)) : 0;
      if (isError(a)) return a;
      const b = args[2] ? num(at(2)) : 0;
      if (isError(b)) return b;
      // Tek satırlık/sütunluk aralıkta tek argüman o eksende ilerler.
      let rr = Math.trunc(a);
      let cc = Math.trunc(b);
      if (!args[2]) { if (h === 1) { cc = rr; rr = 1; } else cc = 1; }
      if (rr < 1 || rr > h || cc < 1 || cc > w) return "#BAŞV!";
      return cellValue(ctx, box.r1 + rr - 1, box.c1 + cc - 1, box.sheet);
    }
    case "ROW": case "SATIR": {
      const box = args[0] ? boxOf(ctx, args[0]) : null;
      if (box) return box.r1 + 1;
      return ctx.cur ? ctx.cur.r + 1 : "#DEĞER!";
    }
    case "COLUMN": case "SÜTUN": {
      const box = args[0] ? boxOf(ctx, args[0]) : null;
      if (box) return box.c1 + 1;
      return ctx.cur ? ctx.cur.c + 1 : "#DEĞER!";
    }
    case "ROWS": case "SATIRSAY": {
      const box = boxOf(ctx, args[0]);
      return box ? box.r2 - box.r1 + 1 : "#DEĞER!";
    }
    case "COLUMNS": case "SÜTUNSAY": {
      const box = boxOf(ctx, args[0]);
      return box ? box.c2 - box.c1 + 1 : "#DEĞER!";
    }

    // ── Metin ───────────────────────────────────────────────────────────────
    case "LEN": case "UZUNLUK": return sAt(0).length;
    case "UPPER": case "BÜYÜKHARF": return sAt(0).toLocaleUpperCase("tr");
    case "LOWER": case "KÜÇÜKHARF": return sAt(0).toLocaleLowerCase("tr");
    case "PROPER": case "YAZIM.DÜZENİ":
      return sAt(0).toLocaleLowerCase("tr").replace(/(^|[\s\-'/(])([\p{L}])/gu,
        (_m, p1: string, p2: string) => p1 + p2.toLocaleUpperCase("tr"));
    case "TRIM": case "KIRP": return sAt(0).trim().replace(/\s+/g, " ");
    case "LEFT": case "SOLDAN": {
      const k = optNum(1, 1); if (isError(k)) return k;
      return sAt(0).slice(0, Math.max(0, Math.trunc(k)));
    }
    case "RIGHT": case "SAĞDAN": {
      const k = optNum(1, 1); if (isError(k)) return k;
      const s = sAt(0);
      const n = Math.max(0, Math.trunc(k));
      return n === 0 ? "" : s.slice(Math.max(0, s.length - n));
    }
    case "MID": case "PARÇAAL": case "ORTADAN": {
      const start = nAt(1); if (isError(start)) return start;
      const len = nAt(2); if (isError(len)) return len;
      if (start < 1 || len < 0) return "#DEĞER!";
      const i0 = Math.trunc(start) - 1;
      return sAt(0).slice(i0, i0 + Math.trunc(len));
    }
    case "FIND": case "BUL": case "SEARCH": case "MBUL": {
      const insensitive = name === "SEARCH" || name === "MBUL";
      const needle = insensitive ? sAt(0).toLocaleLowerCase("tr") : sAt(0);
      const hay = insensitive ? sAt(1).toLocaleLowerCase("tr") : sAt(1);
      const from = optNum(2, 1); if (isError(from)) return from;
      const at0 = hay.indexOf(needle, Math.max(0, Math.trunc(from) - 1));
      return at0 < 0 ? "#DEĞER!" : at0 + 1;
    }
    case "SUBSTITUTE": case "YERİNEKOY": {
      const s = sAt(0);
      const oldT = sAt(1);
      const newT = sAt(2);
      if (!oldT) return s;
      if (!args[3]) return s.split(oldT).join(newT);
      const which = num(at(3)); if (isError(which)) return which;
      let seen = 0;
      let idx = s.indexOf(oldT);
      while (idx >= 0) {
        seen++;
        if (seen === Math.trunc(which)) return s.slice(0, idx) + newT + s.slice(idx + oldT.length);
        idx = s.indexOf(oldT, idx + oldT.length);
      }
      return s;
    }
    case "REPLACE": case "DEĞİŞTİR": {
      const s = sAt(0);
      const start = nAt(1); if (isError(start)) return start;
      const len = nAt(2); if (isError(len)) return len;
      const i0 = Math.max(0, Math.trunc(start) - 1);
      return s.slice(0, i0) + sAt(3) + s.slice(i0 + Math.max(0, Math.trunc(len)));
    }
    case "REPT": case "YİNELE": {
      const k = nAt(1); if (isError(k)) return k;
      const n = Math.max(0, Math.min(5000, Math.trunc(k)));
      return sAt(0).repeat(n);
    }
    case "EXACT": case "ÖZDEŞ": return sAt(0) === sAt(1);
    case "CONCAT": case "CONCATENATE": case "BİRLEŞTİR":
      return argVals().map((v) => (isError(v) ? v : text(v))).join("");
    case "TEXTJOIN": case "METİNBİRLEŞTİR": {
      const sep = sAt(0);
      const skipEmpty = args[1] ? truthy(at(1)) : true;
      const rest = args.slice(2).flatMap((a) => flatten(ctx, a));
      return rest.filter((v) => !skipEmpty || v !== "").map(text).join(sep);
    }
    case "VALUE": case "SAYIYAÇEVİR": {
      const n = parseNumber(sAt(0));
      return n === null ? "#DEĞER!" : n;
    }
    case "TEXT": case "METNEÇEVİR": return formatByPattern(at(0), sAt(1));

    // ── Tarih ───────────────────────────────────────────────────────────────
    case "TODAY": case "BUGÜN": {
      const d = new Date();
      return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
    }
    case "NOW": case "ŞİMDİ": {
      const d = new Date();
      return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    }
    case "DATE": case "TARİH": {
      const y = nAt(0); if (isError(y)) return y;
      const m = nAt(1); if (isError(m)) return m;
      const d = nAt(2); if (isError(d)) return d;
      const dt = mkDate(Math.trunc(y), Math.trunc(m), Math.trunc(d));
      return dt ? fmtDate(dt) : "#DEĞER!";
    }
    case "YEAR": case "YIL": { const d = toDate(first()); return d ? d.getUTCFullYear() : "#DEĞER!"; }
    case "MONTH": case "AY": { const d = toDate(first()); return d ? d.getUTCMonth() + 1 : "#DEĞER!"; }
    case "DAY": case "GÜN": { const d = toDate(first()); return d ? d.getUTCDate() : "#DEĞER!"; }
    case "WEEKDAY": case "HAFTANINGÜNÜ": {
      const d = toDate(first());
      if (!d) return "#DEĞER!";
      const type = optNum(1, 1); if (isError(type)) return type;
      const js = d.getUTCDay();                       // 0 = Pazar
      return type === 2 ? (js === 0 ? 7 : js) : js + 1;
    }
    case "DAYS": case "GÜNSAY": {
      const a = toDate(at(0));
      const b = toDate(at(1));
      if (!a || !b) return "#DEĞER!";
      return dayNo(a) - dayNo(b);
    }
    case "EDATE": case "SERİTARİH": case "EOMONTH": case "SERİAY": {
      const d = toDate(first());
      if (!d) return "#DEĞER!";
      const k = optNum(1, 0); if (isError(k)) return k;
      const monthEnd = name === "EOMONTH" || name === "SERİAY";
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth() + Math.trunc(k);
      const out = monthEnd
        ? new Date(Date.UTC(y, m + 1, 0))
        : new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), new Date(Date.UTC(y, m + 1, 0)).getUTCDate())));
      return Number.isNaN(out.getTime()) ? "#DEĞER!" : fmtDate(out);
    }
    case "NETWORKDAYS": case "TAMİŞGÜNÜ": {
      const a = toDate(at(0));
      const b = toDate(at(1));
      if (!a || !b) return "#DEĞER!";
      const holidays = new Set(
        listAt(2).map(toDate).filter((d): d is Date => d !== null).map(dayNo),
      );
      const from = Math.min(dayNo(a), dayNo(b));
      const to = Math.max(dayNo(a), dayNo(b));
      if (to - from > 40_000) return "#DEĞER!";
      let n = 0;
      for (let i = from; i <= to; i++) {
        const wd = fromDayNo(i).getUTCDay();
        if (wd === 0 || wd === 6 || holidays.has(i)) continue;
        n++;
      }
      return dayNo(a) <= dayNo(b) ? n : -n;
    }

    default:
      return "#AD?";
  }
}

/** Excel'in "doğru mu?" testi: sayı ≠ 0, DOĞRU, boş olmayan metin. */
function truthy(v: Scalar): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (isError(v)) return false;
  const t = v.trim().toLocaleUpperCase("tr");
  if (t === "" || t === "YANLIŞ" || t === "FALSE" || t === "0") return false;
  return true;
}

/** Arama karşılaştırması: sayı-sayı sayısal, aksi hâlde metin. Kıyas yoksa null. */
function looseCompare(a: Scalar, b: Scalar): number | null {
  if (isError(a) || isError(b)) return null;
  const an = typeof a === "number" ? a : parseNumber(String(a));
  const bn = typeof b === "number" ? b : parseNumber(String(b));
  if (an !== null && bn !== null) return an === bn ? 0 : an < bn ? -1 : 1;
  const as = text(a).trim().toLocaleLowerCase("tr");
  const bs = text(b).trim().toLocaleLowerCase("tr");
  return as === bs ? 0 : as < bs ? -1 : 1;
}

/**
 * METNEÇEVİR(değer; biçim) — Excel'in tam biçim dili yerine en çok kullanılan
 * kalıplar: "0", "0,00", "#.##0,00", "%0", "gg.aa.yyyy".
 */
function formatByPattern(v: Scalar, pattern: string): Scalar {
  if (isError(v)) return v;
  const p = pattern.trim();
  if (!p) return text(v);
  if (/[gaydmy]/i.test(p) && /[.\-/]/.test(p)) {
    const d = toDate(v);
    if (!d) return text(v);
    const map: Record<string, string> = {
      yyyy: String(d.getUTCFullYear()), yy: String(d.getUTCFullYear()).slice(2),
      aa: pad2(d.getUTCMonth() + 1), mm: pad2(d.getUTCMonth() + 1),
      gg: pad2(d.getUTCDate()), dd: pad2(d.getUTCDate()),
    };
    return p.toLowerCase().replace(/yyyy|yy|aa|mm|gg|dd/g, (m) => map[m] ?? m);
  }
  const n = num(v);
  if (isError(n)) return text(v);
  const percent = p.includes("%");
  const grouping = /[#0][.,][#0]{3}/.test(p) || p.includes("#.##0") || p.includes("#,##0");
  const decPart = /[.,](0+)(?!.*[.,]0)/.exec(p.replace(/#/g, ""));
  const digits = decPart ? decPart[1].length : 0;
  return (percent ? n * 100 : n).toLocaleString("tr-TR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: grouping,
  }) + (percent ? "%" : "");
}

/** SUMIF/COUNTIF ölçütü: ">10", "<=5", "<>x" ya da düz eşitlik. */
function matchCriteria(v: Scalar, crit: Scalar): boolean {
  if (isError(v)) return false;
  const cs = typeof crit === "string" ? crit.trim() : String(crit);
  const m = /^(<=|>=|<>|<|>|=)?\s*(.*)$/.exec(cs);
  const op = m?.[1] ?? "=";
  const rhsRaw = m?.[2] ?? "";
  const rhsNum = parseNumber(rhsRaw);
  const lhsNum = typeof v === "number" ? v : parseNumber(String(v));

  if (rhsNum !== null && lhsNum !== null) {
    switch (op) {
      case ">":  return lhsNum > rhsNum;
      case "<":  return lhsNum < rhsNum;
      case ">=": return lhsNum >= rhsNum;
      case "<=": return lhsNum <= rhsNum;
      case "<>": return lhsNum !== rhsNum;
      default:   return lhsNum === rhsNum;
    }
  }
  const a = text(v).toLocaleLowerCase("tr");
  const b = rhsRaw.toLocaleLowerCase("tr");
  // Joker karakterler: * (herhangi) ve ? (tek karakter) — Excel'deki gibi.
  if (/[*?]/.test(b)) {
    const rx = new RegExp("^" + b.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
    return op === "<>" ? !rx.test(a) : rx.test(a);
  }
  if (op === ">" || op === "<" || op === ">=" || op === "<=") {
    const cmp = a === b ? 0 : a < b ? -1 : 1;
    return op === ">" ? cmp > 0 : op === "<" ? cmp < 0 : op === ">=" ? cmp >= 0 : cmp <= 0;
  }
  return op === "<>" ? a !== b : a === b;
}

function evalFormula(ctx: EvalCtx, formula: string): Scalar {
  const src = formula.trim().replace(/^=/, "");
  if (!src.trim()) return "";
  const toks = tokenize(src);
  if (!toks) return "#DEĞER!";
  const ast = new Parser(toks).parse();
  if (!ast) return "#AD?";
  return evalNode(ctx, ast);
}

/**
 * Tüm ızgarayı hesaplar.
 * Dönen harita: "satır:sütun" → hesaplanmış skaler. Yalnız DOLU hücreler
 * bulunur; boş hücre haritada yoktur.
 */
export function evaluateSheet(wb: WorkbookSnapshot, sheet: Sheet): Map<string, Scalar> {
  const ctx: EvalCtx = newCtx(sheet, wb);
  for (const k of Object.keys(sheet.cells)) {
    const [r, c] = k.split(":").map(Number);
    if (Number.isFinite(r) && Number.isFinite(c)) cellValue(ctx, r, c);
  }
  // Dışarıya SADE anahtar ("satır:sütun") döndür — çizim tarafı sayfa
  // önekiyle uğraşmasın.
  const out = new Map<string, Scalar>();
  const prefix = `${sheet.id}|`;
  for (const [k, v] of ctx.cache) {
    if (k.startsWith(prefix)) out.set(k.slice(prefix.length), v);
  }
  return out;
}

/** Tek bir ifadeyi sayfa bağlamında hesaplar. */
export function evaluateOne(wb: WorkbookSnapshot, sheet: Sheet, formula: string): Scalar {
  return evalFormula(newCtx(sheet, wb), formula);
}

/**
 * Formül çubuğundaki "fx" yardımının içeriği. Ekip Excel'den geliyor; hangi
 * fonksiyonun DESTEKLENDİĞİNİ görmeden yazmak deneme-yanılmaya dönüyordu.
 */
export const FUNCTION_HINTS: { group: string; items: string[] }[] = [
  {
    group: "Toplama ve sayma",
    items: [
      "TOPLA(A1:A10)", "ORTALAMA(A1:A10)", "SAY(A1:A10)", "DOLUSAY(A1:A10)",
      "ENKÜÇÜK / MIN(A1:A10)", "ENBÜYÜK / MAX(A1:A10)", "ORTANCA(A1:A10)",
      "ÇARPIM(A1:A10)", "TOPLA.ÇARPIM(A1:A10;B1:B10)", "STDSAPMA(A1:A10)",
      "BÜYÜK(A1:A10;2)", "KÜÇÜK(A1:A10;2)", "RANK(A1;A1:A10)",
    ],
  },
  {
    group: "Koşullu",
    items: [
      "EĞER(A1>10;\"Evet\";\"Hayır\")", "ÇOKEĞER(A1>90;\"A\";A1>80;\"B\")",
      "EĞERHATA(A1/B1;0)", "VE(A1>0;B1>0)", "YADA(A1>0;B1>0)", "DEĞİL(A1)",
      "ETOPLA(B:B;\">100\";C:C)", "EĞERSAY(B:B;\"Tamam\")",
      "ÇOKETOPLA(C:C;A:A;\"Ali\";B:B;\">10\")", "ÇOKEĞERSAY(A:A;\"Ali\";B:B;\">10\")",
      "ETOPORTALAMA(B:B;\">0\")",
    ],
  },
  {
    group: "Arama",
    items: [
      "DÜŞEYARA(\"Kod\";A:C;3)", "YATAYARA(\"Kod\";A1:F2;2)",
      "İNDİS(A1:C10;2;3)", "KAÇINCI(\"Kod\";A:A)", "SATIR()", "SÜTUN()",
    ],
  },
  {
    group: "Metin",
    items: [
      "BİRLEŞTİR(A1;\" \";B1)", "METİNBİRLEŞTİR(\", \";DOĞRU;A1:A5)",
      "SOLDAN(A1;3)", "SAĞDAN(A1;3)", "PARÇAAL(A1;2;4)", "UZUNLUK(A1)",
      "KIRP(A1)", "BÜYÜKHARF(A1)", "KÜÇÜKHARF(A1)", "YAZIM.DÜZENİ(A1)",
      "BUL(\"x\";A1)", "YERİNEKOY(A1;\"a\";\"b\")", "METNEÇEVİR(A1;\"#.##0,00\")",
    ],
  },
  {
    group: "Matematik",
    items: [
      "YUVARLA(A1;2)", "YUKARIYUVARLA(A1;0)", "AŞAĞIYUVARLA(A1;0)",
      "MUTLAK(A1)", "KAREKÖK(A1)", "KUVVET(A1;2)", "MOD(A1;3)", "TAMSAYI(A1)",
    ],
  },
  {
    group: "Tarih",
    items: [
      "BUGÜN()", "ŞİMDİ()", "TARİH(2026;9;5)", "YIL(A1)", "AY(A1)", "GÜN(A1)",
      "GÜNSAY(B1;A1)", "SERİAY(A1;1)", "TAMİŞGÜNÜ(A1;B1)",
    ],
  },
];

// ── Doldurma için referans kaydırma ─────────────────────────────────────────

/**
 * Formüldeki GÖRECELİ referansları kaydırır — doldurma tutamağının temeli.
 * "=A1*B1" bir satır aşağı çekilince "=A2*B2" olmalı; "$A$1" sabit kalır.
 * Metin sabitleri ("...") ve sayfa adları korunur.
 */
export function shiftFormula(formula: string, dr: number, dc: number): string {
  if (!formula.startsWith("=") || (dr === 0 && dc === 0)) return formula;
  let out = "";
  let i = 1;
  const src = formula;
  while (i < src.length) {
    const ch = src[i];
    // Metin sabiti — dokunma
    if (ch === '"') {
      let j = i + 1;
      while (j < src.length && !(src[j] === '"' && src[j + 1] !== '"')) j += src[j] === '"' ? 2 : 1;
      out += src.slice(i, Math.min(j + 1, src.length));
      i = j + 1;
      continue;
    }
    // Sayfa adı öneki — olduğu gibi taşı ("Sayfa2!" ya da "'Ad'!")
    if (ch === "'") {
      const close = src.indexOf("'", i + 1);
      if (close > 0 && src[close + 1] === "!") {
        out += src.slice(i, close + 2);
        i = close + 2;
        continue;
      }
    }
    // Referans?
    const m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})/.exec(src.slice(i));
    if (m && !/[A-Za-z0-9_]/.test(src[i - 1] ?? "")) {
      const [whole, colAbs, colTxt, rowAbs, rowTxt] = m;
      // Fonksiyon adı olabilir (SUM( gibi) — ardından "(" geliyorsa referans değil
      const after = src[i + whole.length];
      if (after !== "(") {
        const c0 = colToIndex(colTxt);
        const r0 = Number(rowTxt) - 1;
        const nc = colAbs ? c0 : c0 + dc;
        const nr = rowAbs ? r0 : r0 + dr;
        if (nc < 0 || nr < 0) { out += "#BAŞV!"; i += whole.length; continue; }
        out += `${colAbs}${indexToCol(nc)}${rowAbs}${nr + 1}`;
        i += whole.length;
        continue;
      }
    }
    out += ch;
    i++;
  }
  return "=" + out;
}

function colToIndex(name: string): number {
  let n = 0;
  for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
function indexToCol(index: number): string {
  let name = "";
  let i = index;
  do { name = String.fromCharCode(65 + (i % 26)) + name; i = Math.floor(i / 26) - 1; } while (i >= 0);
  return name;
}
