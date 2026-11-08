"use client";

import { useRef, useState } from "react";
import { ExternalLink, Loader2, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Field, FieldGrid, SelectInput, TextArea, TextInput } from "@/components/ui/Field";
import { saveNewsletterWeek, searchStoreProducts, type NewsletterPatch } from "@/lib/actions/newsletter";
import {
  NEWSLETTER_STATUSES, STORY_TITLES, WELCOME_HEADING,
  type NewsletterProduct, type NewsletterStatus, type NewsletterTextField, type NewsletterWeek,
} from "@/lib/newsletter/model";

/**
 * BİR HAFTANIN BÜLTENİ — bölümler bültendeki SIRAYLA:
 * açılış → welcome → ürünler → story → Instagram.
 *
 * KAYIT ALAN ALAN: alandan çıkınca o alan yazılır ("Kaydet" düğmesi yok).
 * İki kişi aynı haftanın farklı alanlarını yazarsa biri ötekini ezmez.
 * Görsel YÜKLENMEZ — sitedeki medya adresi yapıştırılır (depolama kotası).
 */
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

  const st = NEWSLETTER_STATUSES.find((s) => s.key === week.status) ?? NEWSLETTER_STATUSES[0];
  const text = (field: NewsletterTextField, props: Omit<TextProps, "value" | "onCommit" | "disabled"> = {}) => (
    <CommitText {...props} value={week[field]} disabled={!canEdit} onCommit={(v) => save({ [field]: v })} />
  );

  return (
    <div className="anim-fade space-y-4">
      <div className="flex flex-wrap items-center gap-3">
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
        <span className="ml-auto inline-flex min-h-5 items-center gap-1.5 text-[12.5px] text-muted" role="status">
          {pending > 0 ? <><Loader2 size={13} className="animate-spin" aria-hidden /> Kaydediliyor…</> : week.id ? "Kaydedildi" : null}
        </span>
      </div>

      {error && (
        <p role="alert" className="rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[13.5px] font-medium text-danger">
          {error}
        </p>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Section title="Genel">
          <FieldGrid>
            <Field label="Tema / koleksiyon">{text("theme")}</Field>
            <Field label="Konu satırı">{text("subject")}</Field>
          </FieldGrid>
        </Section>

        <Section title="1 · Açılış">
          <div className="space-y-3.5">
            <Field label="Başlık">{text("opening_title")}</Field>
            <FieldGrid>
              <Field label="Görsel adresi" hint="Sitedeki görselin adresi">{text("opening_image_url", { type: "url" })}</Field>
              <Field label="Bağlantı" hint="YouTube ya da sitedeki sayfa">{text("opening_link", { type: "url" })}</Field>
            </FieldGrid>
            <Preview src={week.opening_image_url} />
          </div>
        </Section>

        <Section title="2 · Welcome metni">
          <Field label={WELCOME_HEADING} hint="Aslı Hanım'ın onaylı metni — her bültende aynı">{text("welcome", { multiline: true, rows: 10 })}</Field>
        </Section>

        <Section title="3 · Ürünler">
          <div className="space-y-3.5">
            <Field label="Bölüm başlığı">{text("products_title")}</Field>
            <Products
              products={week.products}
              disabled={!canEdit}
              onChange={(products) => save({ products })}
            />
          </div>
        </Section>

        <Section title="4 · Story">
          <FieldGrid>
            <Field label="Başlık" hint="Her hafta farklı olsun">{text("story_title", { list: "newsletter-story-titles" })}</Field>
            <Field label="Story bağlantısı">{text("story_url", { type: "url" })}</Field>
          </FieldGrid>
          <datalist id="newsletter-story-titles">
            {STORY_TITLES.map((t) => <option key={t} value={t} />)}
          </datalist>
        </Section>

        <Section title="5 · Instagram">
          <div className="space-y-3.5">
            <FieldGrid>
              <Field label="Görsel adresi">{text("social_image_url", { type: "url" })}</Field>
              <Field label="Bağlantı">{text("social_link", { type: "url" })}</Field>
            </FieldGrid>
            <Preview src={week.social_image_url} />
          </div>
        </Section>

        <Section title="Notlar" className="xl:col-span-2">
          <Field label="Not / yorum">{text("notes", { multiline: true, rows: 4 })}</Field>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, className, children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("min-w-0 rounded-card border border-line bg-surface p-4", className)}>
      <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.05em] text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Preview({ src }: { src: string }) {
  if (!/^https?:\/\//.test(src)) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="max-h-56 w-auto max-w-full rounded-control border border-line bg-white object-contain" />
  );
}

/* ── Alandan çıkınca kaydeden metin kutusu ─────────────────────────────── */

type TextProps = {
  value: string;
  onCommit: (_v: string) => void;
  disabled?: boolean;
  multiline?: boolean;
  rows?: number;
  type?: string;
  placeholder?: string;
  list?: string;
};

function CommitText({ value, onCommit, disabled, multiline, rows, type, placeholder, list }: TextProps) {
  const [draft, setDraft] = useState(value);
  const commit = () => { if (draft !== value) onCommit(draft); };
  if (multiline) {
    return (
      <TextArea value={draft} rows={rows} disabled={disabled} placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit} />
    );
  }
  return (
    <TextInput value={draft} type={type} disabled={disabled} placeholder={placeholder} list={list}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
  );
}

