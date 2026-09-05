"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Boxes, Plus, Search, ChevronLeft, FileDown, Printer, Shirt, Scissors,
  Footprints, Handbag, FileSpreadsheet, ClipboardList, ShieldCheck, AlertTriangle,
  Pencil, FolderPlus, SwatchBook, Trash2, Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { deleteProductionSheet } from "@/lib/actions/production";
import { useConfirm } from "@/components/ui/useConfirm";
import { DownloadLink, downloadIconCls } from "@/components/ui/DownloadLink";
import { CoverImageButton } from "./CoverImageButton";
import { Button, IconButton } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CollectionTabs } from "./PaymentTable";
import { SeasonSwitch, type SwitchSeason } from "./SeasonSwitch";
import { Tile, TileGrid } from "@/components/ui/TileGrid";
import { COLLECTION_TAXONOMY, type CategoryNode } from "@/lib/collection/taxonomy";
import { labelOf, subLabelOf, subsOf } from "@/lib/collection/category-tree";
import { subPath, type SubCategory } from "@/lib/collection/taxonomy";
import { CategoryManagerDialog } from "./CategoryManagerDialog";
import type { ProductionSheet } from "@/types";

/** Tarayıcı yalnızca meta + kategori + fiyat + beden dağılımı taşır. */
export type CollectionItem = Pick<
  ProductionSheet,
  | "id" | "workspace_id" | "title" | "status" | "product_code" | "product_kind"
  | "producer" | "manufacturer_id" | "delivery_date" | "sewing_delivery_date"
  | "season" | "season_id" | "photo_refs" | "category" | "subcategory" | "description"
  | "pricing" | "size_distribution" | "measurements"
  | "confirmed_at" | "confirmed_by"
  | "created_by" | "updated_by" | "archived_at" | "created_at" | "updated_at"
>;

interface Props {
  sheets: CollectionItem[];
  isAdmin: boolean;
  /** Sezon bağlamı — boşsa seçici çizilmez (tablo migrate edilmemiş). */
  seasons?: SwitchSeason[];
  /** Düzenlenebilir kategori ağacı. Verilmezse kod varsayılanları. */
  categories?: CategoryNode[];
}

const UNCAT = "__uncat__";

/** Kategori kimliği — kutucuk rengi ve ikonu. Renkler kişi paletinden gelir ki
 *  uygulamanın tamamı tek renk ailesinde kalsın.
 *
 *  İKONLAR NESNEYİ ANLATIR, süslemez (Sıraç, 2026-08-30: "burdaki ikonlar
 *  profesyonel olsun"). Eskiden One-of-a-Kind'da `Sparkles` (parıltı) vardı:
 *  bir ürün grubunu değil, "özel/sihirli" fikrini anlatan dekoratif bir işaret.
 *  Yerine `Scissors` — terzi masası, elde kesilen tek parça. Accessories'te
 *  `Gem` (mücevher) yalnız takıyı çağrıştırıyordu; ağaçta şapka, çanta ve şal
 *  var, o yüzden `Handbag`. Dördü de aynı çizgi kalınlığında, hepsi somut
 *  bir nesne. */
const CATEGORY_IDENTITY: Record<string, { hex: string; icon: typeof Shirt }> = {
  one_of_a_kind: { hex: "#c98e20", icon: Scissors },   // altın
  ready_to_wear: { hex: "#5b6e8a", icon: Shirt },      // kurşuni
  shoes:         { hex: "#1796a4", icon: Footprints }, // turkuaz
  accessories:   { hex: "#7c3aed", icon: Handbag },    // mor
};
const UNCAT_IDENTITY = { hex: "#998a2e", icon: ClipboardList };

/* Kullanıcının açtığı kategorinin kimliği: renk ANAHTARDAN türetilir, rastgele
   değil — aynı kategori her açılışta aynı rengi alır. */
