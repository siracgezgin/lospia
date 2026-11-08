"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Eye, Loader2, PenLine, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Field, SelectInput, TextArea, TextInput } from "@/components/ui/Field";
import { saveNewsletterWeek, searchStoreProducts, type NewsletterPatch } from "@/lib/actions/newsletter";
import {
  NEWSLETTER_STATUSES, SOCIAL_PLATFORMS, STORY_TITLES, WELCOME_HEADING,
  type NewsletterProduct, type NewsletterStatus, type NewsletterTextField, type NewsletterWeek,
  type SocialPlatform,
} from "@/lib/newsletter/model";

/**
 * BİR HAFTANIN BÜLTENİ — POSTANIN KENDİSİ GİBİ.
 *
 * Sıraç (08.11.2026, ekran görüntüsüyle): "Tasarım çok çok kötü ve bizim
 * newsletter'a benzemiyor. Format bu şekilde" → AF-Bulten-No01.html.
 * Ekran bir FORM değil, bültenin 600 px'lik çerçevesi: aynı sıra, aynı yazı
 * (başlıklar Georgia, metin Helvetica), aynı siyah düğmeler, iki sütun dekupe.
 * Değişen yazılar postanın ÜZERİNDE yazılır; görsel/bağlantı gibi postada
 * görünmeyen ayarlar taslaktaki TURUNCU NOT SATIRLARIYLA aynı dilde, bölümün
 * hemen üstünde durur. "Önizleme" notları gizler — gidecek posta kalır.
 *
 * Sabit kısımlar (üst satır + logo, CREATE AN ACCOUNT, imza, footer) taslaktan
 * aynen; her hafta yalnız açılış, ürünler, story ve sosyal medya değişir.
 *
 * KAYIT ALAN ALAN: alandan çıkınca o alan yazılır.
 * Görsel YÜKLENMEZ — sitedeki medya adresi yapıştırılır (depolama kotası).
 */

const SERIF = "font-[Georgia,'Times_New_Roman',serif]";
const SANS = "font-[Helvetica,Arial,sans-serif]";

