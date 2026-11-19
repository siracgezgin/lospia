"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, ArrowDown, ArrowUp, Check, CloudOff, Download, ExternalLink, ImagePlus, Loader2, Plus, RotateCw,
  Search, Trash2, X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Field, SelectInput, TextArea, TextInput } from "@/components/ui/Field";
import { useConfirm } from "@/components/ui/useConfirm";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import { prepareImageUpload, SHEET_IMAGE_ACCEPT, SHEET_IMAGE_TYPES } from "@/lib/utils/compress-image";
import {
  fetchNewsletterWeek, saveNewsletterWeek,
  type searchStoreProducts, type NewsletterPatch, type SaveNewsletterResult, type SiteCategory, type SiteStory,
} from "@/lib/actions/newsletter";
import { MailPreview } from "@/components/newsletter/MailPreview";
import {
  BLOCK_TYPES, blockButton, blockNeedsLink, blocksFingerprint, exportWeek, MAX_BLOCKS, mergeBlocks,
  NEWSLETTER_STATUSES, newBlock,
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
 * KAYIT KENDİLİĞİNDEN ve GÖRÜNÜR (Aslı Hanım, 18.11.2026: "Bunu
 * kaydedebiliyor musun?"). Yazarken yazma durduktan bir saniye sonra,
 * yapısal değişiklikte (ekle, taşı, sil, seç, yükle) hemen kaydeder; üst
 * satırda "Kaydediliyor / Kaydedildi 14:32" yazar. Kayıtlar SIRAYLA gider
 * (eski bir kayıt yenisinin üstüne düşmez); kaydedilmemiş yazı varken sekme
 * kapanmak isterse tarayıcı sorar. İki kişi aynı haftayı açarsa biri
 * ötekinin yazdığını SİLEMEZ: sunucudaki bloklar değişmişse kayıt durur,
 * "Yenile / Benimkini kaydet" sorulur; boşta duran ekran başkasının
 * değişikliğini kendiliğinden alır.
 */

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";
const TYPING_MS = 1000;
const RETRY_MS = 8000;
const SYNC_MS = 30_000;
const fmtTime = (d: Date) => d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

const BUCKET = "production-sheets";
const LINK_STATUSES: NewsletterStatus[] = ["onayda", "onaylandi"];
/** Sosyal medya bloğu boş bağlantıda platformun hesabına gider — eksik sayılmaz. */
const linkMissing = (b: NewsletterBlock) => blockNeedsLink(b.type) && b.type !== "sosyal" && !b.link.trim();

export function NewsletterWeekEditor({
  initial, label, canEdit, workspaceId, usedProducts, usedStories, productStock,
}: {
  initial: NewsletterWeek;
  label: string;
  canEdit: boolean;
  workspaceId: string;
  /** Ürün kimliği → daha önce kullanıldığı bülten tarihi. */
  usedProducts: Record<string, string>;
  /** Site ürün kimliği → panelde eldeki toplam adet (stok kaydı olanlar). */
  productStock: Record<string, number>;
  /** Story adresi → son 4 haftada kullanıldığı bülten tarihi. */
  usedStories: Record<string, string>;
}) {
  const [week, setWeek] = useState<NewsletterWeek>(initial);
  /* Kayıtlı bir hafta açıldığında da "Kaydedildi" yazar — soru sorulmasın. */
  const [state, setState] = useState<SaveState>(initial.id ? "saved" : "idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const { ask, dialog } = useConfirm();
  /* Açılışta sayfanın okuduğu adetler; aramada görülen ürünlerinki eklenir. */
  const [stock, setStock] = useState(productStock);
  const addStock = useCallback((more: Record<string, number>) => setStock((s) => ({ ...s, ...more })), []);

  /* Siteden seçim listeleri — hafta açılınca bir kez. */
  const [stories, setStories] = useState<SiteStory[] | null>(null);
  const [categories, setCategories] = useState<SiteCategory[] | null>(null);
  useEffect(() => {
    let alive = true;
    /* `fetch`, Server Action değil: kayıt kuyruğunu tıkamasın
       (bkz. app/api/newsletter/site/route.ts). */
    (async () => {
      const res = await fetch("/api/newsletter/site", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<{ stories: SiteStory[]; categories: SiteCategory[] }>) : null))
        .catch(() => null);
      if (!alive) return;
      setStories(res?.stories ?? []);
      setCategories(res?.categories ?? []);
    })();
    return () => { alive = false; };
  }, []);

  /* ── Kayıt kuyruğu ───────────────────────────────────────────────────── */
  const sendDate = initial.send_date;
  /** Henüz gönderilmemiş değişiklikler (alan alan; aynı alanın yenisi eskisini ezer). */
  const queue = useRef<NewsletterPatch>({});
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Satır veritabanında var mı? Yoksa ilk kayıt blokları da taşır. */
  const rowExists = useRef(initial.id !== null);
  /** Ekranın bildiği son SUNUCU blokları (birleştirme ve çakışma kontrolü için). */
  const base = useRef(initial.blocks);
  const force = useRef(false);
  const blocked = useRef(false); // çakışma çözülene kadar kayıt durur
  const alive = useRef(true);
  const weekRef = useRef(week);
  useEffect(() => { weekRef.current = week; }, [week]);

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (retry.current) { clearTimeout(retry.current); retry.current = null; }
    if (inFlight.current || blocked.current || !Object.keys(queue.current).length) return;
    let merges = 0;
    while (Object.keys(queue.current).length) {
      const patch: NewsletterPatch = rowExists.current
        ? queue.current
        : { blocks: weekRef.current.blocks, ...queue.current };
      queue.current = {};
      inFlight.current = true;
      if (alive.current) setState("saving");
      let res: SaveNewsletterResult;
      try {
        res = await saveNewsletterWeek(sendDate, patch, patch.blocks && !force.current ? blocksFingerprint(base.current) : undefined);
      } catch (e) {
        res = { error: e instanceof Error && e.message ? e.message : "bağlantı kurulamadı" };
      }
      if ("error" in res && res.conflict && merges++ < 3) {
        /* BAŞKASI ARAYA GİRMİŞ. Farklı bloklara / alanlara yazıldıysa iki
           taraf kendiliğinden birleşir ve kayıt yeniden gider; kullanıcıya
           yalnız AYNI alan iki tarafta farklı değiştiyse sorulur. */
        const fresh = await fetchNewsletterWeek(sendDate).catch(() => null);
        const theirs = fresh && "ok" in fresh ? fresh.week : null;
        const merged = theirs ? mergeBlocks(base.current, weekRef.current.blocks, theirs.blocks) : null;
        if (theirs && merged) {
          const queued = { ...patch, ...queue.current };
          base.current = theirs.blocks;
          rowExists.current = true;
          queue.current = { ...queued, blocks: merged };
          if (alive.current) {
            setWeek((w) => ({
              ...w, id: theirs.id, blocks: merged,
              status: "status" in queued ? w.status : theirs.status,
              subject: "subject" in queued ? w.subject : theirs.subject,
              theme: "theme" in queued ? w.theme : theirs.theme,
              notes: "notes" in queued ? w.notes : theirs.notes,
            }));
          }
          weekRef.current = { ...weekRef.current, blocks: merged };
          inFlight.current = false;
          continue;
        }
      }
      inFlight.current = false;
      if ("error" in res) {
        queue.current = { ...patch, ...queue.current }; // sonradan yazılan kazanır
        if (res.conflict) {
          blocked.current = true;
          if (alive.current) { setError(null); setState("conflict"); }
        } else if (alive.current) {
          setError(res.error);
          setState("error"); // yeniden deneme aşağıdaki etkide
        }
        return;
      }
      force.current = false;
      rowExists.current = true;
      if (patch.blocks) base.current = patch.blocks;
      const id = res.id;
      if (alive.current) setWeek((w) => (w.id === id ? w : { ...w, id }));
    }
    if (alive.current) { setError(null); setState("saved"); setSavedAt(new Date()); }
  }, [sendDate]);

  /* Bağlantı koptuysa kendiliğinden yeniden dener. */
  useEffect(() => {
    if (state !== "error") return;
    retry.current = setTimeout(() => void flush(), RETRY_MS);
    return () => { if (retry.current) clearTimeout(retry.current); };
  }, [state, flush]);

  /** Değişikliği kuyruğa koyar. `now` = hemen; değilse yazma durunca. */
  const push = useCallback((patch: NewsletterPatch, now = false) => {
    queue.current = { ...queue.current, ...patch };
    if (!blocked.current) setState((s) => (s === "saving" ? s : "dirty"));
    if (timer.current) clearTimeout(timer.current);
    if (now) void flush();
    else timer.current = setTimeout(() => void flush(), TYPING_MS);
  }, [flush]);

  const save = (patch: NewsletterPatch) => {
    setWeek((w) => ({ ...w, ...patch }));
    push(patch, true);
  };

  /** Sunucudaki hâli al. `discard` = kendi bekleyen değişikliğimi bırak ("Yenile"). */
  const sync = useCallback(async (discard = false) => {
    const busy = () => inFlight.current || Object.keys(queue.current).length > 0;
    if (!discard && (busy() || blocked.current)) return;
    const res = await fetchNewsletterWeek(sendDate).catch(() => null);
    if (!alive.current || !res || "error" in res) return;
    if (!discard && (busy() || blocked.current)) return; // beklerken yazmaya başladı
    if (discard) {
      queue.current = {};
      blocked.current = false;
      force.current = false;
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    }
    if (res.week) {
      const next = res.week;
      rowExists.current = true;
      base.current = next.blocks;
      setWeek((w) => (JSON.stringify(w) === JSON.stringify(next) ? w : next));
    }
    if (discard) { setError(null); setState(res.week ? "saved" : "idle"); setSavedAt(null); }
  }, [sendDate]);

  useEffect(() => {
    alive.current = true;
    const onHide = () => { if (document.visibilityState === "hidden") void flush(); else void sync(); };
    const onFocus = () => void sync();
    /* Kaydedilmemiş yazı varken sekme kapanmasın — tarayıcı sorar. */
    const onLeave = (e: BeforeUnloadEvent) => {
      if (!inFlight.current && !Object.keys(queue.current).length) return;
      void flush();
      e.preventDefault();
    };
    const every = window.setInterval(() => { if (document.visibilityState === "visible") void sync(); }, SYNC_MS);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("focus", onFocus);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      /* Sayfadan (panel içinde) çıkılırken bekleyen yazı gönderilir. */
      void flush();
      alive.current = false;
      window.clearInterval(every);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [sync, flush]);

  const overwrite = () => { blocked.current = false; force.current = true; void flush(); };

  /* ── Bloklar ─────────────────────────────────────────────────────────── */
  const blocks = week.blocks;
  const saveBlocks = (next: NewsletterBlock[]) => save({ blocks: next });
  /** Yazarken yazma durunca, `commit` ile hemen kaydolur. */
  const editBlock = (id: string, patch: Partial<NewsletterBlock>, commit = false) => {
    const next = blocks.map((b) => (b.id === id ? { ...b, ...patch } : b));
    setWeek((w) => ({ ...w, blocks: next }));
    push({ blocks: next }, commit);
  };
  /** Alandan çıkınca bekleyen yazı hemen gider. */
  const commitBlocks = () => void flush();
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    saveBlocks(next);
  };
  const remove = async (b: NewsletterBlock, i: number) => {
    const type = BLOCK_TYPES.find((t) => t.key === b.type)?.label ?? "";
    if (!(await ask({ title: `${i + 1}. blok silinsin mi?`, message: type, confirmLabel: "Sil", tone: "danger" }))) return;
    saveBlocks(weekRef.current.blocks.filter((x) => x.id !== b.id));
    if (b.image_path) void removeUpload(b.image_path);
  };
  const add = (type: BlockType) => {
    setAdding(false);
    saveBlocks([...blocks, newBlock(type, crypto.randomUUID())]);
  };
  const changeType = (b: NewsletterBlock, type: BlockType) =>
    editBlock(b.id, { type, platform: type === "sosyal" ? (b.platform || "instagram") : b.platform }, true);

  /* ── Metin alanları ──────────────────────────────────────────────────── */
  const onText = (field: NewsletterTextField, value: string) => {
    setWeek((w) => ({ ...w, [field]: value }));
    push({ [field]: value });
  };

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
        if (openingLinks.has(p.url.replace(/\/+$/, ""))) out.push(`${p.name} açılış resminde de var`);
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
        <SaveBadge state={state} savedAt={savedAt} error={error} onRetry={() => void flush()} onReload={() => void sync(true)} onOverwrite={overwrite} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* TASLAK BİTTİ — tek adım (18.11.2026: ekip tamamlayınca haber
              verecek). Durumu "Onayda" yapar; ay görünümünde hafta öyle görünür. */}
          {canEdit && (week.status === "taslak" || week.status === "duzeltme") && (
            <button
              type="button"
              onClick={() => save({ status: "onayda" })}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[13px] font-semibold text-white transition-all hover:opacity-90 pointer-coarse:h-11"
            >
              <Check size={14} aria-hidden /> Bitti
            </button>
          )}
          <button
            type="button"
            onClick={downloadPlan}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-4 text-[13px] font-medium text-ink transition-all hover:bg-surface-hover pointer-coarse:h-11"
          >
            <Download size={14} aria-hidden /> Planı indir
          </button>
        </div>
      </div>

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
            <Field label="E-posta konusu">
              <TextInput
                value={week.subject}
                disabled={!canEdit}
                onChange={(e) => onText("subject", e.target.value)}
                onBlur={commitBlocks}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              />
            </Field>
            {/* "Tema ve notlar" postada karşılığı olmayan bir ekti (Sıraç,
                18.11.2026: "araya ek bir şey koyunca kafa karışıyor"). Yeni
                haftada çizilmez; eskiden yazılmış olan kaybolmasın diye
                yalnız DOLU ise düz alan olarak durur. */}
            {(initial.theme || initial.notes) && (
              <div className="mt-3.5 space-y-3.5">
                {initial.theme && (
                  <Field label="Tema">
                    <TextInput value={week.theme} disabled={!canEdit} onChange={(e) => onText("theme", e.target.value)} onBlur={commitBlocks} />
                  </Field>
                )}
                {initial.notes && (
                  <Field label="Not">
                    <TextArea value={week.notes} disabled={!canEdit} onChange={(e) => onText("notes", e.target.value)} onBlur={commitBlocks} rows={3} />
                  </Field>
                )}
              </div>
            )}
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
              stock={stock}
              onStock={addStock}
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

