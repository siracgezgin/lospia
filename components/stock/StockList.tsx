"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Package, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useLiveRefresh } from "@/components/stock/useLiveRefresh";
import { Button } from "@/components/ui/Button";
import { Field, FieldGrid, SelectInput, TextInput } from "@/components/ui/Field";
import { Overlay } from "@/components/ui/Overlay";
import { EmptyState } from "@/components/ui/EmptyState";
import { useConfirm } from "@/components/ui/useConfirm";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import { prepareImageUpload, SHEET_IMAGE_ACCEPT, SHEET_IMAGE_TYPES } from "@/lib/utils/compress-image";
import {
  createStockProduct, recordStockMovement, searchSiteProductsForStock, updateStockProduct,
  type SiteProductHit,
} from "@/lib/actions/stock";
import {
  fmtPrice, levelsByProduct, MOVEMENT_KINDS, normalizeSize, sortSizes, STANDARD_SIZES,
  type MovementKind, type StockLevel, type StockLocation, type StockProduct,
} from "@/lib/stock/model";

/**
 * BİR YERİN STOĞU — ürün satırları; satış, giriş ve diğer hareketler buradan.
 *
 * Eski stok programının "Satış Girişi" ekranının sadeleşmişi: her ürün TEK
 * satır (orada beden başına ayrı satırdı), bedenler satırın içinde adetleriyle
 * durur. "Satış" ve "Giriş" en sık iki iş olduğu için satırda; iade, transfer,
 * sayım ve çıkış aynı pencerede tür seçilerek yapılır.
 */

const BUCKET = "production-sheets";
type Dialog =
  | { type: "move"; product: StockProduct; kind: MovementKind }
  | { type: "product"; product: StockProduct | null }
  | null;

export function StockTabs({ scope, active }: { scope: string; active: "stok" | "hareketler" }) {
  const tab = (key: "stok" | "hareketler", label: string, href: string) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      className={cn(
        "inline-flex h-9 items-center rounded-full px-4 text-[13px] font-medium transition-all",
        active === key ? "bg-ink text-white" : "text-muted hover:bg-surface-hover hover:text-ink",
      )}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex items-center gap-1">
      {tab("stok", "Stok", `/stock?l=${scope}`)}
      {tab("hareketler", "Hareketler", `/stock?l=${scope}&v=hareketler`)}
    </div>
  );
}