export function NewsletterWeekEditor({
  initial, label, canEdit,
}: {
  initial: NewsletterWeek;
  label: string;
  canEdit: boolean;
}) {
  const [week, setWeek] = useState<NewsletterWeek>(initial);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const edit = canEdit && !preview;

  async function save(patch: NewsletterPatch) {
    setWeek((w) => ({ ...w, ...patch }));
    setError(null);
    setPending((n) => n + 1);
    try {
      const res = await saveNewsletterWeek(week.send_date, patch);
      if ("error" in res) setError(`Kaydedilemedi: ${res.error}`);
      else setWeek((w) => ({ ...w, id: res.week.id }));
    } catch (e) {
      setError(`Kaydedilemedi: ${e instanceof Error ? e.message : "bağlantı kurulamadı"}`);
    } finally {
      setPending((n) => n - 1);
    }
  }

  const set = (field: NewsletterTextField) => (v: string) => save({ [field]: v });
  const st = NEWSLETTER_STATUSES.find((s) => s.key === week.status) ?? NEWSLETTER_STATUSES[0];
  const social = SOCIAL_PLATFORMS.find((p) => p.key === week.social_platform) ?? SOCIAL_PLATFORMS[0];

  return (
    <div className="anim-fade">
      {/* ── Üst satır: hafta · durum · önizleme ─────────────────────────── */}
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
        {canEdit && (
          <button
            type="button"
            aria-pressed={preview}
            onClick={() => setPreview((p) => !p)}
            className={cn(
              "ml-auto inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-[13px] font-medium transition-all",
              preview ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink hover:bg-surface-hover",
            )}
          >
            {preview ? <><PenLine size={14} aria-hidden /> Düzenle</> : <><Eye size={14} aria-hidden /> Önizleme</>}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[13.5px] font-medium text-danger">
          {error}
        </p>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* ── POSTA ─────────────────────────────────────────────────────── */}
        <div className="min-w-0 rounded-card bg-[#f1f1f1] py-4 sm:px-4 sm:py-8">
          <div className="mx-auto w-full max-w-[600px] bg-white text-[#111] shadow-[0_1px_12px_rgba(0,0,0,.08)]">
            {/* 0 · Üst satır + logo — sabit */}
            <p className={cn(SANS, "px-6 pt-[34px] text-center text-[11px] leading-[1.4]")}>
              Can&apos;t see the images? <span className="underline">View in browser</span>
            </p>
            <div className="flex justify-center pb-[30px] pt-[26px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brands/asli-filinta-logo.png" alt="aslıfilinta" className="h-auto w-[220px] max-w-[60%]" />
            </div>

            {/* 1 · Açılış */}
            {edit && (
              <Note n="1" title="Açılış görseli">
                <NoteInput label="Görsel adresi (4:5)" value={week.opening_image_url} onCommit={set("opening_image_url")} />
                <NoteInput label="Bağlantı" value={week.opening_link} onCommit={set("opening_link")} />
                <NoteInput label="Başlık" value={week.opening_title} onCommit={set("opening_title")} />
              </Note>
            )}
            <MailImage src={week.opening_image_url} alt={week.opening_title} ratio="aspect-[4/5]" empty="Açılış görseli · 4:5" caption={week.opening_title} />
            <div className="h-14" />

            {/* 2 · Welcome */}
            <p className={cn(SERIF, "px-6 pb-[18px] text-center text-[28px] font-normal leading-[1.25] sm:px-10")}>{WELCOME_HEADING}</p>
            <InlineText
              value={week.welcome}
              onCommit={set("welcome")}
              disabled={!edit}
              placeholder="Welcome metni"
              pad="px-6 sm:px-14"
              text={cn(SANS, "text-center text-[15px] leading-[1.75]")}
            />
            <p className={cn(SANS, "px-6 pb-7 pt-[18px] text-center text-[15px] leading-[1.75] sm:px-14")}>
              With love from Anatolia,<br />Aslı Filinta
            </p>
            <MailButton>CREATE AN ACCOUNT</MailButton>
            <div className="h-10" />

            {/* 3 · Ürünler */}
            {edit && (
              <Note n="3" title="Ürünler">
                <NoteInput label="VIEW ALL PIECES bağlantısı" value={week.products_link} onCommit={set("products_link")} />
                <ProductSearch chosen={week.products} onPick={(p) => save({ products: [...week.products, p] })} />
              </Note>
            )}
            <div className="h-1" />
            <InlineText
              value={week.products_title}
              onCommit={set("products_title")}
              disabled={!edit}
              placeholder="Discover … Collection"
              pad="px-6 pb-8 sm:px-10"
              text={cn(SERIF, "text-center text-[26px] font-normal leading-[1.25]")}
            />
            <div className="grid grid-cols-2 px-2">
              {week.products.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onRemove={edit ? () => save({ products: week.products.filter((x) => x.id !== p.id) }) : undefined}
                />
              ))}
              {week.products.length < 2 &&
                Array.from({ length: 2 - week.products.length }).map((_, i) => (
                  <div key={i} className="px-1 pb-7">
                    <div className={cn(SANS, "flex aspect-[4/5] items-center justify-center bg-[#f1f1f1] px-3 text-center text-[12px] text-[#888]")}>
                      Ürün
                    </div>
                  </div>
                ))}
            </div>
            <MailButton>VIEW ALL PIECES</MailButton>
            <div className="h-10" />

            {/* 4 · Story */}
            {edit && (
              <Note n="4" title="Story">
                <NoteInput label="Görsel adresi (4:3)" value={week.story_image_url} onCommit={set("story_image_url")} />
                <NoteInput label="Story sayfası" value={week.story_url} onCommit={set("story_url")} />
              </Note>
            )}
            <MailImage src={week.story_image_url} alt={week.story_title} ratio="aspect-[4/3]" empty="Story görseli · 4:3" />
            <div className="h-10" />
            <InlineText
              value={week.story_text}
              onCommit={set("story_text")}
              disabled={!edit}
              placeholder="Story metni"
              pad="px-6 pb-6 sm:px-[72px]"
              text={cn(SANS, "text-center text-[15px] leading-[1.75]")}
            />
            <MailButton>
              {edit ? (
                <ButtonInput value={week.story_title} onCommit={set("story_title")} />
              ) : (
                (week.story_title || "STORY").toUpperCase()
              )}
            </MailButton>
            <datalist id="newsletter-story-titles">
              {STORY_TITLES.map((t) => <option key={t} value={t.toUpperCase()} />)}
            </datalist>
            <div className="h-10" />

            {/* 6 · Sosyal medya */}
            {edit && (
              <Note n="6" title="Haftanın sosyal medyası">
                <label className="block">
                  <span className="mb-0.5 block font-semibold">Platform</span>
                  <select
                    value={week.social_platform}
                    onChange={(e) => save({ social_platform: e.target.value as SocialPlatform })}
                    className="h-8 w-full rounded border border-[#e6cfc3] bg-white px-2 text-[12.5px] text-[#111]"
                  >
                    {SOCIAL_PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                </label>
                <NoteInput label="Görsel adresi (4:5)" value={week.social_image_url} onCommit={set("social_image_url")} />
                <NoteInput label="Bağlantı" value={week.social_link} onCommit={set("social_link")} />
              </Note>
            )}
            <MailImage src={week.social_image_url} alt={`Aslı Filinta on ${social.label}`} ratio="aspect-[4/5]" empty={`${social.label} görseli · 4:5`} />
            <div className="h-8" />
            <MailButton>{social.button}</MailButton>
            <div className="h-12" />

            {/* 7 · Footer — sabit */}
            <MailFooter />
          </div>
        </div>

        {/* ── YAN: postada görünmeyen bilgiler ─────────────────────────── */}
        <aside className="min-w-0 space-y-4 rounded-card border border-line bg-surface p-4 xl:sticky xl:top-4">
          <Field label="Konu satırı">
            <SideText value={week.subject} onCommit={set("subject")} disabled={!canEdit} />
          </Field>
          <Field label="Tema / koleksiyon">
            <SideText value={week.theme} onCommit={set("theme")} disabled={!canEdit} />
          </Field>
          <Field label="Notlar">
            <SideText value={week.notes} onCommit={set("notes")} disabled={!canEdit} multiline />
          </Field>
        </aside>
      </div>
    </div>
  );
}

