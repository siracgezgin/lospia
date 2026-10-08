/**
 * HÜCRENİN İÇİNDEKİ GÖRSELLER — ExcelJS'in göremediği iki biçim.
 *
 * AF (2026-10-08): "Excel yükledim resimli ama resimler açılmıyor."
 *
 * Excel'de bir görsel iki türlü durabilir:
 *
 *   (a) HÜCRENİN ÜSTÜNDE YÜZER (drawing) — klasik "Ekle → Resim". ExcelJS
 *       bunu `getImages()` ile verir; xlsx-import.ts onu zaten okuyor.
 *
 *   (b) HÜCRENİN İÇİNE YERLEŞİR — Excel 365'in "Hücreye Yerleştir"
 *       (Place in Cell) ve IMAGE() sonucu. Görsel bir DEĞERdir: hücre
 *       `t="e" vm="N"` olarak `#VALUE!` taşır, asıl bağ `xl/metadata.xml` →
 *       `xl/richData/*` zincirindedir. ExcelJS bu zinciri HİÇ okumuyor; hücre
 *       tabloya `#VALUE!` yazısı olarak geliyordu ve fotoğraf kayboluyordu.
 *       Stok/kartela gibi "her satırda bir ürün fotoğrafı" dosyaları bugün
 *       çoğunlukla böyle hazırlanıyor.
 *
 *   (c) WPS Office'in karşılığı `=DISPIMG("ID_…",1)` formülü +
 *       `xl/cellimages.xml`. Aynı sorun, ayrı dosya.
 *
 * Bu modül (b) ve (c)'yi paketin kendisinden okur. Bayt YÜKLENMEZ — saf
 * dönüşüm; yükleme çağıranın işi (xlsx-import.ts ile aynı sözleşme).
 */

import JSZip from "jszip";

export interface InCellImage {
  /** Sayfanın Excel'deki adı — anlık görüntüdeki sekmeyle bununla eşleşir. */
  sheetName: string;
  /** Sıfır tabanlı hücre. */
  r: number;
  c: number;
  /** Paket içindeki yol, ör. "xl/media/image3.png". */
  mediaPath: string;
}

export interface InCellImageReport {
  placements: InCellImage[];
  /** Kullanılan medyanın baytları — yol başına bir kez. */
  media: Map<string, Buffer>;
  /** Paketteki toplam görsel dosyası; "yeri okunamayan görsel var mı?" için. */
  mediaFileCount: number;
}

/** `<tag a="1" b="x">` içinden öznitelik. Ad alanı önekini yok sayar. */
function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)(?:[\\w-]+:)?${name}="([^"]*)"`).exec(tag);
  return m?.[1];
}

/** "AB12" → { r: 11, c: 27 } (sıfır tabanlı). */
function parseRef(ref: string): { r: number; c: number } | null {
  const m = /^([A-Z]+)(\d+)$/i.exec(ref);
  if (!m) return null;
  let c = 0;
  for (const ch of m[1].toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: Number(m[2]) - 1, c: c - 1 };
}

/** İlişki hedefini paket yoluna çevirir: "xl/richData" + "../media/a.png" → "xl/media/a.png". */
function resolveTarget(baseDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = baseDir.split("/").filter(Boolean);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

/** `.rels` dosyası → Id → paket yolu. */
async function readRels(zip: JSZip, relsPath: string, baseDir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const xml = await zip.file(relsPath)?.async("string");
  if (!xml) return out;
  for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) out.set(id, resolveTarget(baseDir, target));
  }
  return out;
}

/** Sayfa adı → sayfa XML yolu (workbook.xml + ilişkileri). */
async function sheetPaths(zip: JSZip): Promise<{ name: string; path: string }[]> {
  const wb = await zip.file("xl/workbook.xml")?.async("string");
  if (!wb) return [];
  const rels = await readRels(zip, "xl/_rels/workbook.xml.rels", "xl");
  const out: { name: string; path: string }[] = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(m[0], "name");
    const rid = attr(m[0], "id");
    const path = rid ? rels.get(rid) : undefined;
    if (name && path) out.push({ name: decodeXml(name), path });
  }
  return out;
}

