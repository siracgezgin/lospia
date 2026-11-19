/**
 * YAZI → GERÇEK .docx
 *
 * "Word olarak indir" eskiden HTML'i `.doc` uzantısıyla kaydediyordu: Word
 * açarken "dosya biçimi ile uzantısı uyuşmuyor" diye soruyor, Pages ve
 * telefonlar hiç açmıyor, görseller dosyaya girmiyordu (internet adresi olarak
 * kalıyordu). Burada paket elle kurulur: .docx bir ZIP'tir, içinde birkaç XML.
 *
 * Yeni bağımlılık YOK — `jszip` zaten projede (Excel içe aktarımı kullanıyor)
 * ve yalnız indirme anında yüklenir.
 *
 * Kaynak, editörün CANLI DOM'udur ve biçim HESAPLANMIŞ stilden okunur
 * (getComputedStyle): kalın, italik, renk, punto, yazı tipi nereden gelirse
 * gelsin (etiket, satır içi stil, yapıştırılmış Word biçimi) ekranda ne
 * görünüyorsa o yazılır.
 *
 * Taşınanlar: başlıklar, paragraf (hiza, satır aralığı, girinti), kalın /
 * italik / altı çizili / üstü çizili / alt-üst simge, yazı tipi, punto, renk,
 * vurgu, bağlantı, madde ve numara listeleri (iç içe), tablo (birleşik
 * hücreler dahil), yatay çizgi, satır sonu ve GÖMÜLÜ görseller.
 */

const TWIP_PER_PX = 15;
const EMU_PER_PX = 9525;
/** A4, 2,54 cm kenar boşluğu. */
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN = 1440;
const CONTENT_PX = (PAGE_W - 2 * MARGIN) / TWIP_PER_PX;

const BLOCK_TAGS = new Set([
  "P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "BLOCKQUOTE", "TABLE", "HR", "PRE",
  "SECTION", "ARTICLE", "HEADER", "FOOTER", "FIGURE", "FIGCAPTION", "DL", "DT", "DD", "ADDRESS",
]);

