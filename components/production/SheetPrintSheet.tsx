"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Tag, TagIcon } from "lucide-react";
import { categoryLabel, subcategoryLabel } from "@/lib/collection/taxonomy";
import {
  formatMoney, orderSizes, quantityBySize, totalQuantity, unitCostOf,
  bomLineCost, parseMoney,
} from "@/lib/collection/cost";
import type {
  ProductionSheet, ProductionImage, SheetMaterialWithMaterial,
} from "@/types";

interface Props {
  sheet: ProductionSheet;
  bom: SheetMaterialWithMaterial[];
  manufacturerName: string | null;
  seasonName: string | null;
  /** Fiyat/maliyet blokları basılsın mı. Üreticiye giden kopyada VARSAYILAN
   *  KAPALI — atölyenin web satış fiyatını görmesi gerekmiyor. */
  showPricing: boolean;
}

/* ── Kâğıt ölçüleri ─────────────────────────────────────────────────────────
   A4 portre 210×297mm; @page kenar boşluğu 10mm → kullanılabilir 190×277mm.
   Kutu 272mm: yuvarlama farkı ikinci boş sayfa açmasın.
   Ölçüler mm cinsinden SABİT: ekranda ne görüyorsan kâğıtta o çıkar, tarayıcı
   penceresi genişliğinden bağımsız. Aslı Hanım: "her şey her yerde sabit
   olsun belli olsun."                                                        */
const PAGE_W = 190;
/* 268mm: kullanilabilir 277mm'nin altinda emniyet payi. Yazicilar mm→nokta
   donusumunde yuvarliyor; sinira dayanan kutu bos bir ikinci sayfa aciyor. */
const PAGE_H = 268;
/** Okunabilirlik tabanı — bunun altına küçültmek föyü işe yaramaz kılar. */
const MIN_SCALE = 0.62;

/* ── Küçük yapı taşları ──────────────────────────────────────────────────── */

