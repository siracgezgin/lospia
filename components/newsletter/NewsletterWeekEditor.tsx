"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, ArrowDown, ArrowUp, Download, ExternalLink, ImagePlus, Loader2, Plus, Search, Trash2, X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Field, FieldGrid, SelectInput, TextArea, TextInput } from "@/components/ui/Field";
import { useConfirm } from "@/components/ui/useConfirm";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import { prepareImageUpload, SHEET_IMAGE_ACCEPT, SHEET_IMAGE_TYPES } from "@/lib/utils/compress-image";
import {
  listSiteCategories, listSiteStories, saveNewsletterWeek, searchStoreProducts,
  type NewsletterPatch, type SiteCategory, type SiteStory,
} from "@/lib/actions/newsletter";
import { MailPreview } from "@/components/newsletter/MailPreview";
import {
  BLOCK_TYPES, blockButton, blockNeedsLink, exportWeek, MAX_BLOCKS, NEWSLETTER_STATUSES, newBlock,
  SOCIAL_PLATFORMS, STORY_TITLES,
  type BlockType, type NewsletterBlock, type NewsletterProduct, type NewsletterStatus,
  type NewsletterTextField, type NewsletterWeek, type SocialPlatform,
} from "@/lib/newsletter/model";

/**
 * BİR HAFTANIN BÜLTENİ — numaralı bloklar + yanda posta önizlemesi.
 *
 * Aslı Hanım (8.11.2026): "Aynı formatta koy. Yukarıya başlık koy, altına
 * linkini koy, altına yazı diye koy… Çoktan seçmeli vereceksin: story,
 * kategori, ürün… Metin de; onu başa koyarsan welcome metni olur… Bunları
 * bir, iki, üç, dört diye seçip yerlerini de değiştirebilirsin."
 * Sıraç: "Buraya resim yükleme yeri yapayım, siz resmi buraya yükleyin."
 *
 * Her blok AYNI kart: numara, tür, yukarı/aşağı, sil; türe göre yalnız gereken
 * alanlar. Görsel BİLGİSAYARDAN yüklenir (küçültülerek, uzun kenar 1600);
 * ürün, story ve kategori siteden seçilir — adres kutusu yok. Ekranda
 * açıklama cümlesi yok (Aslı Hanım: "amatörce"), yalnız alan adları ve
 * gerçek bir sorun olduğunda uyarı.
 *
 * KAYIT: konu satırı/tema/not alandan çıkınca; bloklar her yapısal
 * değişiklikte (ekle, taşı, sil, seç, yükle) ve yazı alanından çıkınca.
 */

const BUCKET = "production-sheets";
const LINK_STATUSES: NewsletterStatus[] = ["onayda", "onaylandi"];
/** Sosyal medya bloğu boş bağlantıda platformun hesabına gider — eksik sayılmaz. */
const linkMissing = (b: NewsletterBlock) => blockNeedsLink(b.type) && b.type !== "sosyal" && !b.link.trim();