const esc = (s: string) =>
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** "rgb(1, 2, 3)" → "010203"; saydam ya da okunamayan renk null. */
function hex(css: string): string | null {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/.exec(css);
  if (!m) return null;
  if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;
  return [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Ekran yazı tipi Word'de yoksa bozuk ikame olur; arayüz yazı tipi Calibri'ye iner. */
function fontName(family: string): string {
  const first = family.split(",")[0].trim().replace(/^["']|["']$/g, "");
  if (!first || /^(inter|system-ui|ui-sans-serif|-apple-system|blinkmacsystemfont|sans-serif|segoe ui)$/i.test(first)) return "Calibri";
  if (/^(ui-monospace|sfmono-regular|menlo|monospace)$/i.test(first)) return "Consolas";
  if (/^(ui-serif|serif)$/i.test(first)) return "Georgia";
  return first;
}

interface ListCtx { numId: number; level: number }
interface Ctx {
  root: HTMLElement;
  baseColor: string | null;
  rels: string[];
  media: { name: string; data: ArrayBuffer }[];
  nums: { numId: number; ordered: boolean; start: number }[];
  drawingId: number;
  indent: number;           // twip
  list: ListCtx | null;
  listUsed: boolean;        // bu <li> için numara paragrafı yazıldı mı
  link: string | null;      // etkin köprünün ilişki kimliği
}

const isBlock = (n: Node): n is HTMLElement => n.nodeType === 1 && BLOCK_TAGS.has((n as HTMLElement).tagName);
const hasBlockChild = (el: HTMLElement) => [...el.childNodes].some(isBlock);

/* ── Karakter biçimi ───────────────────────────────────────────────────── */

function runProps(el: HTMLElement, ctx: Ctx): string {
  const cs = getComputedStyle(el);
  /* Alt/üst simge etiketi kendi puntosunu küçültür; Word bunu `vertAlign` ile
     KENDİSİ yapar — punto simgenin DIŞINDAKİ metinden alınır. Altı/üstü çizili
     ve vurgu kalıtılmaz (görsel olarak yayılır): bloğa kadar atalara bakılır. */
  let vert: "subscript" | "superscript" | null = null;
  let underline = false, strike = false;
  let shade: string | null = null;
  let sizeEl: HTMLElement = el;
  for (let a: HTMLElement | null = el; a && a !== ctx.root.parentElement; a = a.parentElement) {
    const s = getComputedStyle(a);
    if (!vert && (a.tagName === "SUB" || s.verticalAlign === "sub")) { vert = "subscript"; sizeEl = a.parentElement ?? a; }
    if (!vert && (a.tagName === "SUP" || s.verticalAlign === "super")) { vert = "superscript"; sizeEl = a.parentElement ?? a; }
    const line = s.textDecorationLine;
    if (line.includes("underline")) underline = true;
    if (line.includes("line-through")) strike = true;
    if (BLOCK_TAGS.has(a.tagName) || a === ctx.root) break;
    if (!shade) shade = hex(s.backgroundColor);
  }
  const px = parseFloat(getComputedStyle(sizeEl).fontSize) || 16;
  const half = Math.max(2, Math.round(px * 0.75 * 2));
  const font = esc(fontName(cs.fontFamily));
  const color = hex(cs.color);
  let out = `<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/>`;
  if (Number(cs.fontWeight) >= 600) out += "<w:b/><w:bCs/>";
  if (cs.fontStyle === "italic" || cs.fontStyle === "oblique") out += "<w:i/><w:iCs/>";
  if (strike) out += "<w:strike/>";
  if (color && color !== ctx.baseColor) out += `<w:color w:val="${color}"/>`;
  out += `<w:sz w:val="${half}"/><w:szCs w:val="${half}"/>`;
  if (underline) out += '<w:u w:val="single"/>';
  if (shade) out += `<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>`;
  if (vert) out += `<w:vertAlign w:val="${vert}"/>`;
  return `<w:rPr>${out}</w:rPr>`;
}

/* ── Görsel ────────────────────────────────────────────────────────────── */

async function imageRun(img: HTMLImageElement, ctx: Ctx): Promise<string> {
  const src = img.currentSrc || img.src;
  if (!src) return "";
  try {
    const res = await fetch(src, { mode: "cors" });
    if (!res.ok) return "";
    let blob = await res.blob();
    let ext = /png/i.test(blob.type) ? "png" : /jpe?g/i.test(blob.type) ? "jpeg" : /gif/i.test(blob.type) ? "gif" : "";
    if (!ext) {
      /* Word WebP/AVIF açmaz — PNG'ye çevrilir. */
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
      const png = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      if (!png) return "";
      blob = png;
      ext = "png";
    }
    const rect = img.getBoundingClientRect();
    let w = rect.width || img.naturalWidth || 300;
    let h = rect.height || img.naturalHeight || 200;
    if (w > CONTENT_PX) { h = (h * CONTENT_PX) / w; w = CONTENT_PX; }
    const n = ctx.media.length + 1;
    const name = `image${n}.${ext}`;
    ctx.media.push({ name, data: await blob.arrayBuffer() });
    const rId = `rId${ctx.rels.length + 10}`;
    ctx.rels.push(`<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`);
    const cx = Math.round(w * EMU_PER_PX), cy = Math.round(h * EMU_PER_PX);
    const id = ++ctx.drawingId;
    return (
      `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
      `<wp:docPr id="${id}" name="Resim ${id}" descr="${esc(img.alt || "")}"/>` +
      `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
      `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
      `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
      `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
    );
  } catch {
    return "";   // tek görselin alınamaması indirmeyi düşürmez
  }
}

/* ── Satır içi içerik → run'lar ────────────────────────────────────────── */

async function inlineRuns(nodes: Node[], owner: HTMLElement, ctx: Ctx): Promise<string> {
  let out = "";
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.nodeType === 3) {
      const parent = (n.parentElement ?? owner) as HTMLElement;
      const pre = /^pre/.test(getComputedStyle(parent).whiteSpace);
      let text = n.nodeValue ?? "";
      if (!pre) text = text.replace(/[ \t\r\n]+/g, " ");
      if (!text) continue;
      const rPr = runProps(parent, ctx);
      /* `pre` içinde satır sonu gerçek satır sonudur. */
      const parts = pre ? text.split("\n") : [text];
      const body = parts.map((t, k) => `${k > 0 ? "<w:br/>" : ""}${t ? `<w:t xml:space="preserve">${esc(t)}</w:t>` : ""}`).join("");
      const run = `<w:r>${rPr}${body}</w:r>`;
      out += ctx.link ? `<w:hyperlink r:id="${ctx.link}" w:history="1">${run}</w:hyperlink>` : run;
      continue;
    }
    if (n.nodeType !== 1) continue;
    const el = n as HTMLElement;
    if (el.tagName === "BR") {
      /* Paragrafın SONUNDAKİ <br> boş satır değil, tarayıcının yer tutucusudur. */
      const rest = nodes.slice(i + 1).some((x) => x.nodeType === 1 || (x.nodeValue ?? "").trim() !== "");
      if (rest) out += "<w:r><w:br/></w:r>";
      continue;
    }
    if (el.tagName === "IMG") { out += await imageRun(el as HTMLImageElement, ctx); continue; }
    if (el.tagName === "A" && (el as HTMLAnchorElement).href && !ctx.link) {
      const href = (el as HTMLAnchorElement).href;
      if (/^(https?:|mailto:|tel:)/i.test(href)) {
        const rId = `rId${ctx.rels.length + 10}`;
        ctx.rels.push(`<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(href)}" TargetMode="External"/>`);
        ctx.link = rId;
        out += await inlineRuns([...el.childNodes], el, ctx);
        ctx.link = null;
        continue;
      }
    }
    out += await inlineRuns([...el.childNodes], el, ctx);
  }
  return out;
}

/* ── Paragraf ──────────────────────────────────────────────────────────── */

function paraProps(block: HTMLElement, ctx: Ctx, opts: { numbered?: boolean; border?: boolean } = {}): string {
  const cs = getComputedStyle(block);
  const tag = block.tagName;
  let out = "";
  const heading = /^H[1-6]$/.test(tag) ? Math.min(3, Number(tag[1])) : 0;
  if (heading) out += `<w:pStyle w:val="Heading${heading}"/>`;
  if (opts.numbered && ctx.list) out += `<w:numPr><w:ilvl w:val="${Math.min(8, ctx.list.level)}"/><w:numId w:val="${ctx.list.numId}"/></w:numPr>`;
  if (opts.border) out += '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="9AA3A8"/></w:pBdr>';
  const fs = parseFloat(cs.fontSize) || 16;
  const lh = parseFloat(cs.lineHeight);
  const line = Math.round(240 * (Number.isFinite(lh) && lh > 0 ? lh / fs : 1.2));
  const before = Math.max(0, Math.round((parseFloat(cs.marginTop) || 0) * TWIP_PER_PX));
  const after = Math.max(0, Math.round((parseFloat(cs.marginBottom) || 0) * TWIP_PER_PX));
  out += `<w:spacing w:before="${before}" w:after="${after}" w:line="${line}" w:lineRule="auto"/>`;
  /* Liste paragrafının girintisini numaralandırma tanımı verir. */
  const own = tag === "LI" || tag === "TD" || tag === "TH" ? 0 : Math.round(((parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.paddingLeft) || 0)) * TWIP_PER_PX);
  const left = ctx.indent + (block === ctx.root ? 0 : Math.max(0, own));
  if (left > 0 && !(opts.numbered && ctx.list)) out += `<w:ind w:left="${left}"/>`;
  else if (ctx.list && !opts.numbered) out += `<w:ind w:left="${720 * (ctx.list.level + 1)}"/>`;
  const align = cs.textAlign;
  const jc = align === "center" ? "center" : align === "right" || align === "end" ? "right" : align === "justify" ? "both" : "";
  if (jc) out += `<w:jc w:val="${jc}"/>`;
  return `<w:pPr>${out}</w:pPr>`;
}

async function paragraph(block: HTMLElement, nodes: Node[], ctx: Ctx): Promise<string> {
  const runs = await inlineRuns(nodes, block, ctx);
  const numbered = !!ctx.list && !ctx.listUsed;
  if (numbered) ctx.listUsed = true;
  return `<w:p>${paraProps(block, ctx, { numbered })}${runs}</w:p>`;
}

/* ── Tablo ─────────────────────────────────────────────────────────────── */

async function table(el: HTMLTableElement, ctx: Ctx): Promise<string> {
  const rows = [...el.rows];
  if (!rows.length) return "";
  /* Izgara: birleşik hücreler (colspan/rowspan) yerlerine oturtulur. */
  type Slot = { cell: HTMLTableCellElement; start: boolean; span: number } | null;
  const grid: Slot[][] = rows.map(() => []);
  rows.forEach((row, r) => {
    let c = 0;
    for (const cell of [...row.cells]) {
      while (grid[r][c]) c++;
      const cs = Math.max(1, cell.colSpan || 1), rs = Math.max(1, cell.rowSpan || 1);
      for (let dr = 0; dr < rs && r + dr < rows.length; dr++) {
        for (let dc = 0; dc < cs; dc++) grid[r + dr][c + dc] = { cell, start: dr === 0 && dc === 0, span: cs };
      }
      c += cs;
    }
  });
  const cols = Math.max(...grid.map((g) => g.length), 1);
  /* Sütun genişlikleri ekrandaki oranlardan; toplam sayfa genişliğine sığar. */
  const px: number[] = Array(cols).fill(0);
  grid.forEach((g) => g.forEach((slot, c) => {
    if (slot?.start && slot.span === 1 && !px[c]) px[c] = slot.cell.getBoundingClientRect().width;
  }));
  const known = px.filter((w) => w > 0);
  const fallback = known.length ? known.reduce((a, b) => a + b, 0) / known.length : CONTENT_PX / cols;
  const widths = px.map((w) => w || fallback);
  const avail = Math.max(120, CONTENT_PX - ctx.indent / TWIP_PER_PX);
  const scale = Math.min(1, avail / widths.reduce((a, b) => a + b, 0));
  const tw = widths.map((w) => Math.max(200, Math.round(w * scale * TWIP_PER_PX)));

  const edge = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="9AA3A8"/>`;
  let out =
    `<w:tbl><w:tblPr><w:tblW w:w="${tw.reduce((a, b) => a + b, 0)}" w:type="dxa"/>` +
    (ctx.indent ? `<w:tblInd w:w="${ctx.indent}" w:type="dxa"/>` : "") +
    `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(edge).join("")}</w:tblBorders>` +
    `<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid>${tw.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>`;
  const inner: Ctx = { ...ctx, indent: 0, list: null, listUsed: false };
  for (let r = 0; r < rows.length; r++) {
    out += "<w:tr>";
    for (let c = 0; c < cols; ) {
      const slot = grid[r][c];
      const span = slot ? slot.span : 1;
      const width = tw.slice(c, c + span).reduce((a, b) => a + b, 0);
      let tcPr = `<w:tcW w:w="${width}" w:type="dxa"/>`;
      if (span > 1) tcPr += `<w:gridSpan w:val="${span}"/>`;
      let content = "<w:p/>";
      if (slot) {
        const first = slot.cell.parentElement === rows[r];
        if (slot.cell.rowSpan > 1) tcPr += first ? '<w:vMerge w:val="restart"/>' : "<w:vMerge/>";
        if (first) {
          const fill = hex(getComputedStyle(slot.cell).backgroundColor);
          if (fill && fill !== "FFFFFF") tcPr += `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`;
          content = (await blocks(slot.cell, inner)) || "<w:p/>";
          /* Hücrenin SON öğesi paragraf olmalı (Word kuralı). */
          if (content.endsWith("</w:tbl>")) content += "<w:p/>";
        }
      }
      out += `<w:tc><w:tcPr>${tcPr}</w:tcPr>${content}</w:tc>`;
      c += span;
    }
    out += "</w:tr>";
  }
  ctx.rels = inner.rels; ctx.media = inner.media; ctx.nums = inner.nums; ctx.drawingId = inner.drawingId;
  return `${out}</w:tbl>`;
}

/* ── Blok yürüyüşü ─────────────────────────────────────────────────────── */

async function blocks(parent: HTMLElement, ctx: Ctx): Promise<string> {
  let out = "";
  let buffer: Node[] = [];
  const flush = async () => {
    const has = buffer.some((n) => n.nodeType === 1 || (n.nodeValue ?? "").trim() !== "");
    if (has) out += await paragraph(parent, buffer, ctx);
    buffer = [];
  };
  for (const n of [...parent.childNodes]) {
    if (!isBlock(n)) { buffer.push(n); continue; }
    await flush();
    const el = n;
    const tag = el.tagName;
    if (tag === "HR") {
      out += `<w:p>${paraProps(el, ctx, { border: true })}</w:p>`;
    } else if (tag === "TABLE") {
      out += await table(el as HTMLTableElement, ctx);
    } else if (tag === "UL" || tag === "OL") {
      const numId = ctx.nums.length + 1;
      ctx.nums.push({ numId, ordered: tag === "OL", start: Math.max(1, Number((el as HTMLOListElement).start) || 1) });
      const level = ctx.list ? ctx.list.level + 1 : 0;
      for (const li of [...el.children]) {
        if (li.tagName !== "LI") continue;
        const sub: Ctx = { ...ctx, list: { numId, level }, listUsed: false };
        const body = hasBlockChild(li as HTMLElement) ? await blocks(li as HTMLElement, sub) : await paragraph(li as HTMLElement, [...li.childNodes], sub);
        out += body;
        ctx.rels = sub.rels; ctx.media = sub.media; ctx.nums = sub.nums; ctx.drawingId = sub.drawingId;
      }
    } else if (hasBlockChild(el)) {
      const cs = getComputedStyle(el);
      const extra = tag === "BLOCKQUOTE" || tag === "DD"
        ? Math.round(((parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.paddingLeft) || 0)) * TWIP_PER_PX)
        : 0;
      const sub: Ctx = { ...ctx, indent: ctx.indent + Math.max(0, extra) };
      out += await blocks(el, sub);
      ctx.rels = sub.rels; ctx.media = sub.media; ctx.nums = sub.nums; ctx.drawingId = sub.drawingId; ctx.listUsed = sub.listUsed;
    } else {
      out += await paragraph(el, [...el.childNodes], ctx);
    }
  }
  await flush();
  return out;
}

/* ── Paket ─────────────────────────────────────────────────────────────── */

const W_NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';

function stylesXml(basePt: number): string {
  const h = (id: number, pt: number) =>
    `<w:style w:type="paragraph" w:styleId="Heading${id}"><w:name w:val="heading ${id}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:outlineLvl w:val="${id - 1}"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="${pt * 2}"/><w:szCs w:val="${pt * 2}"/></w:rPr></w:style>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W_NS}>` +
    `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="${basePt * 2}"/><w:szCs w:val="${basePt * 2}"/><w:lang w:val="tr-TR"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>` +
    `<w:pPr><w:spacing w:after="200"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr></w:style>` +
    h(1, 22) + h(2, 16) + h(3, 13.5) +
    `</w:styles>`
  );
}