const NEW_CATEGORY_HUES = ["#1f6e4d", "#c98e20", "#2563c9", "#7c3aed", "#cc2e93", "#1796a4", "#d23320"];
function FALLBACK_IDENTITY(key: string): { hex: string; icon: typeof Shirt } {
  let h = 0;
  for (const ch of key) h = ((h * 31) + ch.charCodeAt(0)) & 0x7fffffff;
  // Kullanıcının açtığı kategori: kumaş kartelası — nötr ama moda dilinde.
  return { hex: NEW_CATEGORY_HUES[h % NEW_CATEGORY_HUES.length]!, icon: SwatchBook };
}

/** DownloadLink kendi <button>'ını çizer; Button primitifinin `secondary`
 *  görünümü buraya sınıf olarak taşınır ki araç çubuğundaki düğmeler aynı
 *  boyda ve aynı çerçevede dursun. */
const secondaryBtnCls =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-control border border-line bg-surface px-3.5 text-[13.5px] font-medium text-ink shadow-xs " +
  "transition-[background-color,border-color,color,transform] duration-150 ease-standard hover:border-line-strong hover:bg-surface-muted active:scale-[0.98]";

function norm(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c").replace(/İ/g, "i");
}

/**
 * Kapak görseli — ÜRÜNÜN KENDİ FOTOĞRAFI (dekupe).
 *
 * Aslı Hanım (2026-08-24): "Buradaki ana sayfadaki fotoğraflar dekupeler olsun.
 * Yani denim yelek kod kumaşı olmasın — denim yeleğin fotoğrafı olsun."
 * (2026-08-28'de aynı not tekrarlandı: "O fotoğraf normalde dekupesi fotoğrafı
 * olacak ürünün… O ilk fotoğraf olacak.")
 *
 * Liste eskiden teknik çizimi öne alıyordu; kapakta ürün yerine kalıp krokisi
 * ya da kumaş kodu görünüyordu. Sıralama artık şu: önce ürün fotoğrafı
 * (general), sonra süsleme/aksesuar gibi ürün üstü çekimler, kumaş swatch'ı ve
 * teknik çizim ise EN SON — başka hiçbir görsel yoksa.
 */
/* Kapak sırası: kullanıcının SEÇTİĞİ kapak her şeyin önünde. Föyde kapak
   yoksa eski davranış sürer (ürün fotoğrafı → teknik çizim). */
const COVER_PRIORITY = ["cover", "general", "embellishments", "accessories", "sewing", "fabric"] as const;

function coverImage(s: CollectionItem): string | null {
  const imgs = (Array.isArray(s.photo_refs) ? s.photo_refs : []).filter((i) => i?.url);
  for (const section of COVER_PRIORITY) {
    const hit = imgs.find((i) => i.section === section);
    if (hit) return hit.url;
  }
  // Hiç ürün görseli yoksa teknik çizim boş kapaktan iyidir.
  return imgs[0]?.url ?? null;
}

/**
 * Koleksiyon — önce KATEGORİ KUTUCUKLARI, sonra ürünler.
 *
 * Aslı Hanım (2026-08-28):
 *   "Koleksiyona girdiğin zaman bu board'daki gibi önce kategoriler çıksın.
 *    Sonra o kategoriye tıklayınca… solda ayrı bir tasarım yapma."
 *   "One of a kind'e girdiğimde de ürünler yine yan yana böyle çıksın.
 *    Hepsi aynı benzer format olsun."
 *
 * Soldaki katlanır kategori ağacı bu yüzden KALDIRILDI: aynı bilgiyi Pano'nun
 * kişi kartlarıyla aynı dilde, tek tıklamayla veren kutucuklar taşıyor.
 * Alt kategoriler de ağaç değil, kategori içinde tek satır çip.
 */