export function NewsletterWeekEditor({
  initial, label, canEdit, workspaceId, usedProducts, usedStories,
}: {
  initial: NewsletterWeek;
  label: string;
  canEdit: boolean;
  workspaceId: string;
  /** Ürün kimliği → daha önce kullanıldığı bülten tarihi. */
  usedProducts: Record<string, string>;
  /** Story adresi → son 4 haftada kullanıldığı bülten tarihi. */
  usedStories: Record<string, string>;
}) {
  const [week, setWeek] = useState<NewsletterWeek>(initial);
  const [saved, setSaved] = useState<NewsletterWeek>(initial);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const { ask, dialog } = useConfirm();

  /* Siteden seçim listeleri — hafta açılınca bir kez. */
  const [stories, setStories] = useState<SiteStory[] | null>(null);
  const [categories, setCategories] = useState<SiteCategory[] | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const [s, c] = await Promise.all([listSiteStories(), listSiteCategories()]);
      if (!alive) return;
      setStories("error" in s ? [] : s.stories);
      setCategories("error" in c ? [] : c.categories);
    })();
    return () => { alive = false; };
  }, []);

  async function save(patch: NewsletterPatch) {
    setWeek((w) => ({ ...w, ...patch }));
    setError(null);
    setPending((n) => n + 1);
    try {
      const res = await saveNewsletterWeek(week.send_date, patch);
      if ("error" in res) { setError(`Kaydedilemedi: ${res.error}`); return; }
      setSaved((sv) => ({ ...sv, ...patch }));
      setWeek((w) => ({ ...w, id: res.id }));
    } catch (e) {
      setError(`Kaydedilemedi: ${e instanceof Error ? e.message : "bağlantı kurulamadı"}`);
    } finally {
      setPending((n) => n - 1);
    }
  }

  /* ── Bloklar ─────────────────────────────────────────────────────────── */
  const blocks = week.blocks;
  const saveBlocks = (next: NewsletterBlock[]) => save({ blocks: next });
  /** Yazarken yalnız ekranda; `commit` ile kaydolur. */
  const editBlock = (id: string, patch: Partial<NewsletterBlock>, commit = false) => {
    const next = blocks.map((b) => (b.id === id ? { ...b, ...patch } : b));
    if (commit) void saveBlocks(next);
    else setWeek((w) => ({ ...w, blocks: next }));
  };
  const commitBlocks = () => {
    if (JSON.stringify(blocks) !== JSON.stringify(saved.blocks)) void saveBlocks(blocks);
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    void saveBlocks(next);
  };
  const remove = async (b: NewsletterBlock, i: number) => {
    const type = BLOCK_TYPES.find((t) => t.key === b.type)?.label ?? "";
    if (!(await ask({ title: `${i + 1}. blok silinsin mi?`, message: type, confirmLabel: "Sil", tone: "danger" }))) return;
    void saveBlocks(blocks.filter((x) => x.id !== b.id));
    if (b.image_path) void removeUpload(b.image_path);
  };
  const add = (type: BlockType) => {
    setAdding(false);
    void saveBlocks([...blocks, newBlock(type, crypto.randomUUID())]);
  };
  const changeType = (b: NewsletterBlock, type: BlockType) =>
    editBlock(b.id, { type, platform: type === "sosyal" ? (b.platform || "instagram") : b.platform }, true);

  /* ── Metin alanları ──────────────────────────────────────────────────── */
  const bind = (field: NewsletterTextField) => ({
    value: week[field],
    disabled: !canEdit,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setWeek((w) => ({ ...w, [field]: e.target.value })),
    onBlur: () => { if (week[field] !== saved[field]) void save({ [field]: week[field] }); },
  });

  /* ── Uyarılar (engellemez) ───────────────────────────────────────────── */
  const linkCheck = LINK_STATUSES.includes(week.status);
  const missingLink = blocks.map((b, i) => ({ b, no: i + 1 })).filter(({ b }) => linkMissing(b));
  const openingLinks = new Set(blocks.filter((b) => b.type === "gorsel" && b.link).map((b) => b.link.replace(/\/+$/, "")));

  function warningsFor(b: NewsletterBlock): string[] {
    const out: string[] = [];
    if (b.type === "urun") {
      for (const p of b.products) {
        if (!p.in_stock) out.push(`Tükendi: ${p.name}`);
        const used = usedProducts[String(p.id)];
        if (used) out.push(`${p.name} · ${fmtDate(used)} bülteninde kullanıldı`);
        if (openingLinks.has(p.url.replace(/\/+$/, ""))) out.push(`${p.name} açılış görselinde de var`);
      }
    }
    if (b.type === "story" && b.link && usedStories[b.link]) out.push(`Bu story ${fmtDate(usedStories[b.link])} bülteninde kullanıldı`);
    if (linkCheck && linkMissing(b)) out.push("Bağlantı eksik");
    return out;
  }

  function downloadPlan() {
    const blob = new Blob([JSON.stringify(exportWeek(week), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bulten-${week.send_date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const st = NEWSLETTER_STATUSES.find((s) => s.key === week.status) ?? NEWSLETTER_STATUSES[0];

  return (
    <div className="anim-fade">
      {/* ── Üst satır ─────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold capitalize tracking-tight text-ink sm:text-xl">{label}</h2>
        <SelectInput
          aria-label="Durum"
          value={week.status}
          disabled={!canEdit}
          onChange={(e) => save({ status: e.target.value as NewsletterStatus })}
          className={cn("h-9 w-auto rounded-full border-transparent font-semibold", st.tone)}
        >
          {NEWSLETTER_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </SelectInput>
        <span className="inline-flex min-h-5 items-center gap-1.5 text-[12.5px] text-muted" role="status">
          {pending > 0 ? <><Loader2 size={13} className="animate-spin" aria-hidden /> Kaydediliyor…</> : week.id ? "Kaydedildi" : null}
        </span>
        <button
          type="button"
          onClick={downloadPlan}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-4 text-[13px] font-medium text-ink transition-all hover:bg-surface-hover"
        >
          <Download size={14} aria-hidden /> Planı indir
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[13.5px] font-medium text-danger">{error}</p>
      )}
      {linkCheck && missingLink.length > 0 && (
        <p role="alert" className="mb-4 flex items-center gap-2 rounded-control border border-warning/30 bg-warning/10 px-3 py-2 text-[13.5px] font-medium text-warning">
          <AlertTriangle size={15} aria-hidden />
          Bağlantı eksik: {missingLink.map((m) => `${m.no}. blok`).join(", ")}
        </p>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-4">
          {/* ── Genel ─────────────────────────────────────────────────── */}
          <section className="rounded-card border border-line bg-surface p-4 sm:p-5">
            <Field label="Konu satırı">
              <TextInput {...bind("subject")} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
            </Field>
            <details className="mt-3">
              <summary className="cursor-pointer select-none text-[12.5px] font-medium text-muted hover:text-ink">Tema ve notlar</summary>
              <div className="mt-3 space-y-3.5">
                <Field label="Tema / koleksiyon"><TextInput {...bind("theme")} /></Field>
                <Field label="Notlar"><TextArea {...bind("notes")} rows={3} /></Field>
              </div>
            </details>
          </section>

          {/* ── Bloklar ───────────────────────────────────────────────── */}
          {blocks.map((b, i) => (
            <BlockCard
              key={b.id}
              no={i + 1}
              block={b}
              first={i === 0}
              last={i === blocks.length - 1}
              canEdit={canEdit}
              warnings={warningsFor(b)}
              workspaceId={workspaceId}
              stories={stories}
              categories={categories}
              onEdit={(patch) => editBlock(b.id, patch)}
              onCommitEdit={(patch) => editBlock(b.id, patch, true)}
              onBlurCommit={commitBlocks}
              onType={(t) => changeType(b, t)}
              onMove={(d) => move(i, d)}
              onRemove={() => remove(b, i)}
            />
          ))}

          {canEdit && blocks.length < MAX_BLOCKS && (
            adding ? (
              <div className="flex flex-wrap items-center gap-2 rounded-card border border-dashed border-line-strong bg-surface p-3">
                {BLOCK_TYPES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => add(t.key)}
                    className="h-9 rounded-full border border-line-strong bg-surface px-4 text-[13px] font-medium text-ink transition-all hover:bg-surface-hover"
                  >
                    {t.label}
                  </button>
                ))}
                <button type="button" onClick={() => setAdding(false)} aria-label="Vazgeç" className="ml-auto inline-flex size-9 items-center justify-center rounded-full text-muted transition-all hover:bg-surface-hover">
                  <X size={15} aria-hidden />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-card border border-dashed border-line-strong text-[13.5px] font-medium text-muted transition-all hover:border-ink hover:text-ink"
              >
                <Plus size={16} aria-hidden /> Blok ekle
              </button>
            )
          )}
        </div>

        {/* ── POSTA — yazdıkça güncellenir ───────────────────────────── */}
        <div className="min-w-0 xl:sticky xl:top-4">
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-muted">Önizleme</h3>
          <div className="overflow-y-auto rounded-card bg-[#f1f1f1] p-3 xl:max-h-[calc(100dvh-7rem)]">
            {/* 600 px'lik posta sütuna sığsın diye küçültülür; telefonda
                kendi genişliğinde akar. */}
            <div className="mx-auto w-fit max-w-full xl:[zoom:0.625]">
              <MailPreview week={week} />
            </div>
          </div>
        </div>
      </div>
      {dialog}
    </div>
  );
}

const fmtDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long" });

/** Panele yüklenen görseli depodan siler — kayıt zaten kaldırıldı; başarısızsa sessiz. */
async function removeUpload(path: string) {
  try { await createBrowserSupabase().storage.from(BUCKET).remove([path]); } catch { /* yetim kalır, zararsız */ }
}

/* ── Blok kartı ──────────────────────────────────────────────────────────── */

function BlockCard({
  no, block: b, first, last, canEdit, warnings, workspaceId, stories, categories,
  onEdit, onCommitEdit, onBlurCommit, onType, onMove, onRemove,
}: {
  no: number;
  block: NewsletterBlock;
  first: boolean;
  last: boolean;
  canEdit: boolean;
  warnings: string[];
  workspaceId: string;
  stories: SiteStory[] | null;
  categories: SiteCategory[] | null;
  onEdit: (_p: Partial<NewsletterBlock>) => void;
  onCommitEdit: (_p: Partial<NewsletterBlock>) => void;
  onBlurCommit: () => void;
  onType: (_t: BlockType) => void;
  onMove: (_d: -1 | 1) => void;
  onRemove: () => void;
}) {
  const text = (field: "title" | "text" | "link" | "button") => ({
    value: b[field],
    disabled: !canEdit,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onEdit({ [field]: e.target.value }),
    onBlur: onBlurCommit,
  });
  const enter = { onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") e.currentTarget.blur(); } };

  const image = (
    <BlockImage
      block={b}
      disabled={!canEdit}
      prefix={`${workspaceId}/bulten/`}
      onChange={(image_url, image_path) => {
        if (b.image_path && b.image_path !== image_path) void removeUpload(b.image_path);
        onCommitEdit({ image_url, image_path });
      }}
    />
  );
  const linkField = (label: string) => (
    <Field label={label}><TextInput type="url" {...text("link")} {...enter} /></Field>
  );
  const categoryPick = (onPick: (_c: SiteCategory) => void) => (
    <Field label="Kategori">
      <SelectInput
        value={categories?.some((c) => c.id === b.ref) ? b.ref : ""}
        disabled={!canEdit || !categories}
        onChange={(e) => { const c = categories?.find((x) => x.id === e.target.value); if (c) onPick(c); }}
      >
        <option value="">{categories ? "Seçin" : "Yükleniyor…"}</option>
        {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </SelectInput>
    </Field>
  );
  const buttonField = b.type === "urun" || b.type === "kategori" || b.type === "story" || b.type === "sosyal";

  return (
    <section className="rounded-card border border-line bg-surface p-4 sm:p-5">
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-ink text-[13px] font-semibold tabular-nums text-white">{no}</span>
        <SelectInput
          aria-label={`${no}. bloğun türü`}
          value={b.type}
          disabled={!canEdit}
          onChange={(e) => onType(e.target.value as BlockType)}
          className="h-9 w-auto font-semibold"
        >
          {BLOCK_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </SelectInput>
        {canEdit && (
          <div className="ml-auto flex items-center gap-1">
            <IconBtn label="Yukarı taşı" disabled={first} onClick={() => onMove(-1)}><ArrowUp size={15} /></IconBtn>
            <IconBtn label="Aşağı taşı" disabled={last} onClick={() => onMove(1)}><ArrowDown size={15} /></IconBtn>
            <IconBtn label="Sil" danger onClick={onRemove}><Trash2 size={15} /></IconBtn>
          </div>
        )}
      </header>

      {warnings.length > 0 && (
        <ul className="mb-4 space-y-1">
          {warnings.map((w) => (
            <li key={w} className="flex items-start gap-1.5 text-[12.5px] font-medium text-warning">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden /> {w}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-3.5">
        {b.type === "gorsel" && (
          <>
            {image}
            <FieldGrid>
              {categoryPick((c) => onCommitEdit({ link: c.url, ref: c.id }))}
              {linkField("Bağlantı")}
            </FieldGrid>
            <Field label="Başlık"><TextInput {...text("title")} {...enter} /></Field>
          </>
        )}

        {b.type === "metin" && (
          <>
            <Field label="Başlık"><TextInput {...text("title")} {...enter} /></Field>
            <Field label="Yazı"><TextArea {...text("text")} rows={4} /></Field>
          </>
        )}

        {b.type === "urun" && (
          <>
            <Field label="Başlık"><TextInput {...text("title")} {...enter} /></Field>
            <ChosenProducts
              products={b.products}
              onRemove={canEdit ? (id) => onCommitEdit({ products: b.products.filter((p) => p.id !== id) }) : undefined}
            />
            {canEdit && <ProductSearch chosen={b.products} onPick={(p) => onCommitEdit({ products: [...b.products, p] })} />}
            <FieldGrid>
              {categoryPick((c) => onCommitEdit({ link: c.url, ref: c.id }))}
              {linkField("Bağlantı")}
            </FieldGrid>
          </>
        )}

        {b.type === "kategori" && (
          <>
            <FieldGrid>
              {categoryPick((c) => onCommitEdit({ link: c.url, ref: c.id, title: b.title || c.name }))}
              {linkField("Bağlantı")}
            </FieldGrid>
            <Field label="Başlık"><TextInput {...text("title")} {...enter} /></Field>
            <Field label="Yazı"><TextArea {...text("text")} rows={3} /></Field>
            {image}
          </>
        )}

        {b.type === "story" && (
          <>
            <Field label="Story">
              <SelectInput
                value={stories?.some((s) => s.id === b.ref) ? b.ref : ""}
                disabled={!canEdit || !stories}
                onChange={(e) => {
                  const s = stories?.find((x) => x.id === e.target.value);
                  if (!s) return;
                  if (b.image_path) void removeUpload(b.image_path);
                  onCommitEdit({ ref: s.id, title: s.title, link: s.url, image_url: s.image_url, image_path: "", text: s.excerpt });
                }}
              >
                <option value="">{stories ? "Seçin" : "Yükleniyor…"}</option>
                {(stories ?? []).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </SelectInput>
            </Field>
            {image}
            <Field label="Yazı"><TextArea {...text("text")} rows={4} /></Field>
            {b.link && (
              <a href={b.link} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 text-[12.5px] text-muted hover:text-ink hover:underline">
                <ExternalLink size={12} className="shrink-0" aria-hidden />
                <span className="truncate">{b.link.replace(/^https?:\/\/(www\.)?/, "")}</span>
              </a>
            )}
          </>
        )}

        {b.type === "sosyal" && (
          <>
            <FieldGrid>
              <Field label="Platform">
                <SelectInput
                  value={b.platform || "instagram"}
                  disabled={!canEdit}
                  onChange={(e) => onCommitEdit({ platform: e.target.value as SocialPlatform })}
                >
                  {SOCIAL_PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </SelectInput>
              </Field>
              {linkField("Gönderi bağlantısı")}
            </FieldGrid>
            {image}
          </>
        )}

        {buttonField && (
          <details className="pt-1">
            <summary className="cursor-pointer select-none text-[12.5px] font-medium text-muted hover:text-ink">Gelişmiş</summary>
            <div className="mt-3">
              <Field label="Düğme yazısı">
                <TextInput
                  {...text("button")}
                  {...enter}
                  placeholder={blockButton({ ...b, button: "" })}
                  list={b.type === "story" ? `story-titles-${b.id}` : undefined}
                />
              </Field>
              {b.type === "story" && (
                <datalist id={`story-titles-${b.id}`}>
                  {STORY_TITLES.map((t) => <option key={t} value={t.toUpperCase()} />)}
                </datalist>
              )}
            </div>
          </details>
        )}
      </div>
    </section>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-control text-muted transition-all hover:bg-surface-hover disabled:opacity-30",
        danger ? "hover:text-danger" : "hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/* ── Görsel: bilgisayardan yükle ─────────────────────────────────────────── */

function BlockImage({
  block: b, disabled, prefix, onChange,
}: {
  block: NewsletterBlock;
  disabled: boolean;
  prefix: string;
  onChange: (_url: string, _path: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  async function upload(file: File | undefined) {
    if (!file) return;
    setErr(null);
    setBusy(true);
    try {
      /* Uzun kenar 1600, ~%78 kalite — depo 1 GB, posta için yeterli. */
      const prep = await prepareImageUpload(file, { accept: SHEET_IMAGE_TYPES, maxDim: 1600, quality: 0.78 });
      if ("error" in prep) { setErr(prep.error); return; }
      const ext = prep.file.type === "image/png" ? "png" : prep.file.type === "image/webp" ? "webp" : prep.file.type === "image/gif" ? "gif" : "jpeg";
      const path = `${prefix}${crypto.randomUUID()}.${ext}`;
      const supabase = createBrowserSupabase();
      const { error } = await supabase.storage.from(BUCKET).upload(path, prep.file, { contentType: prep.file.type, upsert: false });
      if (error) { setErr(`Görsel yüklenemedi: ${error.message}`); return; }
      /* Kova herkese açık: adres postada ve afcom-seo'da süresiz okunur. */
      onChange(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, path);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Görsel yüklenemedi.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const pick = () => inputRef.current?.click();
  return (
    <div
      onDragOver={(e) => { if (!disabled && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy && !disabled) void upload(e.dataTransfer.files[0]); }}
    >
      <span className="mb-1 block text-[12.5px] font-medium text-muted">Görsel</span>
      {b.image_url ? (
        <div className={cn("flex items-center gap-3 rounded-control border border-line p-2", over && "ring-2 ring-brand-ring")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={b.image_url} alt="" className="size-20 shrink-0 rounded-control bg-[#f1f1f1] object-cover" />
          {!disabled && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={pick} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-control border border-line-strong px-3 text-[13px] font-medium text-ink transition-all hover:bg-surface-hover">
                {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ImagePlus size={14} aria-hidden />} Değiştir
              </button>
              <button type="button" onClick={() => onChange("", "")} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-control px-3 text-[13px] font-medium text-muted transition-all hover:bg-surface-hover hover:text-danger">
                <X size={14} aria-hidden /> Kaldır
              </button>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={pick}
          disabled={disabled || busy}
          className={cn(
            "flex h-24 w-full items-center justify-center gap-2 rounded-control border border-dashed border-line-strong text-[13.5px] font-medium text-muted transition-all hover:border-ink hover:text-ink disabled:opacity-60",
            over && "border-brand ring-2 ring-brand-ring",
          )}
        >
          {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <ImagePlus size={16} aria-hidden />} Görsel yükle
        </button>
      )}
      <input ref={inputRef} type="file" accept={SHEET_IMAGE_ACCEPT} aria-label="Görsel dosyası" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
      {err && <p role="alert" className="mt-1.5 text-[12.5px] text-danger">{err}</p>}
    </div>
  );
}

/* ── Ürünler ─────────────────────────────────────────────────────────────── */

function ChosenProducts({ products, onRemove }: { products: NewsletterProduct[]; onRemove?: (_id: number) => void }) {
  if (!products.length) return null;
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {products.map((p) => (
        <li key={p.id} className="flex min-w-0 items-center gap-3 rounded-control border border-line p-2">
          {p.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.image_url} alt="" className="size-14 shrink-0 rounded-control bg-[#f1f1f1] object-cover" loading="lazy" />
          ) : (
            <span className="size-14 shrink-0 rounded-control bg-surface-sunken" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <a href={p.url} target="_blank" rel="noreferrer" className="flex items-start gap-1 text-[13.5px] font-medium leading-snug text-ink hover:underline">
              <span className="line-clamp-2">{p.name}</span>
              <ExternalLink size={12} className="mt-1 shrink-0 text-subtle" aria-hidden />
            </a>
            {!p.in_stock && <span className="text-[12px] font-medium text-danger">Tükendi</span>}
          </div>
          {onRemove && (
            <button
              type="button"
              aria-label={`${p.name} çıkar`}
              title="Çıkar"
              onClick={() => onRemove(p.id)}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-control text-muted transition-all hover:bg-surface-hover hover:text-danger"
            >
              <X size={15} aria-hidden />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function ProductSearch({ chosen, onPick }: { chosen: NewsletterProduct[]; onPick: (_p: NewsletterProduct) => void }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<NewsletterProduct[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  /* Canlı satış sitesi — her tuşta istek gitmesin, yazma durunca gitsin. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function search(q: string) {
    const n = ++seq.current;
    if (q.trim().length < 2) { setHits(null); setError(null); setBusy(false); return; }
    setBusy(true);
    const res = await searchStoreProducts(q);
    if (n !== seq.current) return; // daha yeni bir arama başladı
    setBusy(false);
    if ("error" in res) { setError(res.error); setHits(null); }
    else { setError(null); setHits(res.products); }
  }

  const taken = new Set(chosen.map((p) => p.id));

  return (
    <div>
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
        <TextInput
          type="search"
          aria-label="Sitede ürün ara"
          placeholder="Ürün ara (İngilizce ad)"
          value={query}
          onChange={(e) => {
            const q = e.target.value;
            setQuery(q);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => void search(q), 350);
          }}
          className="pl-9"
        />
        {busy && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted" aria-hidden />}
      </div>
      {error && <p role="alert" className="mt-1.5 text-[12.5px] text-danger">{error}</p>}
      {hits && hits.length === 0 && <p className="mt-2 text-[13px] text-muted">Sitede eşleşen ürün yok.</p>}
      {hits && hits.length > 0 && (
        <ul className="mt-2 max-h-80 divide-y divide-line overflow-y-auto rounded-control border border-line">
          {hits.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={taken.has(p.id)}
                onClick={() => { onPick(p); setQuery(""); setHits(null); }}
                className="flex w-full items-center gap-3 px-2 py-1.5 text-left transition-all hover:bg-surface-hover disabled:opacity-50"
              >
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image_url} alt="" className="size-11 shrink-0 rounded-control bg-[#f1f1f1] object-cover" loading="lazy" />
                ) : (
                  <span className="size-11 shrink-0 rounded-control bg-surface-sunken" aria-hidden />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] text-ink">{p.name}</span>
                  {!p.in_stock && <span className="text-[12px] font-medium text-danger">Tükendi</span>}
                </span>
                {taken.has(p.id) ? <span className="text-[12px] text-muted">Seçili</span> : <Plus size={15} className="shrink-0 text-muted" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