function numberingXml(nums: Ctx["nums"]): string {
  const bullets = ["•", "o", "▪"];
  const lvl = (i: number, ordered: boolean) => {
    const left = 720 * (i + 1);
    const fmt = ordered ? ["decimal", "lowerLetter", "lowerRoman"][i % 3] : "bullet";
    const text = ordered ? `%${i + 1}.` : bullets[i % 3];
    const font = ordered ? "" : i % 3 === 1 ? '<w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New" w:hint="default"/></w:rPr>' : "";
    return `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${left}" w:hanging="360"/></w:pPr>${font}</w:lvl>`;
  };
  const abstract = (id: number, ordered: boolean) =>
    `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>${Array.from({ length: 9 }, (_, i) => lvl(i, ordered)).join("")}</w:abstractNum>`;
  /* Her liste KENDİ numarasıyla başlar: ayrı `num`, birinci düzey baştan. */
  const num = (n: Ctx["nums"][number]) =>
    `<w:num w:numId="${n.numId}"><w:abstractNumId w:val="${n.ordered ? 1 : 0}"/>` +
    (n.ordered ? `<w:lvlOverride w:ilvl="0"><w:startOverride w:val="${n.start}"/></w:lvlOverride>` : "") +
    `</w:num>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W_NS}>${abstract(0, false)}${abstract(1, true)}${nums.map(num).join("")}</w:numbering>`;
}

