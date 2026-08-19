"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList, Plus, Trash2, Loader2, Send, CheckCircle2, Check, Undo2, X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { initialsOf } from "@/lib/planning/initials";
import { categoryMeta } from "@/lib/planning/categories";
import {
  createOpenItem, updateOpenItem, setOpenItemDone, deleteOpenItem, assignOpenItemAsTask,
} from "@/lib/actions/planning-open-items";
import type { Member } from "./MemberMultiSelect";
import { PlanningSection } from "./PlanningSection";
import type { PlanningOpenItem } from "@/types";

interface Props {
  items: PlanningOpenItem[];
  members: Member[];
  currentUserId: string;
  isAdmin: boolean;
  /** Tablo henüz migrate edilmediyse bölüm bilgi notuyla kapanır. */
  available: boolean;
}

/** Sahipsiz satırların toplandığı sütun. */
const GENERAL = "Genel";

/** Excel'de bir kişinin altında birden çok liste olabiliyor
 *  ("Sales / Satın Alma" + "Sales / AFCOM") — her biri bir RoleGroup. */
type RoleGroup = {
  key: string;
  role: string | null;   // alt sütun başlığı (yoksa tek liste)
  order: number;         // Excel'deki soldan sağa sıra (en küçük position)
  open: PlanningOpenItem[];
  done: PlanningOpenItem[];
};

type Column = {
  key: string;
  userId: string | null;
  label: string;
  roles: RoleGroup[];
  openCount: number;
  doneCount: number;
};

/**
 * "Tamamlanmamış Eksik Konular" — Aslı Hanım'ın takviminin altındaki kişi
 * sütunları. Not defteri gibi çalışır: haftaya bağlı değildir, konu
 * tamamlanana kadar durur. Herkes görür; kendi sütununa yazar, yönetici
 * hepsine müdahale eder ve tek tıkla göreve dönüştürür.
 */
