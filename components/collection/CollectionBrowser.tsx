"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Boxes, Plus, Search, ChevronLeft, FileDown, Printer, Shirt, Sparkles,
  Footprints, Gem, FileSpreadsheet, ClipboardList, ShieldCheck, AlertTriangle,
  Pencil, FolderPlus, Package, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { deleteProductionSheet } from "@/lib/actions/production";
import { useConfirm } from "@/components/ui/useConfirm";
import { CollectionTabs } from "./PaymentTable";
import { SeasonSwitch, type SwitchSeason } from "./SeasonSwitch";
import { Tile, TileGrid } from "@/components/ui/TileGrid";
import { COLLECTION_TAXONOMY, type CategoryNode } from "@/lib/collection/taxonomy";
import { labelOf, subLabelOf, subsOf } from "@/lib/collection/category-tree";
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
 *  uygulamanın tamamı tek renk ailesinde kalsın. */
const CATEGORY_IDENTITY: Record<string, { hex: string; icon: typeof Shirt }> = {
  one_of_a_kind: { hex: "#c98e20", icon: Sparkles },   // altın
  ready_to_wear: { hex: "#5b6e8a", icon: Shirt },      // kurşuni
  shoes:         { hex: "#1796a4", icon: Footprints }, // turkuaz
  accessories:   { hex: "#7c3aed", icon: Gem },        // mor
};
const UNCAT_IDENTITY = { hex: "#998a2e", icon: ClipboardList };

/* Kullanıcının açtığı kategorinin kimliği: renk ANAHTARDAN türetilir, rastgele
   değil — aynı kategori her açılışta aynı rengi alır. */
