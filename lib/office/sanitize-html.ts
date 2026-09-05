/**
 * Yazı gövdesi için ALLOWLIST tabanlı HTML temizleyici.
 *
 * AF Teamwork'teki yazılar (20240325) zengin metindir ve ekranda yeniden
 * çizilir. Gövdeyi bir ekip arkadaşı yazar, bir başkası okur — yani girdi,
 * kendi kullanıcısından başkasına ulaşır. Depolanmış XSS'in tanımı budur; RLS
 * bunu engellemez.
 *
 * Bu yüzden temizlik SUNUCUDA, yazma anında yapılır (okuma anında değil):
 * veritabanına hiçbir zaman temizlenmemiş HTML girmez. Aynı modül istemcide de
 * çağrılır (yapıştırma temizliği) — saf fonksiyon, sunucuya özel bağımlılığı
 * yok — böylece "yapıştırınca gördüğüm şey" ile "kaydedilen şey" aynı kalır.
 *
 * KAPSAM (2026-09-05, "Word gibi çalışsın"): biçimlendirme etiketleri, listeler,
 * başlıklar, alıntı/kod, YATAY ÇİZGİ, TABLO, bağlantı ve görsel. Buna karşılık:
 *   • `script` / `style` / `iframe` / gömülü ortam ve girdi alanları
 *     içeriğiyle birlikte silinir (sarmalayıcı `form`/`button` ise yalnız
 *     etiket olarak düşer, metni kalır),
 *   • `on*` ile başlayan hiçbir öznitelik geçmez (allowlist dışı),
 *   • `href`/`src` yalnız http · https · mailto şemasıyla,
 *   • `style` YALNIZ aşağıdaki özellik listesiyle ve her özelliğin kendi değer
 *     kalıbıyla; kalıba uymayan bildirim TAMAMEN atılır.
 * `url(...)`, `expression(...)`, `position`, `behavior` gibi hiçbir şey geçmez.
 */

/**
 * İçeriğiyle birlikte TAMAMEN silinen etiketler.
 *
 * `form`, `button` ve `select` BİLEREK burada DEĞİL: `form` bir sarmalayıcıdır
 * ve gövdesinin tamamını tek bir `<form>` içine alan sayfalardan (kurumsal /
 * ASP.NET) yapıştırılan metnin hepsi sessizce yok oluyordu — kullanıcı
 * yapıştırıyor, ekranda hiçbir şey çıkmıyordu. Aynı biçimde `button` içindeki
 * görünür etiket metni de kayboluyordu. Bu üçü ALLOWED_TAGS'te olmadığı için
 * 2. adımda etiketleri silinir, METİNLERİ korunur — istenen davranış budur.
 */
const DROP_WITH_CONTENT = [
  "script", "style", "iframe", "object", "embed", "template", "noscript",
  "input", "textarea", "option",
  "link", "meta", "base", "head", "title", "svg", "math",
  "audio", "video", "source", "canvas", "frame", "frameset",
];

/** Korunan etiketler. Listede olmayan etiket silinir, İÇERİĞİ korunur. */
const ALLOWED_TAGS = new Set([
  "p", "br", "div", "span",
  "b", "strong", "i", "em", "u", "s", "strike", "mark", "sub", "sup",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "blockquote", "hr", "a", "code", "pre",
  "table", "caption", "colgroup", "col", "thead", "tbody", "tfoot", "tr", "th", "td",
  "img", "figure", "figcaption",
]);

/** Öznitelik taşımayan etiketler (br · hr · col dışında hepsi `style` alır). */
const NO_ATTR_TAGS = new Set(["br"]);

/** Etiket başına EK öznitelikler; `style` aşağıda otomatik eklenir.
 *  Burada olmayan hiçbir öznitelik geçmez — `on*`, `srcdoc`, `class`, `id` dahil. */
const EXTRA_ATTRS: Record<string, string[]> = {
  a: ["href", "title"],
  img: ["src", "alt", "width", "height"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"],
  col: ["span"],
};

function allowedAttrs(tag: string): string[] {
  if (NO_ATTR_TAGS.has(tag)) return [];
  return ["style", ...(EXTRA_ATTRS[tag] ?? [])];
}

const SAFE_URL = /^(https?:|mailto:)/i;

/** #abc · #aabbcc · rgb(…) · rgba(…) · kırmızı gibi tek kelime isim. */
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|[a-z]{3,24})$/i;
/** 0 · 12px · 1.5rem · 40% — negatifi de kabul (girinti azaltma). */
const SAFE_LENGTH = /^-?\d{1,4}(\.\d{1,3})?(px|pt|em|rem|%|ch|in|cm|mm)?$/i;