export function StockList({
  scope, scopeName, locationId, locations, products, levels, canEdit, workspaceId,
}: {
  scope: string;
  scopeName: string;
  /** null = bütün yerlerin toplamı. */
  locationId: string | null;
  locations: StockLocation[];
  products: StockProduct[];
  levels: StockLevel[];
  canEdit: boolean;
  workspaceId: string;
}) {
  useLiveRefresh();
  const [query, setQuery] = useState("");
  /* Bir yerde varsayılan: o yere girmiş ürünler. "Tüm ürünler" başka yerdeki
     ürüne buradan giriş yapabilmek için. */
  const [onlyHere, setOnlyHere] = useState(locationId !== null);
  const [dialog, setDialog] = useState<Dialog>(null);

  const bySize = useMemo(() => levelsByProduct(levels, locationId), [levels, locationId]);
  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    return products.filter((p) => {
      if (onlyHere && !bySize.has(p.id)) return false;
      if (!q) return true;
      return [p.name, p.code, p.barcode].some((v) => v.toLocaleLowerCase("tr").includes(q));
    });
  }, [products, query, onlyHere, bySize]);

  return (
    <div className="anim-fade">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-ink sm:text-xl">{scopeName}</h2>
        <StockTabs scope={scope} active="stok" />
        {canEdit && (
          <Button size="sm" onClick={() => setDialog({ type: "product", product: null })} className="ml-auto">
            <Plus size={14} aria-hidden /> Yeni ürün
          </Button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
          <TextInput
            type="search"
            aria-label="Ürün ara"
            placeholder="Ad, kod ya da barkod"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {locationId && (
          <SelectInput
            aria-label="Hangi ürünler"
            value={onlyHere ? "here" : "all"}
            onChange={(e) => setOnlyHere(e.target.value === "here")}
            className="w-auto"
          >
            <option value="here">Bu yerdekiler</option>
            <option value="all">Tüm ürünler</option>
          </SelectInput>
        )}
        <span className="text-[12.5px] tabular-nums text-muted">{shown.length} ürün</span>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={Package}
          title={products.length === 0 ? "Henüz ürün yok" : "Ürün bulunamadı"}
          action={
            onlyHere && products.length > 0 && !query ? (
              <Button variant="secondary" size="sm" onClick={() => setOnlyHere(false)}>Tüm ürünler</Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-2">
          {shown.map((p) => (
            <ProductRow
              key={p.id}
              product={p}
              sizes={bySize.get(p.id)}
              canEdit={canEdit}
              onOpen={() => setDialog({ type: "product", product: p })}
              onMove={(kind) => setDialog({ type: "move", product: p, kind })}
            />
          ))}
        </ul>
      )}

      {dialog?.type === "move" && (
        <MovementDialog
          key={dialog.product.id + dialog.kind}
          product={dialog.product}
          initialKind={dialog.kind}
          locations={locations}
          defaultLocationId={locationId ?? locations[0]?.id ?? ""}
          levels={levels}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "product" && (
        <ProductDialog
          key={dialog.product?.id ?? "new"}
          product={dialog.product}
          locations={locations}
          levels={levels}
          canEdit={canEdit}
          workspaceId={workspaceId}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

/* ── Ürün satırı ─────────────────────────────────────────────────────────── */

function Thumb({ src, className }: { src: string; className: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className={cn("shrink-0 rounded-control bg-[#f1f1f1] object-cover", className)} />
  ) : (
    <span className={cn("flex shrink-0 items-center justify-center rounded-control bg-surface-sunken text-subtle", className)} aria-hidden>
      <Package size={18} />
    </span>
  );
}

function ProductRow({
  product: p, sizes, canEdit, onOpen, onMove,
}: {
  product: StockProduct;
  sizes: Map<string, number> | undefined;
  canEdit: boolean;
  onOpen: () => void;
  onMove: (_k: MovementKind) => void;
}) {
  const order = sortSizes([...(sizes?.keys() ?? [])]);
  const total = order.reduce((n, s) => n + (sizes?.get(s) ?? 0), 0);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card border border-line bg-surface p-3">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 basis-56 items-center gap-3 text-left">
        <Thumb src={p.image_url} className="size-14" />
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-semibold text-ink">{p.name}</span>
          <span className="block truncate text-[12.5px] text-muted">
            {[p.code, p.barcode, fmtPrice(p.price)].filter(Boolean).join(" · ")}
          </span>
        </span>
      </button>

      <div className="flex flex-wrap items-center gap-1.5">
        {order.length === 0 ? (
          <span className="text-[12.5px] text-subtle">Stok yok</span>
        ) : (
          order.map((s) => {
            const n = sizes!.get(s) ?? 0;
            return (
              <span
                key={s}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] tabular-nums",
                  n > 0 ? "border-line-strong text-ink" : "border-line text-subtle",
                )}
              >
                <span className="font-medium">{s}</span>
                <span className={cn("font-semibold", n < 0 && "text-danger")}>{n}</span>
              </span>
            );
          })
        )}
      </div>

      {canEdit && (
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" disabled={total <= 0} onClick={() => onMove("satis")}>Satış</Button>
          <Button size="sm" variant="secondary" onClick={() => onMove("giris")}>Giriş</Button>
          <Button size="sm" variant="ghost" onClick={() => onMove("transfer")}>Diğer</Button>
        </div>
      )}
    </li>
  );
}

/* ── Hareket penceresi ───────────────────────────────────────────────────── */

const toNumber = (s: string) => {
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

function MovementDialog({
  product, initialKind, locations, defaultLocationId, levels, onClose,
}: {
  product: StockProduct;
  initialKind: MovementKind;
  locations: StockLocation[];
  defaultLocationId: string;
  levels: StockLevel[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<MovementKind>(initialKind);
  const [locationId, setLocationId] = useState(defaultLocationId);
  const [toLocationId, setToLocationId] = useState(locations.find((l) => l.id !== defaultLocationId)?.id ?? "");
  const [size, setSize] = useState("");
  const [customSize, setCustomSize] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState(product.price != null ? String(product.price).replace(".", ",") : "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = levels.filter((l) => l.product_id === product.id);
  const here = new Map(mine.filter((l) => l.location_id === locationId).map((l) => [l.size, l.qty]));
  const adds = kind === "giris" || kind === "iade" || kind === "sayim";
  const options = sortSizes([...mine.map((l) => l.size), ...(adds ? STANDARD_SIZES : [])]);
  const chosen = customSize.trim() ? normalizeSize(customSize) : size;
  const onHand = here.get(chosen) ?? 0;
  const needsPrice = kind === "satis" || kind === "iade";

  async function submit() {
    setError(null);
    if (!chosen) { setError("Beden seçin."); return; }
    const n = Number.parseInt(qty, 10);
    if (!Number.isFinite(n) || n < 0) { setError("Adet yazın."); return; }
    const unit = needsPrice && price.trim() ? toNumber(price) : null;
    if (unit !== null && Number.isNaN(unit)) { setError("Fiyat geçersiz."); return; }
    setBusy(true);
    try {
      const res = await recordStockMovement({
        product_id: product.id, location_id: locationId, size: chosen, kind, qty: n,
        unit_price: unit, note, to_location_id: kind === "transfer" ? toLocationId : undefined,
      });
      if ("error" in res) { setError(res.error); return; }
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay
      open
      onClose={onClose}
      title={product.name}
      hint={[product.code, fmtPrice(product.price)].filter(Boolean).join(" · ") || undefined}
      dismissOnBackdrop={false}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
          <Button onClick={submit} loading={busy}>Kaydet</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Hareket türü">
          {MOVEMENT_KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              role="radio"
              aria-checked={kind === k.key}
              onClick={() => { setKind(k.key); setError(null); if (k.key === "sayim") setQty(String(onHand)); }}
              className={cn(
                "h-9 rounded-full border px-3.5 text-[13px] font-medium transition-all",
                kind === k.key ? "border-ink bg-ink text-white" : "border-line-strong text-ink hover:bg-surface-hover",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>

        {/* Tek alan tam genişlikte durur; yarım alanın yanı boş kalmasın. */}
        <div className={cn("grid gap-x-3 gap-y-3.5", kind === "transfer" && "sm:grid-cols-2")}>
          <Field label={kind === "transfer" ? "Nereden" : "Yer"}>
            <SelectInput
              value={locationId}
              onChange={(e) => {
                setLocationId(e.target.value);
                if (e.target.value === toLocationId) setToLocationId(locations.find((l) => l.id !== e.target.value)?.id ?? "");
              }}
            >
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </SelectInput>
          </Field>
          {kind === "transfer" && (
            <Field label="Nereye">
              <SelectInput value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
                {locations.filter((l) => l.id !== locationId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </SelectInput>
            </Field>
          )}
        </div>

        <div>
          <span className="mb-1 block text-[12.5px] font-medium text-muted">Beden</span>
          <div className="flex flex-wrap gap-1.5">
            {options.map((s) => {
              const n = here.get(s) ?? 0;
              const off = !adds && n <= 0;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={off}
                  aria-pressed={chosen === s}
                  onClick={() => { setSize(s); setCustomSize(""); if (kind === "sayim") setQty(String(n)); }}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] tabular-nums transition-all disabled:opacity-40",
                    chosen === s ? "border-ink bg-ink text-white" : "border-line-strong text-ink hover:bg-surface-hover",
                  )}
                >
                  <span className="font-medium">{s}</span>
                  <span className="opacity-70">{n}</span>
                </button>
              );
            })}
            {adds && (
              <TextInput
                aria-label="Başka beden"
                placeholder="Başka beden"
                value={customSize}
                onChange={(e) => { setCustomSize(e.target.value); setSize(""); }}
                className="h-9 w-32"
              />
            )}
          </div>
          {options.length === 0 && !adds && <p className="mt-1.5 text-[12.5px] text-muted">Bu yerde stok yok.</p>}
        </div>

        <div className={cn("grid gap-x-3 gap-y-3.5", needsPrice && "sm:grid-cols-2")}>
          <Field label={kind === "sayim" ? "Sayılan adet" : "Adet"}>
            <TextInput inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))} />
          </Field>
          {needsPrice && (
            <Field label="Birim fiyat (₺)">
              <TextInput inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" />
            </Field>
          )}
        </div>

        <Field label="Not">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        {error && (
          <p role="alert" className="rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[13.5px] font-medium text-danger">{error}</p>
        )}
      </div>
    </Overlay>
  );
}

/* ── Ürün penceresi: yeni ürün · düzenle · yerlere göre dağılım ───────────── */

function ProductDialog({
  product, locations, levels, canEdit, workspaceId, onClose,
}: {
  product: StockProduct | null;
  locations: StockLocation[];
  levels: StockLevel[];
  canEdit: boolean;
  workspaceId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [name, setName] = useState(product?.name ?? "");
  const [code, setCode] = useState(product?.code ?? "");
  const [barcode, setBarcode] = useState(product?.barcode ?? "");
  const [price, setPrice] = useState(product?.price != null ? String(product.price).replace(".", ",") : "");
  const [imageUrl, setImageUrl] = useState(product?.image_url ?? "");
  const [web, setWeb] = useState<{ url: string; id: number | null }>({ url: product?.web_url ?? "", id: product?.web_product_id ?? null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = product ? levels.filter((l) => l.product_id === product.id) : [];
  const sizes = sortSizes(mine.map((l) => l.size));
  const cell = (loc: string, s: string) => mine.find((l) => l.location_id === loc && l.size === s)?.qty ?? 0;

  async function submit() {
    setError(null);
    const p = price.trim() ? toNumber(price) : null;
    if (p !== null && Number.isNaN(p)) { setError("Fiyat geçersiz."); return; }
    const payload = { name, code, barcode, price: p, image_url: imageUrl, web_url: web.url, web_product_id: web.id };
    setBusy(true);
    try {
      const res = product ? await updateStockProduct(product.id, payload) : await createStockProduct(payload);
      if ("error" in res) { setError(res.error); return; }
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!product) return;
    if (!(await ask({ title: "Ürün listeden kaldırılsın mı?", message: product.name, confirmLabel: "Kaldır", tone: "danger" }))) return;
    setBusy(true);
    const res = await updateStockProduct(product.id, { active: false });
    setBusy(false);
    if ("error" in res) { setError(res.error); return; }
    router.refresh();
    onClose();
  }

  return (
    <Overlay
      open
      onClose={onClose}
      title={product ? product.name : "Yeni ürün"}
      size="lg"
      dismissOnBackdrop={false}
      footer={
        canEdit ? (
          <div className="flex w-full items-center gap-2">
            {product && <Button variant="ghost" onClick={archive} disabled={busy} className="text-danger">Listeden kaldır</Button>}
            <span className="ml-auto" />
            <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
            <Button onClick={submit} loading={busy}>Kaydet</Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {!product && canEdit && (
          <SiteSearch
            onPick={(h) => {
              setName(h.name);
              if (h.sku) setCode(h.sku);
              if (h.image_url) setImageUrl(h.image_url);
              setWeb({ url: h.url, id: h.id });
            }}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-[112px_minmax(0,1fr)]">
          <ImageField value={imageUrl} disabled={!canEdit} prefix={`${workspaceId}/stok/`} onChange={setImageUrl} />
          <div className="min-w-0 space-y-3.5">
            <Field label="Ürün adı"><TextInput value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} /></Field>
            <FieldGrid>
              <Field label="Kod"><TextInput value={code} disabled={!canEdit} onChange={(e) => setCode(e.target.value)} /></Field>
              <Field label="Barkod"><TextInput value={barcode} disabled={!canEdit} onChange={(e) => setBarcode(e.target.value)} /></Field>
              <Field label="Fiyat (₺)"><TextInput inputMode="decimal" value={price} disabled={!canEdit} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" /></Field>
            </FieldGrid>
            {web.url && (
              <a href={web.url} target="_blank" rel="noreferrer" className="block truncate text-[12.5px] text-muted hover:text-ink hover:underline">
                {web.url.replace(/^https?:\/\/(www\.)?/, "")}
              </a>
            )}
          </div>
        </div>

        {product && sizes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="text-[13px] tabular-nums">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1.5 pr-6 font-medium">Yer</th>
                  {sizes.map((s) => <th key={s} className="px-3 py-1.5 text-right font-medium">{s}</th>)}
                  <th className="py-1.5 pl-4 text-right font-medium">Toplam</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((l) => (
                  <tr key={l.id} className="border-t border-line">
                    <td className="py-1.5 pr-6 text-ink">{l.name}</td>
                    {sizes.map((s) => <td key={s} className="px-3 py-1.5 text-right">{cell(l.id, s)}</td>)}
                    <td className="py-1.5 pl-4 text-right font-semibold">{sizes.reduce((n, s) => n + cell(l.id, s), 0)}</td>
                  </tr>
                ))}
                <tr className="border-t border-line-strong font-semibold">
                  <td className="py-1.5 pr-6">Toplam</td>
                  {sizes.map((s) => <td key={s} className="px-3 py-1.5 text-right">{locations.reduce((n, l) => n + cell(l.id, s), 0)}</td>)}
                  <td className="py-1.5 pl-4 text-right">{mine.reduce((n, l) => n + l.qty, 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[13.5px] font-medium text-danger">{error}</p>
        )}
      </div>
      {dialog}
    </Overlay>
  );
}

function SiteSearch({ onPick }: { onPick: (_h: SiteProductHit) => void }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SiteProductHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  /* Canlı satış sitesi — her tuşta istek gitmesin. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function search(q: string) {
    const n = ++seq.current;
    if (q.trim().length < 2) { setHits(null); setError(null); setBusy(false); return; }
    setBusy(true);
    const res = await searchSiteProductsForStock(q);
    if (n !== seq.current) return;
    setBusy(false);
    if ("error" in res) { setError(res.error); setHits(null); } else { setError(null); setHits(res.products); }
  }

  return (
    <div>
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
        <TextInput
          type="search"
          aria-label="Sitede ürün ara"
          placeholder="Siteden getir (İngilizce ad)"
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
        <ul className="mt-2 max-h-64 divide-y divide-line overflow-y-auto rounded-control border border-line">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => { onPick(h); setQuery(""); setHits(null); }}
                className="flex w-full items-center gap-3 px-2 py-1.5 text-left transition-all hover:bg-surface-hover"
              >
                <Thumb src={h.image_url} className="size-11" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] text-ink">{h.name}</span>
                  {h.sku && <span className="text-[12px] text-muted">{h.sku}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ImageField({ value, disabled, prefix, onChange }: { value: string; disabled: boolean; prefix: string; onChange: (_url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setErr(null);
    setBusy(true);
    try {
      /* Liste görseli — uzun kenar 1000 yeter (depo 1 GB). */
      const prep = await prepareImageUpload(file, { accept: SHEET_IMAGE_TYPES, maxDim: 1000, quality: 0.78 });
      if ("error" in prep) { setErr(prep.error); return; }
      const ext = prep.file.type === "image/png" ? "png" : prep.file.type === "image/webp" ? "webp" : prep.file.type === "image/gif" ? "gif" : "jpeg";
      const path = `${prefix}${crypto.randomUUID()}.${ext}`;
      const supabase = createBrowserSupabase();
      const { error } = await supabase.storage.from(BUCKET).upload(path, prep.file, { contentType: prep.file.type, upsert: false });
      if (error) { setErr(`Görsel yüklenemedi: ${error.message}`); return; }
      onChange(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Görsel yüklenemedi.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="relative w-28">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="aspect-[3/4] w-28 rounded-control bg-[#f1f1f1] object-cover" />
        ) : (
          <div className="flex aspect-[3/4] w-28 items-center justify-center rounded-control bg-surface-sunken text-subtle"><Package size={22} aria-hidden /></div>
        )}
        {value && !disabled && (
          <button type="button" onClick={() => onChange("")} aria-label="Görseli kaldır" title="Kaldır"
            className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-full bg-surface/95 text-muted shadow transition-all hover:text-danger">
            <X size={12} aria-hidden />
          </button>
        )}
      </div>
      {!disabled && (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
          className="mt-2 inline-flex h-8 w-28 items-center justify-center gap-1.5 rounded-control border border-line-strong text-[12.5px] font-medium text-ink transition-all hover:bg-surface-hover">
          {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <ImagePlus size={13} aria-hidden />} Görsel
        </button>
      )}
      <input ref={inputRef} type="file" accept={SHEET_IMAGE_ACCEPT} aria-label="Ürün görseli" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
      {err && <p role="alert" className="mt-1.5 text-[12px] text-danger">{err}</p>}
    </div>
  );
}