/* ── Postanın parçaları ──────────────────────────────────────────────────── */

/** Taslaktaki turuncu not satırı — postada görünmez, yalnız düzenlerken. */
function Note({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className={cn(SANS, "space-y-2 bg-[#fbf3ee] px-3.5 py-2.5 text-[12px] leading-[1.45] text-[#a24a28]")}>
      <p><b>{n}</b>&nbsp; <b>{title}</b></p>
      {children}
    </div>
  );
}

function NoteInput({ label, value, onCommit }: { label: string; value: string; onCommit: (_v: string) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <label className="block">
      <span className="mb-0.5 block font-semibold">{label}</span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft.trim() !== value) onCommit(draft.trim()); }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        className="h-8 w-full min-w-0 rounded border border-[#e6cfc3] bg-white px-2 text-[12.5px] text-[#111] outline-none focus:border-[#a24a28]"
      />
    </label>
  );
}

function MailImage({ src, alt, ratio, empty, caption }: { src: string; alt: string; ratio: string; empty: string; caption?: string }) {
  if (/^https?:\/\//.test(src)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className="block h-auto w-full" />;
  }
  return (
    <div className={cn(SANS, "flex flex-col items-center justify-center gap-1 bg-[#f1f1f1] px-6 text-center text-[#888]", ratio)}>
      <span className="text-[13px]">{empty}</span>
      {caption && <span className={cn(SERIF, "text-[18px] text-[#555]")}>{caption}</span>}
    </div>
  );
}

