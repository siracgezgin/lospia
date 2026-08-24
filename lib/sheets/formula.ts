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

import { getCell, key, parseA1, type GridSnapshot } from "./model";

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
  | { t: "ref"; v: string }
  | { t: "name"; v: string }
  | { t: "op"; v: string }
  | { t: "("; }
  | { t: ")"; }
  | { t: ","; }
  | { t: ":"; };

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

    // Ad / referans
    if (/[A-Za-z_$ÇĞİÖŞÜçğıöşü]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_.$ÇĞİÖŞÜçğıöşü]/.test(src[j])) j++;
      const word = src.slice(i, j);
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
  | { k: "ref"; r: number; c: number }
  | { k: "range"; r1: number; c1: number; r2: number; c2: number }
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

    if (t.t === "num") return { k: "num", v: t.v };
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
      // Aralık? A1:B9
      if (this.peek()?.t === ":") {
        this.eat();
        const t2 = this.eat();
        if (!t2 || t2.t !== "ref") return null;
        const b = parseA1(t2.v)!;
        return {
          k: "range",
          r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c),
          r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c),
        };
      }
      return { k: "ref", r: a.r, c: a.c };
    }

    if (t.t === "name") {
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
  grid: GridSnapshot;
  cache: Map<string, Scalar>;
  visiting: Set<string>;
};

/** Bir hücrenin HESAPLANMIŞ değeri (formülse çözülür). */
function cellValue(ctx: EvalCtx, r: number, c: number): Scalar {
  const k = key(r, c);
  const cached = ctx.cache.get(k);
  if (cached !== undefined) return cached;
  if (ctx.visiting.has(k)) return "#DÖNGÜ!";

  const cell = getCell(ctx.grid, r, c);
  if (!cell) return "";

  if (cell.f && cell.f.trim().startsWith("=")) {
    ctx.visiting.add(k);
    const out = evalFormula(ctx, cell.f);
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
    const out: Scalar[] = [];
    for (let r = node.r1; r <= node.r2; r++)
      for (let c = node.c1; c <= node.c2; c++) out.push(cellValue(ctx, r, c));
    return out;
  }
  return [evalNode(ctx, node)];
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
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "DOĞRU" : "YANLIŞ";
  return String(v);
};