/**
 * Editör gövdesinden .docx üretir. `root` editörün canlı gövde düğümüdür
 * (ekranda olmalı — ölçüler ve stiller oradan okunur).
 */
export async function buildDocx(title: string, root: HTMLElement): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const ctx: Ctx = {
    root, baseColor: hex(getComputedStyle(root).color), rels: [], media: [], nums: [],
    drawingId: 0, indent: 0, list: null, listUsed: false, link: null,
  };
  const body = await blocks(root, ctx);
  const basePt = Math.round((parseFloat(getComputedStyle(root).fontSize) || 16) * 0.75);
  const titlePara = title.trim()
    ? `<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t xml:space="preserve">${esc(title.trim())}</w:t></w:r></w:p>`
    : "";
  /* Gövdenin son öğesi tablo ise ardından boş paragraf gelir (Word kuralı). */
  const tail = body.endsWith("</w:tbl>") ? "<w:p/>" : "";
  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W_NS}><w:body>${titlePara}${body || "<w:p/>"}${tail}` +
    `<w:sectPr><w:pgSz w:w="${PAGE_W}" w:h="${PAGE_H}"/><w:pgMar w:top="${MARGIN}" w:right="${MARGIN}" w:bottom="${MARGIN}" w:left="${MARGIN}" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>` +
    `</w:body></w:document>`;

  const zip = new JSZip();
  zip.file("[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
    `<Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
    `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>` +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
  zip.file("_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  zip.file("docProps/core.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${esc(title)}</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`);
  zip.file("word/document.xml", documentXml);
  zip.file("word/styles.xml", stylesXml(basePt));
  zip.file("word/numbering.xml", numberingXml(ctx.nums));
  zip.file("word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>` +
    `${ctx.rels.join("")}</Relationships>`);
  for (const m of ctx.media) zip.file(`word/media/${m.name}`, m.data);
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
}