export function CollectionBrowser({ sheets, isAdmin, seasons = [], categories }: Props) {
  const tree = categories && categories.length > 0 ? categories : COLLECTION_TAXONOMY;
  // Sezona bağlanmamış föyler — taşımada sezon metni boş olanlar.
  const seasonlessCount = sheets.filter((s) => !s.season_id && s.status !== "archived").length;
  const [query, setQuery] = useState("");
  /* Kategori penceresi: `null` kapalı, `"new"` yeni kategori, düğüm ise
     düzenleme. Tek pencere üç işi de yapar (bkz. CategoryManagerDialog). */
  const [catEditor, setCatEditor] = useState<CategoryNode | "new" | null>(null);
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [isDeleting, startDelete] = useTransition();

  /* Kapak yükleme hatası — tek satır, insan dili. Kart üstünde yer yok,
     ızgaranın üstünde gösterilir. */
  const [coverError, setCoverError] = useState<string | null>(null);

  async function removeSheet(sheet: CollectionItem) {
    if (!(await ask({
      title: "Föy silinsin mi?",
      message: `“${sheet.title}” ve içindeki bütün bilgiler kalıcı olarak silinir.\nYalnız gözden kaldırmak istiyorsanız föyü açıp durumunu Arşiv yapın.`,
    }))) return;
    startDelete(async () => {
      await deleteProductionSheet(sheet.id);
      router.refresh();
    });
  }
  // Seçim: null = giriş ekranı (kutucuklar). category = ana kategori ya da UNCAT.
  const [selCat, setSelCat] = useState<string | null>(null);
  const [selSub, setSelSub] = useState<string | null>(null);

  const visible = useMemo(() => sheets.filter((s) => s.status !== "archived"), [sheets]);
  const q = norm(query.trim());

  // Kategori/alt kategori sayaçları (arşivsiz). Bunlar listeyi TARİF eder,
  // kimseyi puanlamaz — CLAUDE.md sadelik kuralının serbest bıraktığı taraf.
  const counts = useMemo(() => {
    const cat: Record<string, number> = {};
    const sub: Record<string, number> = {};
    for (const s of visible) {
      const c = s.category ?? UNCAT;
      cat[c] = (cat[c] ?? 0) + 1;
      if (s.category && s.subcategory) {
        const k = `${s.category}/${s.subcategory}`;
        sub[k] = (sub[k] ?? 0) + 1;
      }
    }
    return { cat, sub };
  }, [visible]);

  /** Kategori kutucuğunun kapağı — o kategorideki ilk ürün fotoğrafı. */
  /* KATEGORİ KUTUCUĞUNDA ÜRÜN FOTOĞRAFI YOK.
     Kutucuk, içindeki ilk ürünün fotoğrafını kapak yapıyordu: dolu kategori
     fotoğrafla, boş kategori ikonla çiziliyordu ve ızgara kendi içinde
     ikiye bölünüyordu (Sıraç, 2026-08-30: "ready to wear'deki resim kalksın,
     icon olmalı hepsi"). Kapak ayrıca rastgeleydi — kategoriyi değil, o an
     ilk sıradaki ürünü anlatıyordu. Kategori bir KAPIDIR; kimliğini sabit
     ikonu ve rengi taşır. Ürün fotoğrafı kapının ARDINDA, ürün kartında. */

  const filtered = useMemo(() => {
    return visible.filter((s) => {
      if (selCat) {
        const c = s.category ?? UNCAT;
        if (c !== selCat) return false;
        /* Seçilen dal ALT DALLARI da kapsar: "Hats" seçiliyken "Bucket Hat"
           işaretli föy de listede kalmalı — üst dal, altını içerir. */
        if (selSub && !subTreeKeys(selSub).has(s.subcategory ?? "")) return false;
      }
      if (!q) return true;
      return norm([s.title, s.product_code, s.product_kind, s.producer].filter(Boolean).join(" ")).includes(q);
    });
    // subTreeKeys yalnız `subs`e bağlıdır; o da selCat'ten türer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, q, selCat, selSub]);

  const hasUncat = (counts.cat[UNCAT] ?? 0) > 0;
  // Giriş ekranı: kategori seçilmemiş VE arama yapılmıyorsa kutucuklar.
  const showTiles = selCat === null && !q;
  const subs = selCat && selCat !== UNCAT ? subsOf(tree, selCat) : [];

  /* ÜÇ KADEMELİ AĞAÇ (Accessories › Hats › Bucket Hat).
     Sıraç (2026-08-30) koleksiyon yapısını üç seviye verdi. Çipler yine TEK
     satır: seçilen dalın altı varsa ikinci bir satır açılır — ağaç paneli ya da
     açılır kutu İCAT EDİLMEZ (tek tasarım dili). */
  const openPath = selSub ? subPath(subs, selSub) : [];
  const childRow: SubCategory[] = openPath[0]?.children ?? [];

  /** Bir dalın kendisi + tüm altları — süzgeç bunlarla eşleşir. */
  function subTreeKeys(key: string): Set<string> {
    const out = new Set<string>();
    const walk = (n: SubCategory) => { out.add(n.key); n.children?.forEach(walk); };
    const node = subPath(subs, key).slice(-1)[0];
    if (node) walk(node);
    else out.add(key);
    return out;
  }

  const headingLabel = !selCat
    ? (q ? `“${query.trim()}” için sonuçlar` : "Tüm ürünler")
    : selCat === UNCAT
      ? "Kategorisiz"
      : labelOf(tree, selCat);

  /* Arama kutusu ortak TextInput'tur (aynı boy, aynı odak halkası); görünür
     etiket yerine ikon + aria-label — arama kutusu evrensel bir desendir. */
  const search = (
    <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
      <TextInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ürün ara…"
        aria-label="Ürün ara"
        className="pl-9"
      />
    </div>
  );

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      {/* Başlık uygulama çubuğunda; aksiyonlar sekme satırının SAĞINDA —
          dört sekmede de aynı yerde, aynı yükseklikte. */}
      <h1 className="sr-only">Collection</h1>
      <CollectionTabs
        active="foy"
        actions={
          <>
            {/* Sezon — Ürün ekranlarının BAĞLAMI (Zedonk `SS 21 - WW` deseni).
                Koleksiyon, Maliyet ve Ödeme Tablosu aynı seçime uyar. */}
            <SeasonSwitch seasons={seasons} />
            {visible.length > 0 && (
              <DownloadLink
                href="/production/export-all"
                what="Tüm föyler"
                title="Tüm föyleri tek Excel dosyası olarak indir"
                className={secondaryBtnCls}
              >
                <FileSpreadsheet size={15} /> <span className="hidden sm:inline">Tümünü indir</span>
              </DownloadLink>
            )}
            {/* HİYERARŞİ: föy bir KATEGORİNİN altında doğar (2026-08-29:
                "önce kategori… sonra o kategorinin içine girip föy
                oluşturulmalı"). Bu yüzden "Yeni föy" YALNIZ bir kategorinin
                içindeyken görünür; kategori ızgarasındayken kategorisiz föy
                açılamaz. Kategoriler sabittir (aslifilinta.com menüsü). */}
            {selCat && selCat !== UNCAT && (
              <Link
                href={`/production/new?kategori=${selCat}${selSub ? `&alt=${selSub}` : ""}`}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-control bg-brand px-3.5 text-[13.5px] font-medium text-white shadow-xs transition-[background-color,transform] duration-150 ease-standard hover:bg-brand-strong active:scale-[0.98]"
              >
                {/* Sadece "Yeni föy". Kategori adı zaten başlıkta yazıyor;
                    düğmeye de eklemek ("One-of-a-Kind'a Yeni föy") satırı
                    şişiriyordu (2026-08-29). */}
                <Plus size={15} /> Yeni föy
              </Link>
            )}
          </>
        }
      />


      {dialog}

      {catEditor && (
        <CategoryManagerDialog
          category={catEditor === "new" ? null : catEditor}
          itemCount={catEditor === "new" ? 0 : (counts.cat[catEditor.key] ?? 0)}
          onClose={() => setCatEditor(null)}
        />
      )}

      {/* Sezonsuz föy uyarısı. Bunlar gizlenmiyor (her sezon bağlamında
          görünürler) ama sezona atanmadan "bu sezon ne ürettik" sorusu doğru
          cevaplanamaz — o yüzden sessizce geçilmiyor. */}
      {seasons.length > 0 && seasonlessCount > 0 && (
        <p className="mb-3 flex items-start gap-2 rounded-control border border-warning/30 bg-warning/10 px-3 py-2 text-[12.5px] text-ink">
          <AlertTriangle size={14} className="mt-px shrink-0 text-warning" />
          <span>
            <b className="font-semibold">{seasonlessCount} föyün sezonu yok.</b>{" "}
            Şimdilik her sezonda görünüyorlar; föyü açıp sezonunu seçerseniz
            sezon bazlı maliyet ve karşılaştırma doğru çalışır.
          </span>
        </p>
      )}

      {showTiles ? (
        /* ── GİRİŞ: kategoriler ────────────────────────────────────────────── */
        <div className="anim-fade">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight text-ink sm:text-xl">Ne üretiyoruz?</h2>
              <p className="mt-0.5 text-[13px] text-muted">
                Bir kategoriye tıklayın — ürünler açılır ve yeni föy o kategorinin altında oluşur.
              </p>
            </div>
            {search}
          </div>

          <TileGrid>
            {tree.map((c) => {
              const id = CATEGORY_IDENTITY[c.key] ?? FALLBACK_IDENTITY(c.key);
              const n = counts.cat[c.key] ?? 0;
              return (
                <Tile
                  key={c.key}
                  onClick={() => { setSelCat(c.key); setSelSub(null); }}
                  title={c.label}
                  meta={n > 0 ? `${n} ürün` : "Henüz ürün yok"}
                  icon={id.icon}
                  colorHex={id.hex}
                  /* Düzenleme kartın İÇİNE konamaz (kart bir düğmedir);
                     TileGrid eylemleri kardeş olarak çizer. */
                  /* Kalem HER ZAMAN görünür. Eskiden yalnız hover'da beliriyordu
                     ama sarmalayıcıda `group` olmadığı için hiç belirmiyordu;
                     telefonda zaten hover yok. Sessiz ikon düğmesi, kartın
                     köşesinde durur (2026-08-29). */
                  actions={
                    isAdmin ? (
                      <IconButton
                        variant="secondary"
                        size="sm"
                        onClick={() => setCatEditor(c)}
                        title={`${c.label} — düzenle`}
                        aria-label={`${c.label} kategorisini düzenle`}
                        className="text-subtle hover:text-ink"
                      >
                        <Pencil size={14} />
                      </IconButton>
                    ) : undefined
                  }
                />
              );
            })}
            {hasUncat && (
              <Tile
                onClick={() => { setSelCat(UNCAT); setSelSub(null); }}
                title="Kategorisiz"
                meta={`${counts.cat[UNCAT]} ürün`}
                icon={UNCAT_IDENTITY.icon}
                colorHex={UNCAT_IDENTITY.hex}
              />
            )}
            {/* YENİ KATEGORİ — ızgaranın son kutusu, kesikli çerçeveyle
                "burası henüz boş" der. Ayrı bir araç çubuğu düğmesi olsaydı
                kutucuklarla ilişkisi görünmezdi. */}
            {isAdmin && (
              <button
                onClick={() => setCatEditor("new")}
                /* Yarıçap komşu Tile ile AYNI (rounded-card) — ızgarada iki
                   farklı köşe yan yana durmasın. Hover'da yer değiştirme yok. */
                className="group flex w-full flex-col items-center justify-center gap-2.5 rounded-card border-2 border-dashed border-line px-3 pb-5 pt-6 text-center sm:gap-3 sm:px-4 sm:pb-6 sm:pt-8 transition-[border-color,background-color] duration-150 ease-standard hover:border-brand-ring hover:bg-brand-soft/30"
              >
                <span className="grid size-16 shrink-0 place-items-center rounded-full bg-surface-sunken text-subtle transition-colors duration-150 group-hover:bg-brand-soft group-hover:text-brand sm:size-24">
                  <FolderPlus size={30} strokeWidth={1.6} className="sm:size-[34px]" />
                </span>
                <span className="block text-[16px] font-semibold tracking-tight text-muted transition-colors duration-150 group-hover:text-brand-strong sm:text-[19px]">
                  Kategori ekle
                </span>
              </button>
            )}
          </TileGrid>
        </div>
      ) : (
        /* ── İÇERİDE: ürünler ──────────────────────────────────────────────── */
        <div className="anim-fade">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setSelCat(null); setSelSub(null); setQuery(""); }}
                className="shrink-0"
              >
                <ChevronLeft size={15} /> Kategoriler
              </Button>
              <h2 className="truncate text-[15px] font-semibold tracking-tight text-ink">{headingLabel}</h2>
            </div>
            {search}
          </div>

          {/* Alt kategoriler — ağaç değil, tek satır çip. */}
          {subs.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              <SubChip active={!selSub} onClick={() => setSelSub(null)}>Tümü</SubChip>
              {subs.map((sub) => {
                /* Boş alt kategori GİZLENMİYOR: yeni açılan bir alt kategori
                   içi dolana kadar görünmez kalıyordu ve kullanıcı "eklenmedi"
                   sanıyordu. Çip listeyi TARİF eder, kimseyi puanlamaz. */
                return (
                  <SubChip
                    key={sub.key}
                    active={openPath[0]?.key === sub.key}
                    onClick={() => setSelSub(sub.key)}
                  >
                    {subLabelOf(tree, selCat!, sub.key)}
                  </SubChip>
                );
              })}
            </div>
          )}

          {/* ÜÇÜNCÜ KADEME — yalnız seçilen dalın altı varsa. Bir tık geride
              durur: üst satır "neredeyim", bu satır "hangi tür". */}
          {childRow.length > 0 && (
            <div className="anim-fade-down mb-3 flex flex-wrap gap-1.5 pl-1">
              <SubChip active={selSub === openPath[0]?.key} onClick={() => setSelSub(openPath[0]!.key)}>
                Tümü
              </SubChip>
              {childRow.map((c) => (
                <SubChip key={c.key} active={selSub === c.key} onClick={() => setSelSub(c.key)}>
                  {c.label}
                </SubChip>
              ))}
            </div>
          )}

          {filtered.length === 0 ? (
            <EmptyState
              icon={Boxes}
              className="anim-fade-up"
              title={visible.length === 0 ? "Henüz ürün yok." : q ? "Eşleşen ürün yok." : "Bu kategoride ürün yok."}
              description={
                visible.length === 0
                  ? "İlk föyü oluşturmak için bir kategoriye girin."
                  : q
                    ? "Başka bir ad, kod ya da ürün cinsi deneyin."
                    : undefined
              }
            />
          ) : (
            /* EDİTORYAL DİZİLİM. Kart = görsel + ad; bu kadar.
               Görsel 3/4 dikey ve object-cover: giysi fotoğrafı bütün
               koleksiyonda aynı çerçevede durur. Sütun sayısı ekranla büyür
               (2xl'de altı) — geniş monitörde koleksiyon gerçekten yan yana
               görülür. Hover'da kart yer değiştirmez, görsel büyümez: gölge ve
               kenarlık yeter. */
            <>
            {coverError && (
              <p role="alert" className="anim-fade-down mb-3 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[13.5px] font-medium text-danger">
                {coverError}
              </p>
            )}
            <div className="stagger-children grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {filtered.map((s) => {
                const cover = coverImage(s);
                const sub = [s.product_code, s.product_kind].filter(Boolean).join(" · ");
                return (
                // Kart bir <div>: gezinme yayılmış (absolute inset-0) Link ile,
                // Excel indirme linki onun ÜSTÜNDE kardeş olarak durur. <a>
                // içinde <a> geçersiz HTML'dir ve hydration hatasıyla tüm
                // sayfayı istemcide yeniden çizdiriyordu (donma şikâyeti).
                <div
                  key={s.id}
                  className="group relative flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card transition-[box-shadow,border-color] duration-150 ease-standard hover:border-line-strong hover:shadow-card-hover"
                >
                  <Link
                    href={`/production/${s.id}`}
                    aria-label={s.title}
                    className="absolute inset-0 z-[1] rounded-card"
                  />
                  <div className="aspect-[3/4] w-full overflow-hidden bg-surface-muted">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      /* Görselsiz ürün düzeni bozmaz: aynı oran, nötr yüzey,
                         küçük ikon. */
                      <div className="grid h-full w-full place-items-center text-subtle">
                        <ImageIcon size={22} strokeWidth={1.5} aria-hidden />
                      </div>
                    )}
                  </div>
                  {/* Kart eylemleri — görselin köşesinde, kart linkinin ÜSTÜNDE.
                      Farede hover'da belirir (görsel temiz kalsın); parmakta
                      hover olmadığı için HER ZAMAN görünür — hover-only işlev
                      telefonda erişilemezdi. Yazdır önce: föyü üreticiye
                      vermenin ana yolu tek sayfalık kâğıt. */}
                  <div className="absolute right-2 top-2 z-[2] flex items-center gap-1 transition-opacity duration-150 pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100">
                    {/* KAPAK — karar ızgaraya bakarken verilir, föyün içinde
                        değil (2026-08-30). Föyü açmadan tek tıkla değiştirilir. */}
                    <CoverImageButton
                      sheetId={s.id}
                      title={s.title}
                      images={Array.isArray(s.photo_refs) ? s.photo_refs : []}
                      onError={setCoverError}
                    />
                    {/* İNDİRME ONAYI: dosya sistemin dışına çıkıyor ve
                        günlüğe yazılıyor (2026-08-29). */}
                    <DownloadLink
                      href={`/production/${s.id}/print`}
                      what={`“${s.title}” föyünün çıktısı`}
                      label="Çıktı al"
                      title="Tek sayfa çıktı — yazdır veya PDF"
                      className={downloadIconCls}
                    >
                      <Printer size={13} aria-hidden />
                      <span className="sr-only">Çıktı al</span>
                    </DownloadLink>
                    <DownloadLink
                      href={`/production/${s.id}/export`}
                      what={`“${s.title}” föyünün Excel dosyası`}
                      title="Föyü Excel olarak indir"
                      className={downloadIconCls}
                    >
                      <FileDown size={13} aria-hidden />
                      <span className="sr-only">Excel indir</span>
                    </DownloadLink>
                    {/* SİLME katalogda da var: föyü silmek için tek tek açmak
                        gerekiyordu (2026-08-29: "föy düzenleme silme gibi
                        olması gereken ne varsa olmalı"). Onay penceresi
                        çıkmadan hiçbir şey silinmez. */}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => removeSheet(s)}
                        disabled={isDeleting}
                        className={cn(downloadIconCls, "hover:text-danger disabled:pointer-events-none disabled:opacity-50")}
                        title="Föyü sil"
                        aria-label={`${s.title} föyünü sil`}
                      >
                        <Trash2 size={13} aria-hidden />
                      </button>
                    )}
                  </div>
                  {/* KONFİRME dışında rozet yok.
                      Kart eskiden üç durumdan birini gösteriyordu: "Konfirme" /
                      "N eksik" / "Hazır". Aslı Hanım (2026-08-24): "tamamlandı,
                      tamamlanmadı, eksik kaldı, geç kaldı… Öyle bir şey
                      istemiyoruz ki." Katalog ekranı ürünü göstermek içindir,
                      föyün ne kadar dolduğunu değil. */}
                  {s.confirmed_at && (
                    <Badge className="absolute left-2 top-2 z-[2] bg-success text-white shadow-card">
                      <ShieldCheck size={12} aria-hidden /> Konfirme
                    </Badge>
                  )}
                  {/* Ad birincil; kod ve cins tek satırda, sessiz. */}
                  <div className="border-t border-hairline px-3 py-2.5">
                    <h3 className="truncate text-[13.5px] font-medium tracking-tight text-ink transition-colors duration-150 group-hover:text-brand-strong" title={s.title}>
                      {s.title}
                    </h3>
                    {sub && (
                      <p className="mt-0.5 truncate text-[12px] text-subtle">{sub}</p>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SubChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "tap-target h-8 rounded-full px-3 text-[12.5px] font-medium transition-colors duration-150 active:scale-[0.97]",
        active
          ? "bg-brand-soft text-brand-strong ring-1 ring-brand-ring"
          : "bg-surface-muted text-muted hover:bg-surface-hover hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