/** Kayıt durumu — üst satırda, her an görünür. */
function SaveBadge({
  state, savedAt, error, onRetry, onReload, onOverwrite,
}: {
  state: SaveState;
  savedAt: Date | null;
  error: string | null;
  onRetry: () => void;
  onReload: () => void;
  onOverwrite: () => void;
}) {
  const btn = "inline-flex h-8 items-center gap-1 rounded-control border px-2.5 text-[12.5px] font-medium transition-all pointer-coarse:h-10";
  if (state === "conflict") {
    return (
      <span className="flex flex-wrap items-center gap-1.5" role="alert">
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-warning">
          <AlertTriangle size={13} aria-hidden /> Başka bir yerde değişti
        </span>
        <button type="button" onClick={onReload} className={cn(btn, "border-line-strong text-ink hover:bg-surface-hover")}>Yenile</button>
        <button type="button" onClick={onOverwrite} className={cn(btn, "border-warning/40 text-warning hover:bg-warning/10")}>Benimkini kaydet</button>
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="flex flex-wrap items-center gap-1.5" role="alert" title={error ?? undefined}>
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-danger">
          <CloudOff size={13} aria-hidden /> Kaydedilemedi
        </span>
        <button type="button" onClick={onRetry} className={cn(btn, "border-danger/40 text-danger hover:bg-danger/10")}>
          <RotateCw size={12} aria-hidden /> Tekrar dene
        </button>
      </span>
    );
  }
  if (state === "idle") return <span role="status" className="min-h-5" />;
  const busy = state === "dirty" || state === "saving";
  return (
    <span
      role="status"
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium tabular-nums",
        busy ? "bg-surface-sunken text-muted" : "bg-success/12 text-success",
      )}
    >
      {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Check size={13} aria-hidden />}
      {busy ? "Kaydediliyor" : savedAt ? `Kaydedildi ${fmtTime(savedAt)}` : "Kaydedildi"}
    </span>
  );
}

const fmtDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long" });

/** Panele yüklenen görseli depodan siler — kayıt zaten kaldırıldı; başarısızsa sessiz. */
async function removeUpload(path: string) {
  try { await createBrowserSupabase().storage.from(BUCKET).remove([path]); } catch { /* yetim kalır, zararsız */ }
}

/* ── Blok kartı ──────────────────────────────────────────────────────────── */

function BlockCard({
  no, block: b, first, last, canEdit, warnings, workspaceId, stories, categories, stock, onStock,
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
  stock: Record<string, number>;
  onStock: (_stock: Record<string, number>) => void;
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
  /* BLOK ALANLARI POSTADAKİ SIRAYLA ve HER BLOKTA AYNI ADLA durur:
     Resim · Bağlantı · Başlık · Açıklama · Düğme yazısı (Sıraç, 18.11.2026:
     "ilk şey resim, hemen altında başlık, hemen altında açıklaması, hemen
     altında 2 ürün… o mantıkta kur ki Aslı Hanım da anlasın"). BAĞLANTI
     RESMİN HEMEN ALTINDADIR: "resme tıklayınca linke gidecek." Postada
     karşılığı olmayan alan çizilmez. */
  const title = <Field label="Başlık"><TextInput {...text("title")} {...enter} /></Field>;
  const body = (rows = 4) => <Field label="Açıklama"><TextArea {...text("text")} rows={rows} /></Field>;
  /** Bağlantı — elle yazılır ya da sitedeki kategorilerden seçilir (aynı alan). */
  const link = (pick?: (_c: SiteCategory) => void) => (
    <Field label="Bağlantı">
      <div className="flex flex-wrap gap-2">
        <TextInput type="url" {...text("link")} {...enter} className="min-w-0 flex-1 basis-56" />
        {pick && (
          <SelectInput
            aria-label="Bağlantıyı siteden seç"
            value={categories?.find((c) => c.id === b.ref && c.url === b.link)?.id ?? ""}
            disabled={!canEdit || !categories}
            onChange={(e) => { const c = categories?.find((x) => x.id === e.target.value); if (c) pick(c); }}
            className="w-auto max-w-full"
          >
            <option value="">{categories ? "Siteden seç" : "Yükleniyor…"}</option>
            {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SelectInput>
        )}
      </div>
    </Field>
  );
  const button = (
    <Field label="Düğme yazısı">
      <TextInput
        {...text("button")}
        {...enter}
        placeholder={blockButton({ ...b, button: "" })}
        list={b.type === "story" ? `story-titles-${b.id}` : undefined}
      />
      {b.type === "story" && (
        <datalist id={`story-titles-${b.id}`}>
          {STORY_TITLES.map((t) => <option key={t} value={t.toUpperCase()} />)}
        </datalist>
      )}
    </Field>
  );

  return (
    <section className="rounded-card border border-line bg-surface p-4 sm:p-5">
      {/* Telefonda tür seçimi ile taşı/sil düğmeleri TEK satırda kalır
          (alt satıra düşünce her kartta boş bir şerit açılıyordu). */}
      <header className="mb-4 flex items-center gap-2">
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-ink text-[13px] font-semibold tabular-nums text-white">{no}</span>
        <SelectInput
          aria-label={`${no}. bloğun türü`}
          value={b.type}
          disabled={!canEdit}
          onChange={(e) => onType(e.target.value as BlockType)}
          className="h-9 w-auto min-w-0 shrink font-semibold"
        >
          {BLOCK_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </SelectInput>
        {canEdit && (
          <div className="ml-auto flex shrink-0 items-center gap-1">
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
            {/* Görsel bloğunda başlık postada görünmez; yalnız eskiden
                yazılmışsa durur. */}
            {link((c) => onCommitEdit({ link: c.url, ref: c.id }))}
            {b.title && title}
          </>
        )}

        {b.type === "metin" && (
          <>
            {title}
            {body()}
          </>
        )}

        {b.type === "urun" && (
          <>
            {title}
            <Field label="Ürünler">
              <div className="space-y-2">
                <ChosenProducts
                  products={b.products}
                  stock={stock}
                  onRemove={canEdit ? (id) => onCommitEdit({ products: b.products.filter((p) => p.id !== id) }) : undefined}
                />
                {canEdit && <ProductSearch chosen={b.products} onStock={onStock} onPick={(p) => onCommitEdit({ products: [...b.products, p] })} />}
              </div>
            </Field>
            {link((c) => onCommitEdit({ link: c.url, ref: c.id }))}
            {button}
          </>
        )}

        {b.type === "kategori" && (
          <>
            {image}
            {link((c) => onCommitEdit({ link: c.url, ref: c.id, title: b.title || c.name }))}
            {title}
            {body(3)}
            {button}
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
            {link()}
            {body()}
            {button}
          </>
        )}

        {b.type === "sosyal" && (
          <>
            <Field label="Platform">
              <SelectInput
                value={b.platform || "instagram"}
                disabled={!canEdit}
                onChange={(e) => onCommitEdit({ platform: e.target.value as SocialPlatform })}
              >
                {SOCIAL_PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </SelectInput>
            </Field>
            {image}
            {link()}
            {button}
          </>
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
      if (error) { setErr(`Resim yüklenemedi: ${error.message}`); return; }
      /* Kova herkese açık: adres postada ve afcom-seo'da süresiz okunur. */
      onChange(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, path);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Resim yüklenemedi.");
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
      <span className="mb-1 block text-[12.5px] font-medium text-muted">Resim</span>
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
          {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <ImagePlus size={16} aria-hidden />} Resim yükle
        </button>
      )}
      <input ref={inputRef} type="file" accept={SHEET_IMAGE_ACCEPT} aria-label="Resim dosyası" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
      {err && <p role="alert" className="mt-1.5 text-[12.5px] text-danger">{err}</p>}
    </div>
  );
}

/* ── Ürünler ─────────────────────────────────────────────────────────────── */

/** Sitedeki "tükendi" ve panelin kendi adedi — ikisi tek satırda. */
function ProductStock({ p, stock }: { p: NewsletterProduct; stock: Record<string, number> }) {
  const n = stock[String(p.id)];
  if (p.in_stock && n == null) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-2 text-[12px]">
      {!p.in_stock && <span className="font-medium text-danger">Tükendi</span>}
      {n != null && <span className="tabular-nums text-muted">Stok {n}</span>}
    </span>
  );
}

function ChosenProducts({ products, stock, onRemove }: { products: NewsletterProduct[]; stock: Record<string, number>; onRemove?: (_id: number) => void }) {
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
            <ProductStock p={p} stock={stock} />
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

function ProductSearch({ chosen, onPick, onStock }: {
  chosen: NewsletterProduct[];
  onPick: (_p: NewsletterProduct) => void;
  onStock: (_stock: Record<string, number>) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<NewsletterProduct[] | null>(null);
  const [hitStock, setHitStock] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  /* Canlı satış sitesi — her tuşta istek gitmesin, yazma durunca gitsin. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function search(q: string) {
    const n = ++seq.current;
    if (q.trim().length < 2) { setHits(null); setError(null); setBusy(false); return; }
    setBusy(true);
    const res = await fetch(`/api/newsletter/site?q=${encodeURIComponent(q)}`, { cache: "no-store" })
      .then((r) => r.json() as ReturnType<typeof searchStoreProducts>)
      .catch(() => ({ error: "Siteye bağlanılamadı." }));
    if (n !== seq.current) return; // daha yeni bir arama başladı
    setBusy(false);
    if ("error" in res) { setError(res.error); setHits(null); }
    else { setError(null); setHits(res.products); setHitStock(res.stock); onStock(res.stock); }
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
                  <ProductStock p={p} stock={hitStock} />
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
