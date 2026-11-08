"use client";

import { useRef, useState } from "react";
import { ExternalLink, Loader2, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Field, FieldGrid, SelectInput, TextArea, TextInput } from "@/components/ui/Field";
import { saveNewsletterWeek, searchStoreProducts, type NewsletterPatch } from "@/lib/actions/newsletter";
import { MailPreview } from "@/components/newsletter/MailPreview";
import {
  ACCOUNT_BUTTON, NEWSLETTER_STATUSES, PRODUCTS_BUTTON, SOCIAL_PLATFORMS, STORY_TITLES,
  WELCOME_HEADING, WELCOME_SIGNOFF,
  type NewsletterProduct, type NewsletterStatus, type NewsletterTextField, type NewsletterWeek,
  type SocialPlatform,
} from "@/lib/newsletter/model";

/**
 * BİR HAFTANIN BÜLTENİ — solda form, sağda posta.
 *
 * Sıraç (08.11.2026) iki sürümü de geri çevirdi:
 *   • ilk form: "bizim newsletter'a benzemiyor" + sonradan "orantısız ve
 *     mantıksızdı" — bölümler iki sütunda zikzak diziliyor (1 sağda, 2 solda),
 *     kısa kutunun yanında boşluk kalıyordu;
 *   • postanın üzerinde düzenleme: "daha kötü, anlaşılır durmuyor".
 * Seçtiği düzen: TEK SÜTUN form, bölümler BÜLTENDEKİ SIRAYLA alt alta, hepsi
 * aynı genişlikte; yanda yazdıkça güncellenen posta önizlemesi (telefonda
 * formun altında). Satırlarda alanlar ikişerli; tek kalan alan tam genişlik
 * (yarım alanın yanında boşluk bırakmamak için).
 *
 * KAYIT ALAN ALAN: yazarken önizleme anında değişir, alandan çıkınca kaydolur.
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
  /* Sunucudaki son hâl — alandan çıkınca yalnız DEĞİŞEN alan gider. */
  const [saved, setSaved] = useState<NewsletterWeek>(initial);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function save(patch: NewsletterPatch) {
    setWeek((w) => ({ ...w, ...patch }));
    setError(null);
    setPending((n) => n + 1);
    try {
      const res = await saveNewsletterWeek(week.send_date, patch);
      if ("error" in res) { setError(`Kaydedilemedi: ${res.error}`); return; }
      setSaved((sv) => ({ ...sv, ...patch }));
      setWeek((w) => ({ ...w, id: res.week.id }));
    } catch (e) {
      setError(`Kaydedilemedi: ${e instanceof Error ? e.message : "bağlantı kurulamadı"}`);
    } finally {
      setPending((n) => n - 1);
    }
  }

  /** Metin alanı: yazarken yalnız ekranda, çıkınca kaydeder. */
  const bind = (field: NewsletterTextField) => ({
    value: week[field],
    disabled: !canEdit,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setWeek((w) => ({ ...w, [field]: e.target.value })),
    onBlur: () => {
      if (week[field] !== saved[field]) void save({ [field]: week[field] });
    },
  });
  const enterBlurs = { onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") e.currentTarget.blur(); } };

  const st = NEWSLETTER_STATUSES.find((s) => s.key === week.status) ?? NEWSLETTER_STATUSES[0];
  const social = SOCIAL_PLATFORMS.find((p) => p.key === week.social_platform) ?? SOCIAL_PLATFORMS[0];

  return (
    <div className="anim-fade">
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
        <span className="ml-auto inline-flex min-h-5 items-center gap-1.5 text-[12.5px] text-muted" role="status">
          {pending > 0 ? <><Loader2 size={13} className="animate-spin" aria-hidden /> Kaydediliyor…</> : week.id ? "Kaydedildi" : null}
        </span>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[13.5px] font-medium text-danger">
          {error}
        </p>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* ── FORM — bültendeki sırayla ──────────────────────────────────── */}
        <div className="min-w-0 space-y-4">
          <Section title="Genel">
            <FieldGrid>
              <Field label="Konu satırı"><TextInput {...bind("subject")} {...enterBlurs} /></Field>
              <Field label="Tema / koleksiyon"><TextInput {...bind("theme")} {...enterBlurs} /></Field>
            </FieldGrid>
          </Section>

          <Section n={1} title="Açılış">
            <div className="space-y-3.5">
              <Field label="Başlık"><TextInput {...bind("opening_title")} {...enterBlurs} /></Field>
              <FieldGrid>
                <Field label="Görsel adresi"><TextInput {...bind("opening_image_url")} {...enterBlurs} /></Field>
                <Field label="Bağlantı"><TextInput {...bind("opening_link")} {...enterBlurs} /></Field>
              </FieldGrid>
            </div>
          </Section>

          <Section n={2} title="Welcome">
            <div className="space-y-3.5">
              <Field label="Başlık"><TextInput {...bind("welcome_heading")} placeholder={WELCOME_HEADING} {...enterBlurs} /></Field>
              <Field label="Metin"><TextArea {...bind("welcome")} rows={9} /></Field>
              <FieldGrid>
                <Field label="İmza"><TextArea {...bind("welcome_signoff")} rows={2} placeholder={WELCOME_SIGNOFF} /></Field>
                <Field label="Düğme yazısı"><TextInput {...bind("account_button")} placeholder={ACCOUNT_BUTTON} {...enterBlurs} /></Field>
              </FieldGrid>
            </div>
          </Section>

          <Section n={3} title="Ürünler">
            <div className="space-y-3.5">
              <Field label="Bölüm başlığı"><TextInput {...bind("products_title")} {...enterBlurs} /></Field>
              <ChosenProducts
                products={week.products}
                onRemove={canEdit ? (id) => save({ products: week.products.filter((x) => x.id !== id) }) : undefined}
              />
              {canEdit && <ProductSearch chosen={week.products} onPick={(p) => save({ products: [...week.products, p] })} />}
              <FieldGrid>
                <Field label="Düğme yazısı"><TextInput {...bind("products_button")} placeholder={PRODUCTS_BUTTON} {...enterBlurs} /></Field>
                <Field label="Düğme bağlantısı"><TextInput {...bind("products_link")} {...enterBlurs} /></Field>
              </FieldGrid>
            </div>
          </Section>

          <Section n={4} title="Story">
            <div className="space-y-3.5">
              <FieldGrid>
                <Field label="Görsel adresi"><TextInput {...bind("story_image_url")} {...enterBlurs} /></Field>
                <Field label="Story sayfası"><TextInput {...bind("story_url")} {...enterBlurs} /></Field>
              </FieldGrid>
              <Field label="Metin"><TextArea {...bind("story_text")} rows={3} /></Field>
              <Field label="Düğme yazısı">
                <TextInput {...bind("story_title")} list="newsletter-story-titles" {...enterBlurs} />
              </Field>
              <datalist id="newsletter-story-titles">
                {STORY_TITLES.map((t) => <option key={t} value={t.toUpperCase()} />)}
              </datalist>
            </div>
          </Section>

          <Section n={5} title="Sosyal medya">
            <div className="space-y-3.5">
              <FieldGrid>
                <Field label="Platform">
                  <SelectInput
                    value={week.social_platform}
                    disabled={!canEdit}
                    onChange={(e) => save({ social_platform: e.target.value as SocialPlatform })}
                  >
                    {SOCIAL_PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </SelectInput>
                </Field>
                <Field label="Bağlantı"><TextInput {...bind("social_link")} placeholder={social.url} {...enterBlurs} /></Field>
                <Field label="Görsel adresi"><TextInput {...bind("social_image_url")} {...enterBlurs} /></Field>
                <Field label="Düğme yazısı"><TextInput {...bind("social_button")} placeholder={social.button} {...enterBlurs} /></Field>
              </FieldGrid>
            </div>
          </Section>

          <Section title="Notlar">
            <TextArea aria-label="Notlar" {...bind("notes")} rows={4} />
          </Section>
        </div>

        {/* ── POSTA — yazdıkça güncellenir ───────────────────────────────── */}
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
    </div>
  );
}

function Section({ n, title, children }: { n?: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-4 sm:p-5">
      <h3 className="mb-3.5 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-muted">
        {n != null && (
          <span className="inline-flex size-5 items-center justify-center rounded-full bg-ink text-[11px] tabular-nums text-white">{n}</span>
        )}
        {title}
      </h3>
      {children}
    </section>
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