function MailButton({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-center px-4 pt-1">
      <span className={cn(SANS, "inline-block max-w-full border border-[#111] bg-[#111] px-10 py-[15px] text-center text-[12px] tracking-[2.5px] text-white")}>
        {children}
      </span>
    </div>
  );
}

/** Story düğmesinin yazısı — düğmenin İÇİNDE yazılır. */
function ButtonInput({ value, onCommit }: { value: string; onCommit: (_v: string) => void }) {
  const [draft, setDraft] = useState(value);
  /* Genişliği YAZININ KENDİSİ belirler: görünmez bir kopya aynı hücrede
     durur, kutu onun kadar açılır. Karakter sayısıyla tahmin edilince
     Helvetica'nın geniş büyük harfleri sonda kırpılıyordu ("…EACH PIECI"). */
  return (
    <span className="inline-grid max-w-full">
      {/* px-3 ≠ input'un px-1'i BİLEREK: Chrome harf aralıklı kutuda metnin
          sonuna ~16 px ayırıyor; pay verilmezse son harf yine kırpılıyor. */}
      <span aria-hidden className="invisible col-start-1 row-start-1 whitespace-pre px-3 tracking-[2.5px]">
        {draft || "DÜĞME YAZISI"}
      </span>
      <input
        aria-label="Story düğmesinin yazısı"
        list="newsletter-story-titles"
        value={draft}
        placeholder="DÜĞME YAZISI"
        onChange={(e) => setDraft(e.target.value.toUpperCase())}
        onBlur={() => { if (draft.trim() !== value) onCommit(draft.trim()); }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        className="col-start-1 row-start-1 w-full min-w-0 bg-transparent px-1 text-center uppercase tracking-[2.5px] text-white outline-none placeholder:text-white/50"
      />
    </span>
  );
}

function ProductCard({ product: p, onRemove }: { product: NewsletterProduct; onRemove?: () => void }) {
  /* Ad iki satır: ürün + ayrıntı ("Silver Wirework / Tulle Headpiece"). */
  const words = p.name.split(/\s+/).filter(Boolean);
  const cut = Math.ceil(words.length / 2);
  return (
    <div className="relative px-1">
      <a href={p.url} target="_blank" rel="noreferrer" className="block text-[#111] no-underline">
        {p.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image_url} alt={p.name} className="block aspect-[4/5] w-full bg-[#f1f1f1] object-cover" loading="lazy" />
        ) : (
          <div className="aspect-[4/5] bg-[#f1f1f1]" />
        )}
        <div className={cn(SERIF, "px-1 pb-0.5 pt-[18px] text-center text-[16px] leading-[1.35]")}>{words.slice(0, cut).join(" ")}</div>
        <div className={cn(SANS, "px-1 pb-7 text-center text-[12px] leading-[1.5]")}>{words.slice(cut).join(" ")}</div>
      </a>
      {!p.in_stock && (
        <span className={cn(SANS, "absolute left-3 top-2 rounded-full bg-[#a62828] px-2 py-0.5 text-[11px] font-semibold text-white")}>Tükendi</span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${p.name} çıkar`}
          title="Çıkar"
          className="absolute right-3 top-2 inline-flex size-7 items-center justify-center rounded-full bg-white/90 text-[#111] shadow transition-all hover:bg-white hover:text-[#a62828]"
        >
          <X size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}

function MailFooter() {
  const menu = ["COLLECTIONS", "NEW IN", "STORIES", "ABOUT", "CONTACT"];
  return (
    <div className={cn(SANS, "bg-black px-4 pb-10 pt-[52px] text-center sm:px-7")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brands/af-mark.png" alt="Aslı Filinta" className="mx-auto mb-[30px] h-auto w-[120px] max-w-[28%]" />
      <div className="mb-[14px] space-y-[18px]">
        {menu.map((m) => <p key={m} className="text-[12px] leading-none tracking-[2.5px] text-white">{m}</p>)}
      </div>
      <div className="mt-[30px] border-t border-[#2a2a2a] pt-[26px] text-[11px] leading-[1.8] text-[#a6a6a6]">
        <p>You received this email because you are an Aslı Filinta email subscriber.<br />
          To be removed from our email list, please click here: <span className="text-[#d9d9d9] underline">unsubscribe</span></p>
        <p className="pt-4">© 2026 ASLI FILINTA · İstanbul, Türkiye</p>
      </div>
    </div>
  );
}

/* ── Postanın üzerinde yazılan metin ─────────────────────────────────────── */

function InlineText({
  value, onCommit, disabled, placeholder, pad, text,
}: {
  value: string;
  onCommit: (_v: string) => void;
  disabled: boolean;
  placeholder: string;
  /** Postadaki iç boşluk — taslaktaki td padding'i. */
  pad: string;
  /** Yazı tipi, boyu, hizası. */
  text: string;
}) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  /* Yükseklik metne göre — postada kaydırma çubuğu olmaz. */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, disabled]);

  if (disabled) {
    if (!value.trim()) return null;
    return <div className={cn(pad, text, "whitespace-pre-line")}>{value}</div>;
  }
  return (
    <div className={pad}>
      <textarea
        ref={ref}
        rows={1}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== value) onCommit(draft); }}
        className={cn(
          text,
          "block w-full resize-none overflow-hidden rounded-sm bg-transparent outline-none ring-[#a24a28]/40 transition-all placeholder:text-[#aaa] hover:bg-[#fbf3ee]/60 focus:bg-[#fbf3ee]/60 focus:ring-1",
        )}
      />
    </div>
  );
}

/* ── Yan alan ────────────────────────────────────────────────────────────── */

function SideText({ value, onCommit, disabled, multiline }: { value: string; onCommit: (_v: string) => void; disabled: boolean; multiline?: boolean }) {
  const [draft, setDraft] = useState(value);
  const commit = () => { if (draft !== value) onCommit(draft); };
  return multiline ? (
    <TextArea value={draft} rows={6} disabled={disabled} onChange={(e) => setDraft(e.target.value)} onBlur={commit} />
  ) : (
    <TextInput value={draft} disabled={disabled} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
  );
}

/* ── Siteden ürün arama (not satırının içinde) ───────────────────────────── */

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
      <span className="mb-0.5 block font-semibold">Ürün ekle</span>
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2" aria-hidden />
        <input
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
          className="h-8 w-full min-w-0 rounded border border-[#e6cfc3] bg-white pl-7 pr-7 text-[12.5px] text-[#111] outline-none focus:border-[#a24a28]"
        />
        {busy && <Loader2 size={13} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin" aria-hidden />}
      </div>
      {error && <p role="alert" className="mt-1 text-[#a62828]">{error}</p>}
      {hits && hits.length === 0 && <p className="mt-1">Sitede eşleşen ürün yok.</p>}
      {hits && hits.length > 0 && (
        <ul className="mt-1.5 max-h-72 divide-y divide-[#f0e2da] overflow-y-auto rounded border border-[#e6cfc3] bg-white text-[#111]">
          {hits.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={taken.has(p.id)}
                onClick={() => { onPick(p); setQuery(""); setHits(null); }}
                className="flex w-full items-center gap-2.5 px-2 py-1.5 text-left transition-all hover:bg-[#fbf3ee] disabled:opacity-50"
              >
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image_url} alt="" className="size-10 shrink-0 bg-[#f1f1f1] object-cover" loading="lazy" />
                ) : (
                  <span className="size-10 shrink-0 bg-[#f1f1f1]" aria-hidden />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{p.name}</span>
                  {!p.in_stock && <span className="text-[11.5px] font-semibold text-[#a62828]">Tükendi</span>}
                </span>
                {taken.has(p.id) ? <span className="text-[11.5px] text-[#888]">Seçili</span> : <Plus size={14} className="shrink-0" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
