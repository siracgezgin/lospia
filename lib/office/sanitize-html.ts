/**
 * Yazı gövdesi için ALLOWLIST tabanlı HTML temizleyici.
 *
 * AF Teamwork'teki yazılar (20240325) zengin metindir ve ekranda
 * `dangerouslySetInnerHTML` ile çizilir. Gövdeyi bir ekip arkadaşı yazar, bir
 * başkası okur — yani girdi, kendi kullanıcısından başkasına ulaşır. Depolanmış
 * XSS'in tanımı budur; RLS bunu engellemez.
 *
 * Bu yüzden temizlik SUNUCUDA, yazma anında yapılır (okuma anında değil):
 * veritabanına hiçbir zaman temizlenmemiş HTML girmez.
 *
 * Yeni bağımlılık YOK (proje kuralı: paket kurmadan önce sor). Kapsam bilerek
 * dar:
 *   • yalnız biçimlendirme etiketleri,
 *   • `a[href]` ve `img[src]` — yalnız http/https/mailto şeması,
 *   • `style` — YALNIZ `color` ve `background-color`, değeri de hex/rgb/isim
 *     kalıbına uyuyorsa (Aslı Hanım 2026-08-29: "Word'de yazı rengi vs
 *     ekleyemiyor muyuz, ya da resim vs.").
 * `url(...)`, `expression(...)`, `position`, `behavior` gibi hiçbir şey
 * geçmez: değer allowlist'e uymuyorsa declaration TAMAMEN atılır.
 */

/** İçeriğiyle birlikte TAMAMEN silinen etiketler. */
const DROP_WITH_CONTENT = ["script", "style", "iframe", "object", "embed", "template", "noscript"];

/** Korunan etiketler. Listede olmayan etiket silinir, İÇERİĞİ korunur. */
const ALLOWED_TAGS = new Set([
  "p", "br", "div", "span",
  "b", "strong", "i", "em", "u", "s", "mark",
  "h1", "h2", "h3", "h4",
  "ul", "ol", "li",
  "blockquote", "hr", "a", "code", "pre",
  "table", "thead", "tbody", "tr", "th", "td",
  "img", "figure", "figcaption",
]);

/** Etiket başına izinli öznitelikler. Burada olmayan hiçbir öznitelik geçmez —
 *  `on*`, `srcdoc`, `data-*`, `class`, `id` dahil. */
const ALLOWED_ATTRS: Record<string, string[]> = {
  a: ["href", "style"],
  img: ["src", "alt", "style"],
  span: ["style"],
  p: ["style"],
  h1: ["style"], h2: ["style"], h3: ["style"], h4: ["style"],
  li: ["style"], td: ["style"], th: ["style"],
  mark: ["style"], strong: ["style"], b: ["style"], em: ["style"], i: ["style"], u: ["style"],
};

const SAFE_URL = /^(https?:|mailto:)/i;
/** Yalnız bu iki bildirim geçer. */
const STYLE_PROPS = new Set(["color", "background-color"]);
/** #abc · #aabbcc · rgb(…) · rgba(…) · kırmızı gibi tek kelime isim. */
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|[a-z]{3,24})$/i;

/**
 * `style` özniteliğini süzer: yalnız color / background-color, yalnız güvenli
 * değerle. Hiçbiri kalmazsa boş dize döner (öznitelik hiç yazılmaz).
 */
function sanitizeStyle(raw: string): string {
  const out: string[] = [];
  for (const decl of raw.split(";")) {
    const idx = decl.indexOf(":");
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim().replace(/!important/gi, "").trim();
    if (!STYLE_PROPS.has(prop)) continue;
    if (!SAFE_COLOR.test(value)) continue;
    out.push(`${prop}: ${value}`);
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
  const allowed = ALLOWED_ATTRS[tag];
  if (!allowed?.length) return "";
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
    } else if (name === "alt") {
      out.push(`alt="${escapeAttr(value.slice(0, 200))}"`);
    } else if (name === "style") {
      const style = sanitizeStyle(value);
      if (style) out.push(`style="${escapeAttr(style)}"`);
    }
  }
  return out.length ? " " + out.join(" ") : "";
}

/**
 * Temizlenmiş HTML döner. Girdi ne olursa olsun çıktı yalnız yukarıdaki
 * etiketleri ve `a[href]` özniteliğini içerir.
 */
export function sanitizeRichText(input: string | null | undefined): string {
  let html = String(input ?? "");
  if (!html.trim()) return "";

  // 1) Yorumlar (koşullu yorumlar dahil) ve içerikli tehlikeli bloklar.
  html = html.replace(/<!--[\s\S]*?-->/g, "");
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
    const selfClosing = tag === "br" || tag === "hr" || tag === "img";
    return `<${tag}${rebuildAttrs(tag, String(attrs))}${selfClosing ? " /" : ""}>`;
  });

  // 3) Yeniden yazımdan artakalan yalnız-açı işaretleri metin sayılır.
  html = html.replace(/<(?![a-zA-Z/])/g, "&lt;");

  return html.trim();
}

/** Yazının ilk satırı — listede önizleme olarak gösterilir. */
export function richTextPreview(html: string | null | undefined, max = 160): string {
  const text = String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}