function Band({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-[0.8mm] border-b border-[#1f2937] pb-[0.4mm] text-[6pt] font-bold uppercase tracking-[0.06em] text-[#1f2937]">
      {children}
    </div>
  );
}

function Box({
  title, children, className = "",
}: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 break-inside-avoid ${className}`}>
      <Band>{title}</Band>
      {children}
    </section>
  );
}

/** Etiket:değer satırı — değer boşsa nokta çizgisi (elle doldurulabilsin). */
function KV({ k, v }: { k: string; v: string | null | undefined }) {
  const has = !!(v && String(v).trim());
  return (
    <div className="flex gap-[1mm] leading-[1.25]">
      <span className="w-[26mm] shrink-0 text-[5.6pt] font-semibold uppercase tracking-[0.04em] text-[#6b7280]">
        {k}
      </span>
      {has ? (
        <span className="min-w-0 flex-1 text-[7pt] text-[#111827]">{v}</span>
      ) : (
        // Bos alan: elle doldurulabilsin diye noktali cizgi. Yukseklik metin
        // satiriyla ayni tutulur, yoksa satir cokup hizayi bozuyor.
        <span className="mb-[0.5mm] min-w-0 flex-1 self-end border-b border-dotted border-[#9ca3af]" />
      )}
    </div>
  );
}

/** Serbest metin bölümü — boşsa BASILMAZ (kâğıtta boş başlık gürültüdür). */
function TextBlock({ title, body }: { title: string; body: string | null | undefined }) {
  if (!body || !String(body).trim()) return null;
  return (
    <Box title={title}>
      <p className="whitespace-pre-wrap text-[6.6pt] leading-[1.3] text-[#111827]">{body}</p>
    </Box>
  );
}

function Drawing({ img, label }: { img: ProductionImage | undefined; label: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-[0.5mm] text-[5.4pt] font-semibold uppercase tracking-[0.04em] text-[#6b7280]">
        {label}
      </div>
      <div className="flex h-[38mm] items-center justify-center overflow-hidden border border-[#d9dce1] bg-white">
        {img ? (
          // Baskı görünümü: next/image'ın optimizasyonu burada işe yaramaz
          // (kâğıda giden tek boy), <img> ile ham kaynak basılır.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img.url} alt={label} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-[5.4pt] text-[#c7cbd1]">görsel yok</span>
        )}
      </div>
    </div>
  );
}


/**
 * Numaralı liste (ölçüler / teslim edilen ürünler / reçete).
 *
 * Uzun listede punto düşürmek yerine İKİ KOLONA dökülür: A4'ün boş duran
 * genişliği kullanılır, yükseklik yarıya iner, yazı boyu korunur. Eşik satır
 * sayısına göre; kısa listede tek kolon daha okunaklı.
 */
function NumberedRows({
  rows, twoColAt,
}: {
  rows: { no: string; label: string; value: string }[];
  twoColAt: number;
}) {
  const two = rows.length >= twoColAt;
  const half = two ? Math.ceil(rows.length / 2) : rows.length;
  const parts = two ? [rows.slice(0, half), rows.slice(half)] : [rows];
  return (
    <div className={two ? "flex gap-[3mm]" : ""}>
      {parts.map((part, pi) => (
        <table key={pi} className="w-full min-w-0 flex-1 border-collapse">
          <tbody>
            {part.map((m, i) => (
              <tr key={i} className="border-b border-[#eceef1] last:border-0">
                <td className="w-[5mm] py-[0.35mm] align-top text-[6pt] tabular-nums text-[#9ca3af]">
                  {m.no || (pi === 0 ? i + 1 : half + i + 1)}
                </td>
                <td className="py-[0.35mm] align-top text-[6.8pt] leading-[1.25] text-[#111827]">
                  {m.label}
                </td>
                <td className="w-[14mm] py-[0.35mm] text-right align-top text-[6.8pt] font-semibold tabular-nums text-[#111827]">
                  {m.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

/* ── Ana bileşen ─────────────────────────────────────────────────────────── */

export function SheetPrintSheet({
  sheet, bom, manufacturerName, seasonName, showPricing,
}: Props) {
  const pageRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  /** Tek sayfaya okunabilir biçimde sığmadı → temiz çok-sayfa. */
  const [spills, setSpills] = useState(false);

  /* Tek sayfa — üç kademe.

     1) YENİDEN AKIT: uzun listeler (ölçü, teslim kalemi) iki kolona döker.
        Yükseklik yerine A4'ün boş duran genişliği harcanır, punto düşmez.
     2) KÜÇÜLT: hâlâ taşıyorsa oranla küçültülür. Taban %62; altında 6.8pt gövde
        okunmaz oluyor. Bu, bir sayfaya ~439mm içerik sığdırabilmek demek.
     3) VAZGEÇ: tabanla bile sığmıyorsa SIKIŞTIRMAZ. Föyü %44'e ezmek üreticinin
        okuyamayacağı bir kâğıt üretir; sessizce kırpmak ise EKSİK föy gönderir.
        İkisi de tek sayfadan kötü. Bu durumda doğal sayfa sonlarıyla temiz
        çok-sayfa basılır (bölüm ortadan bölünmez) ve ekranda uyarı çıkar. */
  const fit = useCallback(() => {
    const inner = innerRef.current;
    if (!inner) return;
    /* DİKKAT: getBoundingClientRect() transform'u da sayar. Bir kez küçültünce
       ölçülen genişlik ölçek kadar küçülür, mm karşılığı bozulur ve föy olduğundan
       ~1/ölçek kat UZUN görünür — sığan föy "sığmıyor" ilan ediliyordu. offsetWidth
       yerleşim genişliğidir, transform'dan etkilenmez. */
    const mmToPx = inner.offsetWidth / PAGE_W;
    const needed = inner.scrollHeight / mmToPx;
    if (needed <= PAGE_H) { setScale(1); setSpills(false); return; }
    const wanted = PAGE_H / needed;
    if (wanted >= MIN_SCALE) { setScale(wanted); setSpills(false); return; }
    setScale(1);
    setSpills(true);
  }, []);

  useEffect(() => {
    fit();
    const ro = new ResizeObserver(fit);
    if (innerRef.current) ro.observe(innerRef.current);
    // Görseller geç yüklenir; yüklenince yükseklik değişir → yeniden ölç.
    const imgs = Array.from(innerRef.current?.querySelectorAll("img") ?? []);
    imgs.forEach((im) => im.addEventListener("load", fit));
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      imgs.forEach((im) => im.removeEventListener("load", fit));
      window.removeEventListener("resize", fit);
    };
  }, [fit]);

  const photos = Array.isArray(sheet.photo_refs) ? sheet.photo_refs : [];
  const pick = (s: string) => photos.find((p) => p.section === s && p.url);
  const front = pick("technical_drawing_front") ?? pick("technical_drawing");
  const back = pick("technical_drawing_back");

  const measurements = (sheet.measurements ?? []).filter((m) => m.label?.trim() || m.value?.trim());
  const delivered = (sheet.delivered_items ?? []).filter((d) => d.label?.trim() || d.qty?.trim());
  const sd = sheet.size_distribution;
  const sizes = orderSizes(sd?.sizes ?? []);
  const bySize = quantityBySize(sd);
  const total = totalQuantity(sd);
  const unit = unitCostOf(sheet.pricing, bom);
  const web = parseMoney(sheet.pricing?.web_sale_price);

  return (
    <div className="mx-auto w-full max-w-[220mm] px-3 py-4 sm:px-0 print:m-0 print:p-0">
      {/* Araç çubuğu — kâğıda basılmaz. */}
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/production/${sheet.id}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          <ArrowLeft size={14} /> Föye dön
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/production/${sheet.id}/print${showPricing ? "" : "?fiyat=1"}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:border-line-strong hover:text-ink"
            title="Üreticiye giden kopyada fiyat olmaması önerilir."
          >
            {showPricing ? <TagIcon size={14} /> : <Tag size={14} />}
            {showPricing ? "Fiyatları çıkar" : "Fiyatları ekle"}
          </Link>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-strong"
          >
            <Printer size={14} /> Yazdır / PDF
          </button>
        </div>
      </div>

      {scale < 1 && !spills && (
        <p className="no-print mb-3 rounded-lg border border-line bg-surface-muted px-3 py-2 text-[12.5px] text-muted">
          Tek sayfaya sığması için %{Math.round(scale * 100)} oranında küçültüldü.
        </p>
      )}
      {spills && (
        <p className="no-print mb-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[12.5px] text-ink">
          <strong className="font-semibold">Bu föy tek sayfaya okunabilir biçimde sığmıyor.</strong>{" "}
          Sığdırmak için yazıyı okunamayacak kadar küçültmek gerekirdi, o yüzden bölümler
          bölünmeden birden fazla sayfaya basılıyor. Tek sayfa şart ise ölçü satırlarını
          veya uzun talimat metinlerini kısaltın.
        </p>
      )}

      {/* Kâğıt. Genişlik mm — ekranda da kâğıttaki oranla görünür.
          `print-page` sınıfı BİLEREK YOK: o sınıf kişi raporu için ve baskıda
          `height: auto !important` uyguluyor; satır içi 272mm'yi ezip föyü üç
          sayfaya taşırıyordu. Föyün kâğıt kuralları .print-sheet'te. */}
      <div
        ref={pageRef}
        className={`print-sheet ${spills ? "" : "print-sheet--fit overflow-hidden"} mx-auto bg-white text-[#111827] shadow-card ring-1 ring-line print:shadow-none print:ring-0`}
        style={{ width: `${PAGE_W}mm`, height: spills ? undefined : `${PAGE_H}mm` }}
      >
        <div
          ref={innerRef}
          style={{
            width: `${PAGE_W}mm`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {/* ── Başlık şeridi ─────────────────────────────────────────────
              Marka adı bilerek YOK — Aslı Hanım (2026-08-19): "Şu Aslı
              Filinta'yı yazma böyle… Logoya gerek yok kendi iç üretimimizde." */}
          <header className="flex items-baseline justify-between gap-[3mm] bg-[#1f2937] px-[3mm] py-[1.6mm] text-white">
            <div className="flex min-w-0 items-baseline gap-[2.5mm]">
              <span className="shrink-0 text-[7pt] font-bold uppercase tracking-[0.14em] text-[#9ca3af]">
                Üretim Föyü
              </span>
              <h1 className="min-w-0 truncate text-[11pt] font-bold leading-none">{sheet.title}</h1>
              {sheet.colorway && (
                <span className="shrink-0 text-[7pt] text-[#d1d5db]">/ {sheet.colorway}</span>
              )}
            </div>
            <span className="shrink-0 text-[9pt] font-bold tabular-nums text-[#e5e7eb]">
              {sheet.product_code || ""}
            </span>
          </header>

          <div className="space-y-[2mm] p-[3mm]">
            {/* ── Üst blok: sipariş bilgisi (sol) + teknik çizim (sağ) ────── */}
            <div className="flex gap-[3mm]">
              <div className="min-w-0 flex-1">
                <Box title="Ürün Bilgisi">
                  <div className="space-y-[0.5mm]">
                    <KV k="Ürün kodu" v={sheet.product_code} />
                    <KV k="Ürün cinsi" v={sheet.product_kind} />
                    <KV k="Renk" v={sheet.colorway} />
                    <KV k="Sezon" v={seasonName ?? sheet.season} />
                    <KV k="Kategori" v={sheet.category ? categoryLabel(sheet.category) : null} />
                    <KV k="Alt kategori" v={subcategoryLabel(sheet.category, sheet.subcategory)} />
                    <KV k="Üretici" v={manufacturerName ?? sheet.producer} />
                    <KV k="Üretim tarihi" v={sheet.production_date} />
                    <KV k="Teslim tarihi" v={sheet.delivery_date} />
                    {/* "Bir ürünlerin teslim tarihi, bir de dikim teslim tarihi lazım." */}
                    <KV k="Dikim teslim" v={sheet.sewing_delivery_date} />
                    <KV k="1 ürüne metraj" v={sheet.meterage} />
                  </div>
                  {sheet.description?.trim() && (
                    <p className="mt-[1mm] whitespace-pre-wrap text-[6.6pt] leading-[1.3] text-[#374151]">
                      {sheet.description}
                    </p>
                  )}
                </Box>
              </div>

              <div className="flex w-[74mm] shrink-0 gap-[2mm]">
                <Drawing img={front} label="Teknik çizim — Ön" />
                <Drawing img={back} label="Teknik çizim — Arka" />
              </div>
            </div>

            {/* ── Orta blok: ölçüler | beden dağılımı + teslim edilenler ──── */}
            <div className="flex gap-[3mm]">
              {measurements.length > 0 && (
                <Box title="Ölçüler (cm)" className="flex-1">
                  <NumberedRows rows={measurements} twoColAt={14} />
                </Box>
              )}

              <div className="flex w-[74mm] shrink-0 flex-col gap-[2mm]">
                {sizes.length > 0 && (
                  <Box title="Beden Dağılımı">
                    <table className="w-full table-fixed border-collapse">
                      <thead>
                        <tr>
                          {sizes.map((s) => (
                            <th key={s} className="border border-[#d9dce1] bg-[#f3f4f6] py-[0.4mm] text-[5.8pt] font-bold uppercase text-[#374151]">
                              {s}
                            </th>
                          ))}
                          <th className="border border-[#d9dce1] bg-[#1f2937] py-[0.4mm] text-[5.8pt] font-bold uppercase text-white">
                            Toplam
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Beden grubu satırı — "XSmall'la small'a 1, medium'le
                            large'a 2, XXlarge'a 3 diyeceksin." */}
                        {sd?.groups && (
                          <tr>
                            {sizes.map((s) => (
                              <td key={s} className="border border-[#d9dce1] py-[0.35mm] text-center text-[6pt] text-[#6b7280]">
                                {sd.groups?.[s] ?? ""}
                              </td>
                            ))}
                            <td className="border border-[#d9dce1] bg-[#f9fafb]" />
                          </tr>
                        )}
                        <tr>
                          {sizes.map((s) => (
                            <td key={s} className="border border-[#d9dce1] py-[0.5mm] text-center text-[7.5pt] font-semibold tabular-nums">
                              {bySize[s] || 0}
                            </td>
                          ))}
                          <td className="border border-[#d9dce1] bg-[#f3f4f6] py-[0.5mm] text-center text-[7.5pt] font-bold tabular-nums">
                            {total}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </Box>
                )}

                {delivered.length > 0 && (
                  <Box title="Teslim Edilen Ürünler">
                    <NumberedRows
                      rows={delivered.map((d) => ({ no: d.no, label: d.label, value: d.qty }))}
                      twoColAt={12}
                    />
                  </Box>
                )}
              </div>
            </div>

            {/* ── Reçete — atölyenin ne kadar malzeme çekeceği ─────────────── */}
            {bom.length > 0 && (
              <Box title="Reçete — Malzeme Tüketimi">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-[#d9dce1]">
                      <th className="py-[0.35mm] text-left text-[5.6pt] font-semibold uppercase tracking-[0.04em] text-[#6b7280]">Malzeme</th>
                      <th className="py-[0.35mm] text-left text-[5.6pt] font-semibold uppercase tracking-[0.04em] text-[#6b7280]">Kod</th>
                      <th className="py-[0.35mm] text-right text-[5.6pt] font-semibold uppercase tracking-[0.04em] text-[#6b7280]">Tüketim</th>
                      <th className="py-[0.35mm] text-right text-[5.6pt] font-semibold uppercase tracking-[0.04em] text-[#6b7280]">Fire</th>
                      {showPricing && (
                        <th className="py-[0.35mm] text-right text-[5.6pt] font-semibold uppercase tracking-[0.04em] text-[#6b7280]">Tutar</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {bom.map((row) => (
                      <tr key={row.id} className="border-b border-[#eceef1] last:border-0">
                        <td className="py-[0.35mm] text-[6.8pt] leading-[1.25]">{row.material?.name ?? "—"}</td>
                        <td className="py-[0.35mm] text-[6.2pt] text-[#6b7280]">{row.material?.code ?? ""}</td>
                        <td className="py-[0.35mm] text-right text-[6.8pt] tabular-nums">
                          {row.consumption ?? ""} {row.material?.unit ?? ""}
                        </td>
                        <td className="py-[0.35mm] text-right text-[6.8pt] tabular-nums text-[#6b7280]">
                          {row.waste_pct ? `%${row.waste_pct}` : ""}
                        </td>
                        {showPricing && (
                          <td className="py-[0.35mm] text-right text-[6.8pt] font-semibold tabular-nums">
                            {formatMoney(bomLineCost(row))}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>
            )}

            {/* ── Talimatlar — iki kolon, boş olan basılmaz ────────────────── */}
            <div className="columns-2 gap-[3mm] [&>*]:mb-[2mm]">
              <TextBlock title="Kumaş Bilgisi" body={sheet.fabric_info} />
              <TextBlock title="Kumaş / Astar" body={sheet.fabric_lining} />
              <TextBlock title="Süslemeler ve Aksesuar" body={sheet.embellishments} />
              <TextBlock title="Aksesuar Bilgisi" body={sheet.accessories_info} />
              <TextBlock title="Dikiş Talimatı" body={sheet.sewing_instruction} />
              <TextBlock title="Özel İşçilik Notları" body={sheet.workmanship_notes} />
              <TextBlock title="Yıkama Talimatı" body={sheet.wash_instruction} />
              <TextBlock title="Üretim Fire Payı" body={sheet.production_waste} />
              <TextBlock title="Kalite Kontrol / Revizyon" body={sheet.qc_revision} />
              <TextBlock title="Revizyon Notları" body={sheet.revision_notes} />
            </div>

            {/* ── Fiyat — yalnız istendiğinde ─────────────────────────────── */}
            {showPricing && (unit > 0 || web > 0) && (
              <Box title="Maliyet / Fiyat">
                <div className="flex flex-wrap gap-x-[6mm] gap-y-[0.5mm]">
                  {unit > 0 && <KV k="Birim maliyet" v={formatMoney(unit)} />}
                  {web > 0 && <KV k="Web satış" v={formatMoney(web)} />}
                  {unit > 0 && total > 0 && (
                    <KV k="Toplam üretim" v={`${formatMoney(unit * total)} (${total} adet)`} />
                  )}
                </div>
              </Box>
            )}
          </div>

          {/* ── Alt bant: imza/onay — atölyeye giden kâğıdın karşılığı ────── */}
          <footer className="mt-auto flex items-end justify-between gap-[4mm] px-[3mm] pb-[2mm] pt-[1mm]">
            {["Hazırlayan", "Konfirme", "Üretici teslim aldı"].map((t) => (
              <div key={t} className="flex-1">
                <div className="mb-[0.4mm] h-[7mm] border-b border-[#9ca3af]" />
                <span className="text-[5.4pt] uppercase tracking-[0.04em] text-[#6b7280]">{t}</span>
              </div>
            ))}
          </footer>
        </div>
      </div>
    </div>
  );
}