function decodeXml(s: string): string {
  return s
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/**
 * (b) Place in Cell: hücrenin `vm` sırası → görselin paket yolu.
 *
 * Zincir: vm (1 tabanlı) → valueMetadata/bk → rc@v → futureMetadata
 * "XLRICHVALUE"/bk → xlrd:rvb@i → rdrichvalue/rv → yapıdaki
 * "_rvRel:LocalImageIdentifier" anahtarının değeri → richValueRel/rel →
 * r:id → medya. Halkalardan biri yoksa o görsel atlanır, gerisi okunur.
 */
async function richValueImages(zip: JSZip): Promise<Map<number, string>> {
  const byVm = new Map<number, string>();
  const [metaXml, rvXml, structXml, relXml] = await Promise.all([
    zip.file("xl/metadata.xml")?.async("string"),
    zip.file("xl/richData/rdrichvalue.xml")?.async("string"),
    zip.file("xl/richData/rdrichvaluestructure.xml")?.async("string"),
    zip.file("xl/richData/richValueRel.xml")?.async("string"),
  ]);
  if (!metaXml || !rvXml || !relXml) return byVm;

  const relTargets = await readRels(zip, "xl/richData/_rels/richValueRel.xml.rels", "xl/richData");
  const relIds = [...relXml.matchAll(/<rel\b[^>]*>/g)].map((m) => attr(m[0], "id"));

  /* Her yapıda görsel kimliğinin kaçıncı anahtar olduğu. */
  const imageKeyIndex: number[] = [];
  for (const s of (structXml ?? "").matchAll(/<s\b[^>]*>([\s\S]*?)<\/s>/g)) {
    const keys = [...s[1].matchAll(/<k\b[^>]*>/g)].map((k) => attr(k[0], "n"));
    imageKeyIndex.push(keys.indexOf("_rvRel:LocalImageIdentifier"));
  }

  /* rich value sırası → medya yolu. */
  const rvMedia: (string | undefined)[] = [];
  for (const rv of rvXml.matchAll(/<rv\b([^>]*)>([\s\S]*?)<\/rv>/g)) {
    const s = Number(attr(rv[1], "s") ?? 0);
    const idx = imageKeyIndex[s] ?? 0;
    if (idx < 0) { rvMedia.push(undefined); continue; }
    const vals = [...rv[2].matchAll(/<v\b[^>]*>([^<]*)<\/v>/g)].map((v) => v[1]);
    const relIdx = Number(vals[idx]);
    const rid = Number.isInteger(relIdx) ? relIds[relIdx] : undefined;
    rvMedia.push(rid ? relTargets.get(rid) : undefined);
  }

  /* futureMetadata "XLRICHVALUE": bk sırası → rich value sırası. */
  const fm = /<futureMetadata\b[^>]*name="XLRICHVALUE"[^>]*>([\s\S]*?)<\/futureMetadata>/.exec(metaXml);
  const fmToRv = fm
    ? [...fm[1].matchAll(/<bk\b[^>]*>([\s\S]*?)<\/bk>/g)].map((bk) => {
        const rvb = /<(?:\w+:)?rvb\b[^>]*>/.exec(bk[1]);
        return rvb ? Number(attr(rvb[0], "i")) : undefined;
      })
    : [];

  /* valueMetadata: vm (1 tabanlı) → rc@v → futureMetadata bk. */
  const vmBlock = /<valueMetadata\b[^>]*>([\s\S]*?)<\/valueMetadata>/.exec(metaXml);
  const vmBks = vmBlock ? [...vmBlock[1].matchAll(/<bk\b[^>]*>([\s\S]*?)<\/bk>/g)] : [];
  vmBks.forEach((bk, i) => {
    const rc = /<rc\b[^>]*>/.exec(bk[1]);
    const fmIdx = rc ? Number(attr(rc[0], "v")) : NaN;
    const rvIdx = fmToRv[fmIdx];
    const media = rvIdx !== undefined ? rvMedia[rvIdx] : undefined;
    if (media) byVm.set(i + 1, media);
  });
  return byVm;
}

/** (c) WPS: "ID_…" → medya yolu (`xl/cellimages.xml`). */
async function wpsCellImages(zip: JSZip): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const xml = await zip.file("xl/cellimages.xml")?.async("string");
  if (!xml) return out;
  const rels = await readRels(zip, "xl/_rels/cellimages.xml.rels", "xl");
  for (const pic of xml.matchAll(/<(?:\w+:)?pic\b[\s\S]*?<\/(?:\w+:)?pic>/g)) {
    const cNvPr = /<(?:\w+:)?cNvPr\b[^>]*>/.exec(pic[0]);
    const blip = /<(?:\w+:)?blip\b[^>]*>/.exec(pic[0]);
    const name = cNvPr ? attr(cNvPr[0], "name") : undefined;
    const rid = blip ? attr(blip[0], "embed") : undefined;
    const media = rid ? rels.get(rid) : undefined;
    if (name && media) out.set(name, media);
  }
  return out;
}

/**
 * Paketteki hücre-içi görselleri okur. Okunamayan dosya boş rapor döner —
 * bu adım aktarımı DURDURMAZ, en kötü ihtimalle eski davranış sürer.
 */
export async function readInCellImages(buf: Buffer): Promise<InCellImageReport> {
  const empty: InCellImageReport = { placements: [], media: new Map(), mediaFileCount: 0 };
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    return empty;
  }
  const mediaFileCount = Object.values(zip.files).filter(
    (f) => !f.dir && /^xl\/media\/[^/]+\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name),
  ).length;

  const [byVm, byWpsId, sheets] = await Promise.all([
    richValueImages(zip),
    wpsCellImages(zip),
    sheetPaths(zip),
  ]);
  if (byVm.size === 0 && byWpsId.size === 0) return { ...empty, mediaFileCount };

  const placements: InCellImage[] = [];
  for (const { name, path } of sheets) {
    const xml = await zip.file(path)?.async("string");
    if (!xml) continue;
    /* Hücre ya kendini kapatır (<c …/>) ya da içerik taşır (<c …>…</c>). */
    for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const head = m[1];
      const ref = attr(head, "r");
      const pos = ref ? parseRef(ref) : null;
      if (!pos) continue;
      const vm = attr(head, "vm");
      let media = vm ? byVm.get(Number(vm)) : undefined;
      if (!media && byWpsId.size && m[2]?.includes("DISPIMG")) {
        const id = /DISPIMG\((?:&quot;|")([^"&]+)(?:&quot;|")/.exec(m[2])?.[1];
        media = id ? byWpsId.get(id) : undefined;
      }
      if (media) placements.push({ sheetName: name, r: pos.r, c: pos.c, mediaPath: media });
    }
  }

  const media = new Map<string, Buffer>();
  for (const p of new Set(placements.map((x) => x.mediaPath))) {
    const bytes = await zip.file(p)?.async("nodebuffer");
    if (bytes?.length) media.set(p, bytes);
  }
  return { placements: placements.filter((p) => media.has(p.mediaPath)), media, mediaFileCount };
}