/**
 * İzinli `style` bildirimleri — her biri KENDİ değer kalıbıyla.
 *
 * Word / Google Docs yapıştırmasının işe yarayan kısmı (kalın, punto, hizalama,
 * satır aralığı, girinti, renk) burada geçer; `mso-*`, `position`, `behavior`,
 * `url(...)` gibi her şey elenir.
 */
const STYLE_RULES: Record<string, RegExp> = {
  "color": SAFE_COLOR,
  "background-color": SAFE_COLOR,
  "font-family": /^[a-z0-9À-ɏ\s'",._-]{1,120}$/i,
  "font-size": /^(\d{1,3}(\.\d{1,2})?(px|pt|em|rem|%)|xx-small|x-small|small|medium|large|x-large|xx-large)$/i,
  "font-weight": /^(normal|bold|bolder|lighter|[1-9]00)$/i,
  "font-style": /^(normal|italic|oblique)$/i,
  "font-variant": /^(normal|small-caps)$/i,
  "text-align": /^(left|right|center|justify|start|end)$/i,
  "text-decoration": /^(none|underline|line-through|overline)( (underline|line-through|overline)){0,2}$/i,
  "text-decoration-line": /^(none|underline|line-through|overline)( (underline|line-through|overline)){0,2}$/i,
  "text-transform": /^(none|uppercase|lowercase|capitalize)$/i,
  "text-indent": SAFE_LENGTH,
  "line-height": /^(normal|\d{1,2}(\.\d{1,3})?(px|pt|em|rem|%)?)$/i,
  "margin-left": SAFE_LENGTH,
  "margin-right": SAFE_LENGTH,
  "padding-left": SAFE_LENGTH,
  "width": SAFE_LENGTH,
  "height": SAFE_LENGTH,
  "vertical-align": /^(baseline|sub|super|top|middle|bottom|text-top|text-bottom)$/i,
  "border-collapse": /^(collapse|separate)$/i,
  "white-space": /^(normal|nowrap|pre|pre-wrap|pre-line)$/i,
  "list-style-type": /^[a-z-]{1,24}$/i,
};

/** Değerin içinde ASLA bulunmaması gerekenler — kalıplar zaten eler, bu ikinci kapı. */
const STYLE_POISON = /(url\s*\(|expression|javascript:|@import|behavior|--|\\|\/\*)/i;

/**
 * `style` özniteliğini süzer: yalnız izinli özellik, yalnız kendi kalıbına uyan
 * değer. Hiçbiri kalmazsa boş dize döner (öznitelik hiç yazılmaz).
 */
function sanitizeStyle(raw: string): string {
  // Tarayıcı `font-family: "Times New Roman", Times, serif` gibi TIRNAKLI
  // değerleri `innerHTML` serileştirmesinde `&quot;` olarak kaçırır. Bildirimi
  // `;` üzerinden bölmeden önce bu varlığı tek tırnağa çeviriyoruz: yoksa
  // varlığın içindeki `;` bildirimi ortadan ikiye ayırıp yazı tipini sessizce
  // düşürüyordu. Tek tırnak hem geçerli CSS hem de `font-family` kalıbında
  // zaten izinli.
  const src = raw.replace(/&quot;|&#0*34;|&#x0*22;/gi, "'");
  const out: string[] = [];
  for (const decl of src.split(";")) {
    const idx = decl.indexOf(":");
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim().replace(/!important/gi, "").trim();
    const rule = STYLE_RULES[prop];
    if (!rule) continue;
    if (!value || value.length > 128) continue;
    if (STYLE_POISON.test(value)) continue;
    if (!rule.test(value)) continue;
    out.push(`${prop}: ${value}`);
    if (out.length >= 12) break;
  }
  return out.join("; ");
}

function safeHref(raw: string): string | null {
  // Gizlenmiş şemalar ("java\nscript:", "\tjavascript:") yakalansın diye TÜM
  // boşluk ve kontrol karakterleri atılır. DOĞRULANAN değer neyse ÇIKAN da o —
  // ham girdiyi geri vermek, doğrulamayı atlatan bir dize bırakır.
  const v = raw.replace(/[\u0000-\u0020\u007f-\u00a0]/g, "");
  if (!v) return null;
  return SAFE_URL.test(v) ? v : null;
}

function escapeAttr(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Bir açılış etiketinin izinli özniteliklerini yeniden kurar. */
function rebuildAttrs(tag: string, raw: string): string {
  const allowed = allowedAttrs(tag);
  if (!allowed.length) return "";
  const out: string[] = [];
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(raw))) {
    const name = m[1].toLowerCase();
    if (!allowed.includes(name)) continue;
    let value = m[2];
    if (value.startsWith('"') || value.startsWith("'")) value = value.slice(1, -1);
    if (name === "href") {
      const href = safeHref(value);
      if (!href) continue;
      out.push(`href="${escapeAttr(href)}"`);
      // Dış bağlantı yeni sekmede ve opener sızdırmadan açılsın.
      out.push('target="_blank"', 'rel="noopener noreferrer"');
    } else if (name === "src") {
      const src = safeHref(value);
      if (!src) continue;
      out.push(`src="${escapeAttr(src)}"`);
      // Uzak görsel referer sızdırmasın; boyut sayfayı taşırmasın.
      out.push('referrerpolicy="no-referrer"', 'loading="lazy"');
    } else if (name === "alt" || name === "title") {
      out.push(`${name}="${escapeAttr(value.slice(0, 200))}"`);
    } else if (name === "colspan" || name === "rowspan" || name === "span") {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1 || n > 100) continue;
      out.push(`${name}="${n}"`);
    } else if (name === "width" || name === "height") {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1 || n > 5000) continue;
      out.push(`${name}="${n}"`);
    } else if (name === "style") {
      const style = sanitizeStyle(value);
      if (style) out.push(`style="${escapeAttr(style)}"`);
    }
  }
  return out.length ? " " + out.join(" ") : "";
}