function evalNode(ctx: EvalCtx, node: Node): Scalar {
  switch (node.k) {
    case "num": return node.v;
    case "str": return node.v;
    case "ref": return cellValue(ctx, node.r, node.c);
    case "range": {
      // Tek hücrelik aralık skalerdir; çok hücreli aralık skaler bağlamda hata.
      if (node.r1 === node.r2 && node.c1 === node.c2) return cellValue(ctx, node.r1, node.c1);
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

function callFn(ctx: EvalCtx, node: Extract<Node, { k: "call" }>): Scalar {
  const name = node.name;
  const argVals = () => node.args.flatMap((a) => flatten(ctx, a));
  const first = () => (node.args[0] ? evalNode(ctx, node.args[0]) : "");

  switch (name) {
    case "SUM": case "TOPLA": {
      const ns = numsOf(argVals()); if (isError(ns)) return ns;
      return ns.reduce((s, n) => s + n, 0);
    }
    case "PRODUCT": case "ÇARPIM": {
      const ns = numsOf(argVals()); if (isError(ns)) return ns;
      return ns.length ? ns.reduce((s, n) => s * n, 1) : 0;
    }
    case "AVERAGE": case "ORTALAMA": {
      const ns = numsOf(argVals()); if (isError(ns)) return ns;
      return ns.length ? ns.reduce((s, n) => s + n, 0) / ns.length : "#BÖL/0!";
    }
    case "MIN": {
      const ns = numsOf(argVals()); if (isError(ns)) return ns;
      return ns.length ? Math.min(...ns) : 0;
    }
    case "MAX": {
      const ns = numsOf(argVals()); if (isError(ns)) return ns;
      return ns.length ? Math.max(...ns) : 0;
    }
    case "COUNT": case "SAY": {
      const ns = numsOf(argVals()); if (isError(ns)) return ns;
      return ns.length;
    }
    case "COUNTA": case "DOLUSAY":
      return argVals().filter((v) => v !== "" && v !== null && v !== undefined).length;
    case "ROUND": case "YUVARLA": {
      const a = num(first()); if (isError(a)) return a;
      const dRaw = node.args[1] ? num(evalNode(ctx, node.args[1])) : 0;
      if (isError(dRaw)) return dRaw;
      const p = Math.pow(10, Math.trunc(dRaw));
      return Math.round((a + Number.EPSILON) * p) / p;
    }
    case "ABS": case "MUTLAK": {
      const a = num(first()); return isError(a) ? a : Math.abs(a);
    }
    case "SQRT": case "KAREKÖK": {
      const a = num(first()); if (isError(a)) return a;
      return a < 0 ? "#DEĞER!" : Math.sqrt(a);
    }
    case "POWER": case "KUVVET": {
      const a = num(first()); if (isError(a)) return a;
      const b = node.args[1] ? num(evalNode(ctx, node.args[1])) : 0;
      if (isError(b)) return b;
      return Math.pow(a, b);
    }
    case "IF": case "EĞER": {
      const cond = first();
      if (isError(cond)) return cond;
      const truthy =
        typeof cond === "boolean" ? cond
        : typeof cond === "number" ? cond !== 0
        : cond !== "" && cond.toUpperCase() !== "YANLIŞ" && cond.toUpperCase() !== "FALSE";
      const branch = truthy ? node.args[1] : node.args[2];
      return branch ? evalNode(ctx, branch) : truthy;
    }
    case "IFERROR": case "EĞERHATA": {
      const v = first();
      return isError(v) ? (node.args[1] ? evalNode(ctx, node.args[1]) : "") : v;
    }
    case "AND": case "VE": {
      const vals = argVals();
      for (const v of vals) { if (isError(v)) return v; }
      return vals.every((v) => (typeof v === "number" ? v !== 0 : v === true || v === "DOĞRU"));
    }
    case "OR": case "YADA": {
      const vals = argVals();
      for (const v of vals) { if (isError(v)) return v; }
      return vals.some((v) => (typeof v === "number" ? v !== 0 : v === true || v === "DOĞRU"));
    }
    case "NOT": case "DEĞİL": {
      const v = first();
      if (isError(v)) return v;
      return !(typeof v === "number" ? v !== 0 : v === true);
    }
    case "LEN": case "UZUNLUK": return text(first()).length;
    case "UPPER": case "BÜYÜKHARF": return text(first()).toLocaleUpperCase("tr");
    case "LOWER": case "KÜÇÜKHARF": return text(first()).toLocaleLowerCase("tr");
    case "TRIM": case "KIRP": return text(first()).trim().replace(/\s+/g, " ");
    case "CONCAT": case "CONCATENATE": case "BİRLEŞTİR":
      return argVals().map(text).join("");
    case "TODAY": case "BUGÜN": {
      // Deterministik olsun diye yalnız gün hassasiyeti; saat taşınmaz.
      const d = new Date();
      return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
    }
    case "SUMIF": case "ETOPLA": {
      const rangeNode = node.args[0];
      if (!rangeNode || rangeNode.k !== "range") return "#DEĞER!";
      const crit = node.args[1] ? evalNode(ctx, node.args[1]) : "";
      const sumNode = node.args[2] ?? rangeNode;
      if (sumNode.k !== "range") return "#DEĞER!";
      let total = 0;
      const h = rangeNode.r2 - rangeNode.r1;
      const w = rangeNode.c2 - rangeNode.c1;
      for (let dr = 0; dr <= h; dr++) {
        for (let dc = 0; dc <= w; dc++) {
          const v = cellValue(ctx, rangeNode.r1 + dr, rangeNode.c1 + dc);
          if (!matchCriteria(v, crit)) continue;
          const sv = cellValue(ctx, sumNode.r1 + dr, sumNode.c1 + dc);
          const n = num(sv);
          if (!isError(n)) total += n;
        }
      }
      return total;
    }
    case "COUNTIF": case "EĞERSAY": {
      const rangeNode = node.args[0];
      if (!rangeNode || rangeNode.k !== "range") return "#DEĞER!";
      const crit = node.args[1] ? evalNode(ctx, node.args[1]) : "";
      let n = 0;
      for (let r = rangeNode.r1; r <= rangeNode.r2; r++)
        for (let c = rangeNode.c1; c <= rangeNode.c2; c++)
          if (matchCriteria(cellValue(ctx, r, c), crit)) n++;
      return n;
    }
    default:
      return "#AD?";
  }
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
export function evaluateGrid(grid: GridSnapshot): Map<string, Scalar> {
  const ctx: EvalCtx = { grid, cache: new Map(), visiting: new Set() };
  for (const k of Object.keys(grid.cells)) {
    const [r, c] = k.split(":").map(Number);
    if (Number.isFinite(r) && Number.isFinite(c)) cellValue(ctx, r, c);
  }
  return ctx.cache;
}

/** Tek bir ifadeyi ızgara bağlamında hesaplar (durum çubuğu toplamları için). */
export function evaluateOne(grid: GridSnapshot, formula: string): Scalar {
  return evalFormula({ grid, cache: new Map(), visiting: new Set() }, formula);
}