export function OpenItemsBoard({ items, members, currentUserId, isAdmin, available }: Props) {
  const router = useRouter();
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startWork] = useTransition();

  const memberName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of members) m[p.id] = p.name;
    return m;
  }, [members]);

  const columns = useMemo<Column[]>(() => {
    const map = new Map<string, Column>();
    const ensure = (key: string, userId: string | null, label: string) => {
      if (!map.has(key)) map.set(key, { key, userId, label, roles: [], openCount: 0, doneCount: 0 });
      return map.get(key)!;
    };
    const ensureRole = (col: Column, role: string | null, position: number) => {
      const rk = role ?? "";
      let g = col.roles.find((r) => (r.role ?? "") === rk);
      if (!g) { g = { key: `${col.key}|${rk}`, role, order: position, open: [], done: [] }; col.roles.push(g); }
      g.order = Math.min(g.order, position);
      return g;
    };

    // Önce sistemdeki her üye için bir sütun — herkesin kendi defteri hazır olsun.
    for (const p of members) ensure(p.id, p.id, p.name);
    for (const it of items) {
      const userId = it.owner_user_id;
      const label = userId ? (memberName[userId] ?? it.owner_label ?? "—") : (it.owner_label?.trim() || GENERAL);
      const col = ensure(userId ?? label, userId, label);
      const g = ensureRole(col, it.owner_role?.trim() || null, it.position);
      (it.done ? g.done : g.open).push(it);
      if (it.done) col.doneCount++; else col.openCount++;
    }

    const list = [...map.values()];
    for (const c of list) {
      // Rol sırası Excel'deki soldan sağa (aktarımda ikinci liste 100'den başlar).
      c.roles.sort((a, b) => a.order - b.order);
      for (const g of c.roles) {
        g.open.sort((a, b) => a.position - b.position);
        g.done.sort((a, b) => a.position - b.position);
      }
      // Hiç satırı olmayan üyede yine de tek bir boş liste dursun (ekleme için).
      if (c.roles.length === 0) c.roles.push({ key: `${c.key}|`, role: null, order: 0, open: [], done: [] });
    }
    // Sıralama: önce ben, sonra dolu sütunlar, sonra boşlar; "Genel" en sonda.
    return list.sort((a, b) => {
      if (a.userId === currentUserId) return -1;
      if (b.userId === currentUserId) return 1;
      const aGen = a.label === GENERAL, bGen = b.label === GENERAL;
      if (aGen !== bGen) return aGen ? 1 : -1;
      const aHas = a.openCount > 0, bHas = b.openCount > 0;
      if (aHas !== bHas) return aHas ? -1 : 1;
      return a.label.localeCompare(b.label, "tr");
    });
  }, [items, members, memberName, currentUserId]);

  const totalOpen = items.filter((i) => !i.done).length;
  const totalDone = items.length - totalOpen;

  // Bir sütuna yazma yetkisi: yönetici hepsine, üye kendi sütununa.
  const canWrite = (col: Column) => isAdmin || col.userId === currentUserId;

  function run(id: string, fn: () => Promise<{ error?: string } | unknown>) {
    setError(null);
    setBusyId(id);
    startWork(async () => {
      const res = (await fn()) as { error?: string };
      setBusyId(null);
      if (res && "error" in res && res.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  if (!available) {
    return (
      <Wrap open={0}>
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] font-medium text-amber-900">
          Bu bölüm için veritabanı güncellemesi bekleniyor (planning_open_items).
        </p>
      </Wrap>
    );
  }

  return (
    <Wrap
      open={totalOpen}
      doneToggle={<DoneToggle done={totalDone} showDone={showDone} onToggle={() => setShowDone((s) => !s)} />}
    >
      {error && (
        <div className="anim-fade-down mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] font-medium text-red-700">
          {error}
        </div>
      )}

      {/* Excel'deki kişi blokları: başlık = kişi, altında rol alt sütunları. */}
      <div className="grid items-start gap-3 xl:grid-cols-2">
        {columns.map((col) => (
          <div key={col.key} className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            {/* Blok başlığı — kişi */}
            <div className="flex items-center gap-2 border-b border-hairline bg-surface-muted px-3 py-2">
              <span className="inline-flex h-6 w-7 shrink-0 items-center justify-center rounded bg-surface text-[11px] font-semibold text-muted">
                {col.label === GENERAL ? "∷" : initialsOf(col.label)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight text-ink" title={col.label}>
                {col.label}
              </span>
              <span
                className={cn(
                  "rounded-md px-1.5 py-px text-[11px] font-semibold tabular-nums",
                  col.openCount ? "bg-brand-soft text-brand-strong" : "bg-surface text-subtle",
                )}
                title="Açık konu"
              >
                {col.openCount}
              </span>
            </div>

            {/* Rol alt sütunları — yan yana (Excel'deki iki liste) */}
            <div className={cn("grid flex-1", col.roles.length > 1 && "sm:grid-cols-2")}>
              {col.roles.map((g, gi) => (
                <div
                  key={g.key}
                  className={cn(
                    "flex min-w-0 flex-col border-hairline",
                    gi > 0 && "border-t sm:border-l sm:border-t-0",
                  )}
                >
                  {g.role && (
                    <div className="border-b border-hairline px-3 py-1.5 text-[11.5px] font-semibold leading-snug text-muted" title={g.role}>
                      {g.role}
                    </div>
                  )}
                  <ul className="max-h-[36rem] flex-1 divide-y divide-hairline overflow-y-auto">
                    {g.open.length === 0 && (!showDone || g.done.length === 0) && (
                      <li className="px-3 py-3 text-[12.5px] text-subtle">Açık konu yok.</li>
                    )}
                    {g.open.map((it) => (
                      <ItemRow
                        key={it.id}
                        item={it}
                        busy={busyId === it.id}
                        canWrite={canWrite(col)}
                        canAssign={isAdmin && !!col.userId}
                        onToggle={() => run(it.id, () => setOpenItemDone(it.id, true))}
                        onSave={(text) => run(it.id, () => updateOpenItem(it.id, { text }))}
                        onDelete={() => run(it.id, () => deleteOpenItem(it.id))}
                        onAssign={() => run(it.id, () => assignOpenItemAsTask(it.id, { dueDate: null }))}
                      />
                    ))}
                    {showDone && g.done.map((it) => (
                      <li key={it.id} className="flex items-start gap-2 px-3 py-1.5">
                        <button
                          onClick={() => run(it.id, () => setOpenItemDone(it.id, false))}
                          disabled={!canWrite(col) || busyId === it.id}
                          className="mt-px shrink-0 rounded p-0.5 text-emerald-600 transition-colors hover:bg-emerald-50 disabled:opacity-50"
                          title="Geri al"
                        >
                          {busyId === it.id ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />}
                        </button>
                        <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-subtle line-through">{it.text}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Ekleme satırı — satır aynı alt sütuna (role) düşer */}
                  {canWrite(col) && (
                    <AddRow
                      onAdd={(text) =>
                        run(`add-${g.key}`, () =>
                          createOpenItem({
                            owner_user_id: col.userId,
                            owner_label: col.userId ? col.label : (col.label === GENERAL ? GENERAL : col.label),
                            owner_role: g.role,
                            text,
                          }),
                        )
                      }
                      busy={busyId === `add-${g.key}`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-2 px-1 text-[12.5px] text-subtle">
        Bu liste haftadan bağımsızdır — konu tamamlanana kadar durur. Herkes kendi sütununa yazar
        {isAdmin ? "; yönetici tüm sütunlara müdahale eder ve “Bildir” ile konuyu göreve dönüştürür." : "."}
      </p>
    </Wrap>
  );
}

/** Bloğun kabuğu — haftaya bağlı OLMAYAN açık konu defteri. */
function Wrap({
  open, doneToggle, children,
}: { open: number; doneToggle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <PlanningSection
      step={3}
      title="Tamamlanmamış Eksik Konular"
      description="Haftaya bağlı değildir — kişi bazlı açık konu defteri, konu tamamlanana kadar durur."
      icon={ClipboardList}
      rightSlot={
        <>
          <span className="rounded-md bg-surface-muted px-2 py-1 text-[12px] font-semibold tabular-nums text-muted">
            {open} açık
          </span>
          {doneToggle}
        </>
      }
    >
      {children}
    </PlanningSection>
  );
}

/** "Tamamlananlar" anahtarı — Aslı Hanım bunu ekranda BULAMAMIŞTI
 *  ("küçük bir buton… nerede ya?"), o yüzden dolu yeşil ve sayaçlı. */
function DoneToggle({
  done, showDone, onToggle,
}: { done: number; showDone: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={showDone}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold transition-all duration-150 active:scale-[0.98]",
        showDone
          ? "border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600"
          : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-400 hover:bg-emerald-100",
      )}
      title={showDone ? "Tamamlananları gizle" : "Tamamlanan konuları göster — üstü çizili olarak listenin altına iner"}
    >
      <CheckCircle2 size={15} className="shrink-0" />
      {showDone ? "Tamamlananları gizle" : "Tamamlananlar"}
      <span
        className={cn(
          "rounded-md px-1.5 py-px text-[11.5px] font-bold tabular-nums",
          showDone ? "bg-white/20 text-white" : "bg-emerald-600 text-white",
        )}
      >
        {done}
      </span>
    </button>
  );
}

function ItemRow({
  item, busy, canWrite, canAssign, onToggle, onSave, onDelete, onAssign,
}: {
  item: PlanningOpenItem;
  busy: boolean;
  canWrite: boolean;
  canAssign: boolean;
  onToggle: () => void;
  onSave: (_text: string) => void;
  onDelete: () => void;
  onAssign: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const meta = item.category ? categoryMeta(item.category) : null;

  function commit() {
    const t = draft.trim();
    setEditing(false);
    if (!t || t === item.text) { setDraft(item.text); return; }
    onSave(t);
  }

  return (
    <li className="group/item flex items-start gap-2 px-3 py-1.5">
      <button
        onClick={onToggle}
        disabled={!canWrite || busy}
        className="mt-[3px] inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border border-line-strong text-transparent transition-colors duration-150 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-40"
        title={canWrite ? "Tamamlandı olarak işaretle" : "Bu sütuna yalnız sahibi veya yönetici yazar"}
        aria-label="Tamamlandı"
      >
        {busy ? <Loader2 size={10} className="animate-spin text-muted" /> : <Check size={10} />}
      </button>

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setDraft(item.text); setEditing(false); }
          }}
          className="min-w-0 flex-1 rounded border border-brand-ring bg-surface px-1.5 py-0.5 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-brand-ring"
        />
      ) : (
        <button
          onClick={() => canWrite && setEditing(true)}
          className={cn(
            "min-w-0 flex-1 text-left text-[12.5px] leading-snug text-ink/90",
            canWrite && "cursor-text hover:text-ink",
          )}
          title={canWrite ? "Düzenlemek için tıklayın" : undefined}
        >
          {meta && (
            <span
              aria-hidden
              className={cn("mr-1.5 inline-block h-2 w-2 shrink-0 rounded-sm align-middle ring-1 ring-inset ring-black/10", meta.dot)}
              title={meta.label}
            />
          )}
          {item.text}
          {item.task_id && <CheckCircle2 size={11} className="ml-1 inline text-emerald-600" aria-label="Göreve atandı" />}
        </button>
      )}

      <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/item:opacity-100">
        {canAssign && (
          <button
            onClick={onAssign}
            disabled={busy}
            className={cn(
              "rounded p-1 transition-colors",
              item.task_id ? "text-emerald-600 hover:bg-emerald-50" : "text-subtle hover:bg-surface-muted hover:text-brand",
            )}
            title={item.task_id ? "Görev oluşturuldu — güncelleyip tekrar bildir" : "Göreve dönüştür ve sahibine bildir"}
          >
            <Send size={12} />
          </button>
        )}
        {canWrite && (
          <button
            onClick={onDelete}
            disabled={busy}
            className="rounded p-1 text-subtle transition-colors hover:bg-red-50 hover:text-red-600"
            title="Sil"
          >
            <Trash2 size={12} />
          </button>
        )}
      </span>
    </li>
  );
}

function AddRow({ onAdd, busy }: { onAdd: (_text: string) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  function submit() {
    const t = text.trim();
    if (!t) { setOpen(false); return; }
    onAdd(t);
    setText("");
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 border-t border-hairline px-3 py-2 text-[12.5px] font-medium text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-brand"
      >
        <Plus size={12} /> Konu ekle
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 border-t border-hairline px-2 py-1.5">
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") { setText(""); setOpen(false); }
        }}
        placeholder="Yeni konu…"
        className="min-w-0 flex-1 rounded border border-line bg-surface px-1.5 py-1 text-[12.5px] text-ink placeholder:text-subtle focus:border-brand-ring focus:outline-none focus:ring-2 focus:ring-brand-ring"
      />
      <button
        onClick={submit}
        disabled={busy}
        className="rounded p-1 text-brand transition-colors hover:bg-brand-soft disabled:opacity-60"
        title="Ekle"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
      </button>
      <button
        onClick={() => { setText(""); setOpen(false); }}
        className="rounded p-1 text-subtle transition-colors hover:bg-surface-muted hover:text-ink"
        title="Kapat"
      >
        <X size={13} />
      </button>
    </div>
  );
}