/** Kaynağı geçersiz bir `<img>` boş bir kırık kutu bırakır — tamamen atılır. */
function imgHasSafeSrc(raw: string): boolean {
  // Nitelik SINIRINA sabitlenmiş kalıp: `\b` tire sonrasında da eşleştiği için
  // `data-src` / `lazy-src` gibi nitelikleri `src` sanıyordu. Tembel yükleyen
  // sitelerden yapıştırmada yanlış nitelik doğrulanıp gerçek `src` sonra
  // düşüyor, gövdede kaynaksız boş bir <img> kalıyordu.
  const m = /(?:^|[\s"'])src\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/i.exec(raw);
  if (!m) return false;
  let v = m[1];
  if (v.startsWith('"') || v.startsWith("'")) v = v.slice(1, -1);
  return safeHref(v) !== null;
}

/**
 * Temizlenmiş HTML döner. Girdi ne olursa olsun çıktı yalnız yukarıdaki
 * etiketleri ve izinli öznitelikleri içerir.
 */
export function sanitizeRichText(input: string | null | undefined): string {
  let html = String(input ?? "");
  if (!html.trim()) return "";

  // 1) Yorumlar (Word'ün koşullu yorumları dahil) ve içerikli tehlikeli bloklar.
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  html = html.replace(/<![^>]*>/g, "");
  for (const tag of DROP_WITH_CONTENT) {
    html = html.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}\\s*>`, "gi"), "");
    // Kapanışı olmayan hâli de kalmasın.
    html = html.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi"), "");
  }

  // 2) Kalan her etiketi allowlist'e göre yeniden yaz. İzinsiz etiket silinir,
  //    metni korunur (kullanıcı yazdığı cümleyi kaybetmesin).
  html = html.replace(/<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (_all, slash, name, attrs) => {
    const tag = String(name).toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (slash) return `</${tag}>`;
    if (tag === "img" && !imgHasSafeSrc(String(attrs))) return "";
    const selfClosing = tag === "br" || tag === "hr" || tag === "img" || tag === "col";
    return `<${tag}${rebuildAttrs(tag, String(attrs))}${selfClosing ? " /" : ""}>`;
  });

  // 3) Yeniden yazımdan artakalan yalnız-açı işaretleri metin sayılır.
  html = html.replace(/<(?![a-zA-Z/])/g, "&lt;");

  return html.trim();
}

/** Yazının ilk satırı — listede önizleme olarak gösterilir. */
export function richTextPreview(html: string | null | undefined, max = 160): string {
  const text = richTextToPlain(html);
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

/** HTML → düz metin. Sayaç ve önizleme aynı okumayı kullansın. */
export function richTextToPlain(html: string | null | undefined): string {
  return String(html ?? "")
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