/* ── Ürünler: siteden ara, seç ─────────────────────────────────────────── */

function Products({
  products, disabled, onChange,
}: {
  products: NewsletterProduct[];
  disabled: boolean;
  onChange: (_p: NewsletterProduct[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<NewsletterProduct[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  /* Canlı satış sitesi — her tuşta istek gitmesin, yazma durunca gitsin. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedule = (q: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void search(q), 350);
  };

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

  const chosen = new Set(products.map((p) => p.id));

  return (
    <div className="space-y-3">
      {products.length > 0 ? (
        <ul className="grid gap-2">
          {products.map((p) => (
            <li key={p.id} className="flex min-w-0 items-center gap-3 rounded-control border border-line p-2">
              <Thumb src={p.image_url} />
              <div className="min-w-0 flex-1">
                <a href={p.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[13.5px] font-medium text-ink hover:underline">
                  <span className="truncate">{p.name}</span>
                  <ExternalLink size={12} className="shrink-0 text-subtle" aria-hidden />
                </a>
                {!p.in_stock && <span className="text-[12px] font-medium text-danger">Tükendi</span>}
              </div>
              {!disabled && (
                <button
                  type="button"
                  aria-label={`${p.name} çıkar`}
                  title="Çıkar"
                  onClick={() => onChange(products.filter((x) => x.id !== p.id))}
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-control text-muted transition-all hover:bg-surface-hover hover:text-danger"
                >
                  <X size={15} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">Henüz ürün seçilmedi.</p>
      )}

      {!disabled && (
        <div>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
            <TextInput
              type="search"
              aria-label="Sitede ürün ara"
              placeholder="Sitede ürün ara"
              value={query}
              onChange={(e) => { setQuery(e.target.value); schedule(e.target.value); }}
              className="pl-9"
            />
            {busy && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted" aria-hidden />}
          </div>
          {error && <p role="alert" className="mt-1.5 text-[12.5px] text-danger">{error}</p>}
          {hits && hits.length === 0 && (
            <p className="mt-2 text-[13px] text-muted">Sitede eşleşen ürün yok. Ürün adları sitede İngilizce — İngilizce adıyla arayın.</p>
          )}
          {hits && hits.length > 0 && (
              <ul className="mt-2 max-h-80 divide-y divide-line overflow-y-auto rounded-control border border-line">
                {hits.map((p) => {
                  const taken = chosen.has(p.id);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={taken}
                        onClick={() => { onChange([...products, p]); setQuery(""); setHits(null); }}
                        className="flex w-full items-center gap-3 px-2 py-1.5 text-left transition-all hover:bg-surface-hover disabled:opacity-50"
                      >
                        <Thumb src={p.image_url} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] text-ink">{p.name}</span>
                          {!p.in_stock && <span className="text-[12px] font-medium text-danger">Tükendi</span>}
                        </span>
                        {taken ? (
                          <span className="text-[12px] text-muted">Seçili</span>
                        ) : (
                          <Plus size={15} className="shrink-0 text-muted" aria-hidden />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Thumb({ src }: { src: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="size-12 shrink-0 rounded-control bg-white object-cover" loading="lazy" />
  ) : (
    <span className="size-12 shrink-0 rounded-control bg-surface-sunken" aria-hidden />
  );
}