const NEW_CATEGORY_HUES = ["#1f6e4d", "#c98e20", "#2563c9", "#7c3aed", "#cc2e93", "#1796a4", "#d23320"];
function FALLBACK_IDENTITY(key: string): { hex: string; icon: typeof Shirt } {
  let h = 0;
  for (const ch of key) h = ((h * 31) + ch.charCodeAt(0)) & 0x7fffffff;
  return { hex: NEW_CATEGORY_HUES[h % NEW_CATEGORY_HUES.length]!, icon: Package };
}

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
const COVER_PRIORITY = ["general", "embellishments", "accessories", "sewing", "fabric"] as const;

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
  const catCover = useMemo(() => {
    const out: Record<string, string> = {};
    for (const s of visible) {
      const c = s.category ?? UNCAT;
      if (out[c]) continue;
      const img = coverImage(s);
      if (img) out[c] = img;
    }
    return out;
  }, [visible]);

  const filtered = useMemo(() => {
    return visible.filter((s) => {
      if (selCat) {
        const c = s.category ?? UNCAT;
        if (c !== selCat) return false;
        if (selSub && s.subcategory !== selSub) return false;
      }
      if (!q) return true;
      return norm([s.title, s.product_code, s.product_kind, s.producer].filter(Boolean).join(" ")).includes(q);
    });
  }, [visible, q, selCat, selSub]);

  const hasUncat = (counts.cat[UNCAT] ?? 0) > 0;
  // Giriş ekranı: kategori seçilmemiş VE arama yapılmıyorsa kutucuklar.
  const showTiles = selCat === null && !q;
  const subs = selCat && selCat !== UNCAT ? subsOf(tree, selCat) : [];

  const headingLabel = !selCat
    ? (q ? `“${query.trim()}” için sonuçlar` : "Tüm ürünler")
    : selCat === UNCAT
      ? "Kategorisiz"
      : labelOf(tree, selCat);

  const search = (
    <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ürün ara…"
        className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-subtle transition-[border-color,box-shadow] duration-150 hover:border-line-strong focus:outline-none focus:ring-2 focus:ring-brand-ring focus:border-brand-ring"
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
              <a
                href="/production/export-all"
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-muted transition-[background-color,border-color,color,transform] duration-150 ease-standard hover:border-line-strong hover:bg-surface-muted hover:text-ink active:scale-[0.98]"
                title="Tüm föyleri tek Excel dosyası olarak indir"
              >
                <FileSpreadsheet size={15} /> <span className="hidden sm:inline">Tümünü indir</span>
              </a>
            )}
            {/* HİYERARŞİ: föy bir KATEGORİNİN altında doğar (2026-08-29:
                "önce kategori… sonra o kategorinin içine girip föy
                oluşturulmalı"). Bu yüzden "Yeni föy" YALNIZ bir kategorinin
                içindeyken görünür; kategori ızgarasındayken kategorisiz föy
                açılamaz. Kategoriler sabittir (aslifilinta.com menüsü). */}
            {selCat && selCat !== UNCAT && (
              <Link
                href={`/production/new?kategori=${selCat}${selSub ? `&alt=${selSub}` : ""}`}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13px] font-medium text-white transition-[background-color,transform] duration-150 ease-standard hover:bg-brand-strong active:scale-[0.98]"
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
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
          <AlertTriangle size={14} className="mt-px shrink-0 text-amber-600" />
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
                  photoUrl={catCover[c.key]}
                  icon={id.icon}
                  colorHex={id.hex}
                  /* Düzenleme kartın İÇİNE konamaz (kart bir düğmedir);
                     TileGrid eylemleri kardeş olarak çizer. */
                  actions={
                    isAdmin ? (
                      <button
                        onClick={() => setCatEditor(c)}
                        title={`${c.label} — düzenle`}
                        aria-label={`${c.label} kategorisini düzenle`}
                        className="grid size-7 place-items-center rounded-lg bg-surface/85 text-subtle opacity-0 shadow-card backdrop-blur transition-all duration-150 hover:bg-surface hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 md:opacity-0"
                      >
                        <Pencil size={13} />
                      </button>
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
                photoUrl={catCover[UNCAT]}
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
                className="group flex w-full flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-line px-3 pb-5 pt-6 text-center sm:gap-3 sm:px-4 sm:pb-6 sm:pt-8 transition-all duration-200 ease-standard hover:-translate-y-0.5 hover:border-brand-ring hover:bg-brand-soft/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
              >
                <span className="grid size-16 shrink-0 place-items-center rounded-full bg-surface-sunken text-subtle transition-colors duration-200 group-hover:bg-brand-soft group-hover:text-brand sm:size-24">
                  <FolderPlus size={30} strokeWidth={1.6} className="sm:size-[34px]" />
                </span>
                <span className="block text-[16px] font-semibold tracking-tight text-muted transition-colors duration-200 group-hover:text-brand-strong sm:text-[19px]">
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
              <button
                onClick={() => { setSelCat(null); setSelSub(null); setQuery(""); }}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] font-medium text-muted transition-colors duration-150 hover:border-line-strong hover:text-ink"
              >
                <ChevronLeft size={15} /> Kategoriler
              </button>
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
                  <SubChip key={sub.key} active={selSub === sub.key} onClick={() => setSelSub(sub.key)}>
                    {subLabelOf(tree, selCat!, sub.key)}
                  </SubChip>
                );
              })}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="anim-fade-up rounded-2xl border border-line bg-surface px-6 py-14 text-center shadow-card">
              <div className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-surface-sunken text-subtle">
                <Boxes size={20} />
              </div>
              <p className="text-sm text-subtle">
                {visible.length === 0
                  ? "Henüz ürün eklenmedi. İlk föyü oluşturun."
                  : "Bu kategoride ürün bulunamadı."}
              </p>
            </div>
          ) : (
            <div className="stagger-children grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {filtered.map((s) => (
                // Kart bir <div>: gezinme yayılmış (absolute inset-0) Link ile,
                // Excel indirme linki onun ÜSTÜNDE kardeş olarak durur. <a>
                // içinde <a> geçersiz HTML'dir ve hydration hatasıyla tüm
                // sayfayı istemcide yeniden çizdiriyordu (donma şikâyeti).
                <div
                  key={s.id}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition-[box-shadow,transform,border-color] duration-200 ease-standard hover:-translate-y-px hover:border-line-strong hover:shadow-card-hover"
                >
                  <Link
                    href={`/production/${s.id}`}
                    aria-label={s.title}
                    className="absolute inset-0 z-[1] rounded-2xl focus-visible:outline-2 focus-visible:outline-brand-ring"
                  />
                  {/* Görsel — katalog hissi: hover'da yumuşak zoom, kart içinde kırpılır */}
                  {/* Kare yerine 3/4 dikey — giysi fotoğrafı kare çerçevede
                      baştan ayaktan kırpılıyordu. */}
                  <div className="aspect-[3/4] w-full overflow-hidden bg-surface-muted">
                    {coverImage(s) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={coverImage(s)!}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-300 ease-standard group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-subtle">
                        <ClipboardList size={24} strokeWidth={1.75} />
                      </div>
                    )}
                  </div>
                  {/* Çıktı — yalnızca hover'da, köşede sade; kart linkinin üstünde.
                      Yazdır önce gelir: föyü üreticiye vermenin ana yolu artık
                      tek sayfalık kâğıt, Excel düzenleme/veri formatı. */}
                  <div className="absolute right-2 top-2 z-[2] flex items-center gap-1 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
                    <a
                      href={`/production/${s.id}/print`}
                      className="tap-target rounded-md bg-surface/90 p-1.5 text-subtle shadow-sm backdrop-blur transition-[color,transform] duration-150 hover:text-ink active:scale-95"
                      title="Tek sayfa çıktı — yazdır veya PDF"
                    >
                      <Printer size={13} />
                    </a>
                    <a
                      href={`/production/${s.id}/export`}
                      className="tap-target rounded-md bg-surface/90 p-1.5 text-subtle shadow-sm backdrop-blur transition-[color,transform] duration-150 hover:text-ink active:scale-95"
                      title="Föyü Excel olarak indir"
                    >
                      <FileDown size={13} />
                    </a>
                    {/* SİLME katalogda da var: föyü silmek için tek tek açmak
                        gerekiyordu (2026-08-29: "föy düzenleme silme gibi
                        olması gereken ne varsa olmalı"). Onay penceresi
                        çıkmadan hiçbir şey silinmez. */}
                    {isAdmin && (
                      <button
                        onClick={() => removeSheet(s)}
                        disabled={isDeleting}
                        className="tap-target rounded-md bg-surface/90 p-1.5 text-subtle shadow-sm backdrop-blur transition-[color,transform] duration-150 hover:text-danger active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                        title="Föyü sil"
                      >
                        <Trash2 size={13} />
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
                    <span className="absolute left-2 top-2 z-[2] inline-flex items-center gap-1 rounded-md bg-emerald-600/95 px-1.5 py-0.5 text-[10.5px] font-semibold text-white shadow-sm">
                      <ShieldCheck size={10} /> Konfirme
                    </span>
                  )}
                  <div className="border-t border-hairline p-3">
                    <h3 className="truncate text-sm font-medium tracking-tight text-ink transition-colors duration-150 group-hover:text-brand-strong">
                      {s.title}
                    </h3>
                    {s.product_kind && (
                      <p className="mt-0.5 truncate text-[12px] text-subtle">{s.product_kind}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
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
        "rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors duration-150 active:scale-[0.97]",
        active
          ? "bg-brand-soft text-brand-strong ring-1 ring-brand-ring"
          : "bg-surface-muted text-muted hover:bg-surface-hover hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
