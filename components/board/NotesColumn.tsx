"use client";

import {
  useState, useOptimistic, useTransition, useRef, useEffect, useSyncExternalStore,
  createContext, useContext,
} from "react";
import {
  DndContext, type DragEndEvent, MouseSensor, TouchSensor, useSensor, useSensors, closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Trash2, Pencil, GripVertical, ArrowRightCircle, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { createNote, updateNote, deleteNote, reorderNotes } from "@/lib/actions/notes";
import { createTask, softDeleteTask } from "@/lib/actions/tasks";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button, IconButton } from "@/components/ui/Button";
import { TextArea, TextInput } from "@/components/ui/Field";
import { ClampedText } from "@/components/ui/ClampedText";
import type { WorkspaceNote, NoteColor } from "@/types";

// ── Not renkleri — durum token'larından, az doygun ───────────────────────────
// Eskiden dört renk × dört ham hex'ti. Artık her not rengi bir tasarım
// token'ına bağlanır (%10 dolgu, %35 kenarlık): sarı → hold, mavi → info,
// mor → approval. "Yeşil" bilerek MARKA turkuazına eşlenir — yeşil yalnız
// "tamamlandı" içindir (semantics.ts: green → teal). Başlık her zaman ink;
// renk kenarlık ve noktada yaşar, metni boyamaz.
const NOTE_COLORS: Record<NoteColor, { bg: string; border: string; dot: string; label: string }> = {
  yellow: { bg: "bg-hold/10",     border: "border-hold/35",       dot: "bg-hold",     label: "Sarı" },
  blue:   { bg: "bg-info/10",     border: "border-info/35",       dot: "bg-info",     label: "Mavi" },
  green:  { bg: "bg-brand-soft",  border: "border-brand-ring/70", dot: "bg-brand",    label: "Turkuaz" },
  purple: { bg: "bg-approval/10", border: "border-approval/35",   dot: "bg-approval", label: "Mor" },
};

const ALL_COLORS: NoteColor[] = ["yellow", "blue", "green", "purple"];

/** Renk seçici noktaları — düzenleme ve ekleme formunda aynı. */
function ColorDots({ value, onChange }: { value: NoteColor; onChange: (_c: NoteColor) => void }) {
  return (
    <div className="mb-0.5 flex items-center gap-1.5" role="radiogroup" aria-label="Not rengi">
      {ALL_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          onClick={() => onChange(c)}
          className={cn(
            "tap-target h-3.5 w-3.5 rounded-full transition-[box-shadow,opacity] duration-150 ease-standard",
            NOTE_COLORS[c].dot,
            value === c ? "ring-2 ring-ink/40 ring-offset-1" : "opacity-60 hover:opacity-100",
          )}
          aria-label={NOTE_COLORS[c].label}
        />
      ))}
    </div>
  );
}

// Satır içi düzenleme alanları: ortak primitif, saydam zemin, yalnız alt
// çizgi (kartın kendi rengi zaten çerçeve). twMerge ile boy/çerçeve ezilir.
const INLINE_INPUT =
  "h-8 rounded-none border-0 border-b border-line-strong bg-transparent px-0 text-[13.5px] font-medium focus:border-brand focus:ring-0";
const INLINE_TEXTAREA =
  "min-h-0 resize-none rounded-none border-0 bg-transparent px-0 py-0 text-[13px] text-muted focus:ring-0";

// ── Note author resolution (created_by → display name) ────────────────────────
const NoteAuthorsContext = createContext<Record<string, string>>({});

// "Bugün 14:32" / "Dün 18:10" / "5 Oca 09:00" — compact, professional metadata.
function formatNoteMeta(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const dayDiff = Math.round((startOfDay(new Date()).getTime() - startOfDay(d).getTime()) / 86400000);
  if (dayDiff === 0) return `Bugün ${time}`;
  if (dayDiff === 1) return `Dün ${time}`;
  return `${d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} ${time}`;
}

// ── Shared types ───────────────────────────────────────────────────────────────

type NoteHandlers = {
  onDelete: (_id: string) => void;
  onUpdate: (_id: string, _title: string, _body: string, _color: NoteColor) => void;
  onConvertToTask: (_id: string, _title: string, _body: string) => void;
  readOnly?: boolean;
};

type DragProps = {
  containerRef?: React.Ref<HTMLDivElement>;
  containerStyle?: React.CSSProperties;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  isDragging?: boolean;
};

// ── Note card content (shared, no DnD hook) ───────────────────────────────────

function NoteCardContent({
  note,
  onDelete,
  onUpdate,
  onConvertToTask,
  readOnly = false,
  canModify = true,
  containerRef,
  containerStyle,
  dragHandleProps,
  isDragging,
}: { note: WorkspaceNote; canModify?: boolean } & NoteHandlers & DragProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body ?? "");
  const [color, setColor] = useState<NoteColor>(note.color);
  const titleRef = useRef<HTMLInputElement>(null);
  const colors = NOTE_COLORS[note.color];

  useEffect(() => { if (editing) titleRef.current?.focus(); }, [editing]);

  function handleSave() {
    if (!title.trim()) return;
    onUpdate(note.id, title.trim(), body, color);
    setEditing(false);
  }

  function handleCancel() {
    setTitle(note.title);
    setBody(note.body ?? "");
    setColor(note.color);
    setEditing(false);
  }

  if (editing) {
    const editColors = NOTE_COLORS[color];
    return (
      <div
        className={cn(
          "rounded-card border p-3 shadow-card flex flex-col gap-1.5 anim-scale-in",
          editColors.bg, editColors.border,
        )}
      >
        <ColorDots value={color} onChange={setColor} />
        <TextInput
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancel(); }}
          className={INLINE_INPUT}
          placeholder="Başlık"
          aria-label="Not başlığı"
          maxLength={500}
        />
        <TextArea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={INLINE_TEXTAREA}
          placeholder="Not içeriği…"
          aria-label="Not içeriği"
          rows={3}
          maxLength={5000}
        />
        {/* Vazgeç solda (ghost), Kaydet sağda — form hiyerarşisi. */}
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={handleCancel}>Vazgeç</Button>
          <Button size="sm" onClick={handleSave} disabled={!title.trim()}>Kaydet</Button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={containerStyle}
      className={cn(
        "rounded-card border p-3 shadow-card group transition-shadow duration-150 ease-standard hover:shadow-card-hover",
        colors.bg, colors.border,
        isDragging && "opacity-40 shadow-pop",
      )}
    >
      <div className="flex items-start gap-1">
        {/* Tutamaç her zaman görünür (soluk) — sürüklenebilirlik hover'a
            saklanmaz. dnd-kit tutamacı: ham <button>, yalnız sınıf düzeltildi. */}
        {!readOnly ? (
          <button
            {...dragHandleProps}
            type="button"
            className="mt-0.5 shrink-0 cursor-grab touch-manipulation rounded p-0.5 text-subtle/70 transition-colors duration-150 hover:text-muted active:cursor-grabbing"
            aria-label="Sürükle"
            title="Sürükleyerek sırasını değiştirin — dokunmatikte basılı tutun"
            tabIndex={-1}
          >
            <GripVertical size={13} />
          </button>
        ) : (
          <span className="mt-0.5 p-0.5 shrink-0 text-transparent" aria-hidden><GripVertical size={13} /></span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <p className="text-[13.5px] font-semibold leading-snug flex-1 min-w-0 break-words text-ink">
              {note.title}
            </p>
            {/* Eylemler her zaman görünür (soluk): hover'a bağlı işlev
                telefonda erişilemezdi. Küçük ikon düğmeleri tap-target'lı. */}
            {!readOnly && canModify && (
            <div className="flex shrink-0 items-center gap-0.5">
              <IconButton
                size="sm"
                className="size-6 rounded-md text-subtle hover:text-brand"
                onClick={() => onConvertToTask(note.id, note.title, note.body ?? "")}
                aria-label="Göreve dönüştür"
                title="Göreve dönüştür"
              >
                <ArrowRightCircle size={13} />
              </IconButton>
              <IconButton
                size="sm"
                className="size-6 rounded-md text-subtle"
                onClick={() => setEditing(true)}
                aria-label="Notu düzenle"
                title="Düzenle"
              >
                <Pencil size={13} />
              </IconButton>
              <IconButton
                size="sm"
                className="size-6 rounded-md text-subtle hover:bg-danger/10 hover:text-danger"
                onClick={() => onDelete(note.id)}
                aria-label="Notu sil"
                title="Sil"
              >
                <Trash2 size={13} />
              </IconButton>
            </div>
            )}
          </div>
          {note.body && (
            <div className="mt-1">
              <ClampedText text={note.body} lines={4} className="text-[13px] leading-relaxed text-muted" />
            </div>
          )}
          <NoteMeta note={note} />
        </div>
      </div>
    </div>
  );
}

// ── Author + timestamp metadata row ───────────────────────────────────────────
function NoteMeta({ note }: { note: WorkspaceNote }) {
  const authors = useContext(NoteAuthorsContext);
  const author = note.created_by ? authors[note.created_by] ?? "Bilinmeyen kullanıcı" : "Bilinmeyen kullanıcı";
  const when = note.created_at ? formatNoteMeta(note.created_at) : "";
  return (
    <p className="mt-1.5 truncate text-[12px] text-subtle">
      <span className="font-medium text-muted">{author}</span>
      {when && <span> · {when}</span>}
    </p>
  );
}

// ── Sortable wrapper — only mounted client-side to avoid aria-describedby mismatch ──

function SortableNoteCard({ note, canModify, ...handlers }: { note: WorkspaceNote; canModify?: boolean } & NoteHandlers) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: note.id });
  return (
    <NoteCardContent
      note={note}
      canModify={canModify}
      {...handlers}
      containerRef={setNodeRef}
      containerStyle={{ transform: CSS.Transform.toString(transform), transition }}
      dragHandleProps={({ ...attributes, ...listeners } as React.HTMLAttributes<HTMLButtonElement>)}
      isDragging={isDragging}
    />
  );
}

// ── Static wrapper — SSR-safe, no dnd-kit hooks ───────────────────────────────

function StaticNoteCard({ note, canModify, ...handlers }: { note: WorkspaceNote; canModify?: boolean } & NoteHandlers) {
  return <NoteCardContent note={note} canModify={canModify} {...handlers} />;
}

// ── Add note form ──────────────────────────────────────────────────────────────

function AddNoteForm({
  workspaceId,
  onAdd,
  onCancel,
  initialTitle = "",
  initialBody = "",
  initialColor = "yellow",
}: {
  workspaceId: string;
  onAdd: (_title: string, _body: string, _color: NoteColor) => void;
  onCancel: () => void;
  /* Sunucu notu reddettiğinde form YAZILANLARLA yeniden açılır — kullanıcı
     cümlesini ikinci kez yazmasın. */
  initialTitle?: string;
  initialBody?: string;
  initialColor?: NoteColor;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [color, setColor] = useState<NoteColor>(initialColor);
  const inputRef = useRef<HTMLInputElement>(null);
  void workspaceId;

  useEffect(() => { inputRef.current?.focus(); }, []);

  const editColors = NOTE_COLORS[color];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd(title.trim(), body.trim(), color);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn("rounded-card border p-3 shadow-card flex flex-col gap-1.5 anim-scale-in", editColors.bg, editColors.border)}
    >
      <ColorDots value={color} onChange={setColor} />
      <TextInput
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
        className={INLINE_INPUT}
        placeholder="Not başlığı…"
        aria-label="Not başlığı"
        maxLength={500}
        required
      />
      <TextArea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className={INLINE_TEXTAREA}
        placeholder="Not içeriği (isteğe bağlı)…"
        aria-label="Not içeriği"
        rows={2}
        maxLength={5000}
      />
      <div className="flex justify-end gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Vazgeç</Button>
        <Button type="submit" size="sm" disabled={!title.trim()}>Ekle</Button>
      </div>
    </form>
  );
}

// ── Mount detection via useSyncExternalStore (avoids setState-in-effect lint error) ──

const _subscribeMounted = () => () => {};
const _getMounted = () => true;
const _getServerMounted = () => false;

// ── Main column ────────────────────────────────────────────────────────────────

export function NotesColumn({
  notes: initialNotes,
  workspaceId,
  readOnly = false,
  authorsById = {},
  mobile = false,
  currentUserId,
  isAdmin = false,
  feed,
  feedLabel = "Bu haftaki görev notları",
  onMutated,
}: {
  notes: WorkspaceNote[];
  workspaceId: string;
  readOnly?: boolean;
  authorsById?: Record<string, string>;
  // Mobile single-column view: drop the fixed kanban width and fill the screen.
  mobile?: boolean;
  // Per-note edit/delete gating: admins manage any note; members only their own.
  currentUserId?: string;
  isAdmin?: boolean;
  // Haftanın Not Akışı — the primary content of the column (weekly task-note
  // feed rendered by the board). The sticky "Pano notları" stay below it.
  feed?: React.ReactNode;
  // Feed heading — the board overrides it with the selected week's label when
  // the user is browsing a week other than the current one.
  feedLabel?: string;
  /* Başarılı bir not işleminden sonra çağrılır. Not eylemleri yalnız
     revalidatePath("/board") çağırıyor; Yönetici Pano ayrı bir rota olduğu için
     orada iyimser değişiklik eski veriyle geri alınıyordu (eklenen not anında
     kayboluyordu). Pano bu kancayla o rotayı tazeler. */
  onMutated?: () => void;
}) {
  // A note is modifiable by an owner/admin, or by the member who authored it.
  const canModifyNote = (note: WorkspaceNote) =>
    isAdmin || (!!currentUserId && note.created_by === currentUserId);
  // Detects client vs server render without triggering a state update in effect
  const mounted = useSyncExternalStore(_subscribeMounted, _getMounted, _getServerMounted);
  const [_isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  /* Kaydedilemeyen notun taslağı — form yeniden açılırken geri yazılır. */
  const [failedDraft, setFailedDraft] = useState<{ title: string; body: string; color: NoteColor } | null>(null);

  // Confirm popup (before a destructive note action) + short-lived undo toast.
  const [confirmAction, setConfirmAction] = useState<
    | { kind: "delete"; note: WorkspaceNote }
    | { kind: "convert"; note: WorkspaceNote }
    | null
  >(null);
  const [undo, setUndo] = useState<
    | { kind: "delete"; note: WorkspaceNote }
    | { kind: "convert"; note: WorkspaceNote; taskId: string }
    | null
  >(null);
  /* HATA GÖRÜNÜRLÜĞÜ.
     Not ekleme/düzenleme/silme/sıralama sunucu cevabını hiç okumuyordu: işlem
     reddedilince iyimser değişiklik sessizce geri alınıyor, kullanıcı yazdığı
     notun neden kaybolduğunu anlamıyordu. Artık her eylem hatasını bu satırda
     Türkçe gösterir. */
  const [error, setError] = useState<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* 7 sn'lik geri-al zamanlayıcısı bileşenle birlikte ölsün: pano sökülüp
     başka bir sayfaya geçildiğinde sökülmüş bileşende setState çalışıyordu. */
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  function showUndo(u: NonNullable<typeof undo>) {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo(u);
    undoTimer.current = setTimeout(() => setUndo(null), 7000);
  }

  /* Pano kartlarıyla AYNI algılayıcı düzeni: fare 5px hareketle, parmak 220ms
     basılı tutmayla sürükler. Tek PointerSensor varken dokunmatikte tutamaca
     dokunmak sütunun kaydırmasını kilitliyordu. */
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const [optimisticNotes, applyOptimistic] = useOptimistic(
    initialNotes,
    (state: WorkspaceNote[], action:
      | { type: "add"; note: WorkspaceNote }
      | { type: "delete"; id: string }
      | { type: "update"; id: string; title: string; body: string; color: NoteColor }
      | { type: "reorder"; notes: WorkspaceNote[] }
    ) => {
      if (action.type === "add") return [...state, action.note];
      if (action.type === "delete") return state.filter((n) => n.id !== action.id);
      if (action.type === "update") {
        return state.map((n) =>
          n.id === action.id ? { ...n, title: action.title, body: action.body, color: action.color } : n,
        );
      }
      if (action.type === "reorder") return action.notes;
      return state;
    },
  );

  function handleAdd(title: string, body: string, color: NoteColor) {
    const tempNote: WorkspaceNote = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      title,
      body: body || null,
      color,
      position: optimisticNotes.length,
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setAdding(false);
    setError(null);
    startTransition(async () => {
      applyOptimistic({ type: "add", note: tempNote });
      const res = await createNote({ workspace_id: workspaceId, title, body: body || undefined, color });
      if ("error" in res) {
        /* İyimser not geri alınıyor; form kapalı kalsaydı kullanıcının YAZDIĞI
           başlık ve gövde de onunla birlikte kaybolurdu. Form aynı metinle
           yeniden açılır: hata görünür, veri duruyor. */
        setError(res.error || "Not kaydedilemedi.");
        setFailedDraft({ title, body, color });
        setAdding(true);
        return;
      }
      setFailedDraft(null);
      onMutated?.();
    });
  }

  function handleUpdate(id: string, title: string, body: string, color: NoteColor) {
    setError(null);
    startTransition(async () => {
      applyOptimistic({ type: "update", id, title, body, color });
      const res = await updateNote({ id, title, body: body || null, color });
      if ("error" in res) { setError(res.error || "Not güncellenemedi."); return; }
      onMutated?.();
    });
  }

  // ── Destructive note actions: confirm popup → act → undo toast ───────────────
  // Both "notu sil" and "göreve dönüştür" first ask for confirmation (a stray
  // click shouldn't destroy a note), then surface an undo affordance.
  function requestDelete(id: string) {
    const note = optimisticNotes.find((n) => n.id === id);
    if (note) setConfirmAction({ kind: "delete", note });
  }
  function requestConvert(id: string) {
    const note = optimisticNotes.find((n) => n.id === id);
    if (note) setConfirmAction({ kind: "convert", note });
  }

  function performDelete(note: WorkspaceNote) {
    setError(null);
    startTransition(async () => {
      applyOptimistic({ type: "delete", id: note.id });
      const res = await deleteNote(note.id);
      if ("error" in res) {
        setError(res.error || "Not silinemedi.");
        return;
      }
      onMutated?.();
      showUndo({ kind: "delete", note });
    });
  }

  /* GÖREVE DÖNÜŞTÜR — sıra hayatidir.
     Eskiden görev oluşturma sonucu HİÇ kontrol edilmiyordu: createTask hata
     dönerse bile not siliniyordu. Sonuç: ne görev var, ne not — yazılan iş
     tamamen kayboluyordu. Artık görev oluşmadıysa not YERİNDE KALIR ve hata
     yazılır; not ancak görev gerçekten oluştuktan sonra silinir. */
  function performConvert(note: WorkspaceNote) {
    setError(null);
    startTransition(async () => {
      const created = await createTask({
        workspace_id: workspaceId,
        title: note.title,
        description: note.body || undefined,
        status: "backlog",
        priority: "medium",
        tags: [],
        custom_fields: {},
        participant_member_ids: [],
      });
      if ("error" in created) {
        setError(created.error || "Görev oluşturulamadı; not silinmedi.");
        return;
      }
      applyOptimistic({ type: "delete", id: note.id });
      const removed = await deleteNote(note.id);
      if ("error" in removed) {
        // Görev oluştu ama not kaldırılamadı — kullanıcı ikisini de görmeli.
        setError("Görev oluşturuldu, fakat not listeden kaldırılamadı.");
        return;
      }
      onMutated?.();
      showUndo({ kind: "convert", note, taskId: created.id });
    });
  }

  function runConfirmed() {
    if (!confirmAction) return;
    const action = confirmAction;
    setConfirmAction(null);
    if (action.kind === "delete") performDelete(action.note);
    else performConvert(action.note);
  }

  // Undo re-creates the note (and, for a conversion, removes the just-created
  // task). Best-effort within the session — enough to recover a misclick.
  function runUndo() {
    if (!undo) return;
    const u = undo;
    setUndo(null);
    setError(null);
    startTransition(async () => {
      /* Geri alma sırasında görev silinemezse kullanıcı hem notu hem de
         duran görevi elde ediyordu ve bunu hiçbir yerde görmüyordu. Akış
         durmaz (not yine geri yüklenir), yalnız bildirilir. */
      let taskCleanupFailed = false;
      if (u.kind === "convert") {
        const del = await softDeleteTask(u.taskId);
        if ("error" in del) taskCleanupFailed = true;
      }
      const restored: WorkspaceNote = { ...u.note, id: crypto.randomUUID() };
      applyOptimistic({ type: "add", note: restored });
      const res = await createNote({
        workspace_id: workspaceId,
        title: u.note.title,
        body: u.note.body || undefined,
        color: u.note.color,
      });
      if ("error" in res) { setError(res.error || "Not geri alınamadı."); return; }
      if (taskCleanupFailed) setError("Not geri alındı, fakat oluşturulan görev silinemedi.");
      onMutated?.();
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = optimisticNotes.findIndex((n) => n.id === active.id);
    const newIndex = optimisticNotes.findIndex((n) => n.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(optimisticNotes, oldIndex, newIndex).map((n, i) => ({ ...n, position: i }));
    setError(null);
    startTransition(async () => {
      applyOptimistic({ type: "reorder", notes: reordered });
      const res = await reorderNotes(reordered.map((n) => ({ id: n.id, position: n.position })));
      // Sıra kaydedilemediyse iyimser dizilim geri alınır (useOptimistic) —
      // kullanıcı da NEDEN eski sırayı gördüğünü öğrenmeli.
      if ("error" in res) { setError(res.error || "Not sırası kaydedilemedi."); return; }
      onMutated?.();
    });
  }

  const noteIds = optimisticNotes.map((n) => n.id);

  // No dashed placeholder box — an empty sticky-note list renders nothing (the
  // weekly feed above is the column's primary content).
  const listCls = "flex flex-col gap-2 rounded-card p-1";

  const handlers: NoteHandlers = {
    onDelete: requestDelete,
    onUpdate: handleUpdate,
    onConvertToTask: (id: string) => requestConvert(id),
    readOnly,
  };

  return (
    <NoteAuthorsContext.Provider value={authorsById}>
    <div className={cn("flex flex-col gap-2 shrink-0", mobile ? "w-full" : "w-[80vw] max-w-64 sm:w-64")}>
      {/* Header */}
      {/* Başlık, görev sütunlarıyla BİREBİR aynı hizada.
          Aslı Hanım (2026-08-24): "Bu başlıklarda kayma var gibi duruyor."
          Sebep artı düğmesi değildi: bu sütunun başlığında bir ikon vardı ve
          metni 21px sağa itiyordu; diğer dört başlık sütun kenarına bitişikti.
          Sayaç da yalnız burada eksikti. İkon kaldırıldı, sayaç eklendi —
          beş başlık aynı x'te başlıyor ve aynı biçimi taşıyor. */}
      {/* Görev sütunlarıyla aynı eyebrow ölçüsü ve sayaç biçimi (12px). */}
      <div className="sticky top-0 z-20 flex h-11 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Notlar</h3>
          <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-surface-sunken px-1.5 py-0.5 text-[12px] font-semibold leading-none text-muted tabular-nums">
            {optimisticNotes.length}
          </span>
        </div>
      </div>

      {/* Hata satırı — sütunun içinde, kapatılabilir. Sunucu bir işlemi
          reddettiğinde kullanıcı bunu okumadan devam edemesin. */}
      {error && (
        <div
          role="alert"
          className="anim-fade flex items-start gap-2 rounded-card border border-danger/30 bg-danger/10 px-2.5 py-2 text-[12.5px] leading-snug text-danger"
        >
          <span className="min-w-0 flex-1 break-words">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="tap-target shrink-0 rounded-md text-danger/70 transition-colors duration-150 hover:text-danger"
            aria-label="Hata mesajını kapat"
            title="Kapat"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Haftanın Not Akışı — primary content */}
      {feed && (
        <div className="flex flex-col gap-1.5">
          <p className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">
            {feedLabel}
          </p>
          {feed}
        </div>
      )}

      {/* Pano notları (sticky quick notes) — secondary section. Sayaç yalnız
          üstteki sütun başlığında: aynı sayı iki kez yazılıyordu. */}
      <div className="mt-1 flex items-center justify-between px-1">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">Pano notları</p>
        {!readOnly && (
          <IconButton
            size="sm"
            className="size-7 text-subtle hover:bg-brand-soft hover:text-brand"
            onClick={() => setAdding(true)}
            aria-label="Pano notu ekle"
            title="Pano notu ekle"
          >
            <Plus size={15} />
          </IconButton>
        )}
      </div>

      {/* Yeni not formu listenin ÜSTÜNDE açılır. Altta açılıyordu: notlar
          çoğaldıkça "+" düğmesine basan kişi ekranda hiçbir şey görmüyor,
          düğme bozuk sanıyordu. */}
      {!readOnly && adding && (
        <AddNoteForm
          key={failedDraft ? "retry" : "new"}
          workspaceId={workspaceId}
          onAdd={handleAdd}
          onCancel={() => { setAdding(false); setFailedDraft(null); }}
          initialTitle={failedDraft?.title ?? ""}
          initialBody={failedDraft?.body ?? ""}
          initialColor={failedDraft?.color ?? "yellow"}
        />
      )}

      {/* Boş liste: tek satırlık davet — "+" düğmesinin ne yaptığını söyler. */}
      {!adding && optimisticNotes.length === 0 && (
        <p className="px-1 text-[12.5px] leading-snug text-subtle">
          {readOnly
            ? "Henüz pano notu yok."
            : "Henüz pano notu yok. Yukarıdaki + ile hatırlatma ekleyin."}
        </p>
      )}

      {/* Pre-mount: static list — no dnd-kit, no aria-describedby generation */}
      {!mounted && (
        <div className={listCls}>
          {optimisticNotes.map((note) => (
            <StaticNoteCard key={note.id} note={note} canModify={canModifyNote(note)} {...handlers} />
          ))}
        </div>
      )}

      {/* Post-mount: full DnD list */}
      {mounted && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={noteIds} strategy={verticalListSortingStrategy}>
            <div className={listCls}>
              {optimisticNotes.map((note) => (
                <SortableNoteCard key={note.id} note={note} canModify={canModifyNote(note)} {...handlers} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Confirm before converting / deleting a note (guards against misclicks) */}
      <ConfirmDialog
        open={confirmAction !== null}
        title={
          confirmAction?.kind === "convert"
            ? "Bu notu göreve dönüştürmek istediğinizden emin misiniz?"
            : "Bu notu silmek istediğinizden emin misiniz?"
        }
        message={
          confirmAction?.kind === "convert"
            ? `"${confirmAction.note.title}" notu bir göreve dönüştürülecek ve not listesinden kaldırılacak.`
            : confirmAction?.kind === "delete"
              ? `"${confirmAction.note.title}" notu silinecek.`
              : ""
        }
        confirmLabel={confirmAction?.kind === "convert" ? "Evet, dönüştür" : "Evet, sil"}
        cancelLabel="İptal"
        onConfirm={runConfirmed}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Undo toast — recover a just-converted/deleted note within the session */}
      {/* Panonun kendi bildirim kartıyla aynı dil (ink zemin, rounded-card);
          telefonda alt gezinmenin üstünde durur. */}
      {undo && (
        <div className="pointer-events-auto anim-slide-up fixed left-1/2 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-[100] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center gap-3 rounded-card bg-ink px-4 py-2.5 text-sm text-white shadow-drawer md:bottom-4">
          <span className="flex-1">
            {undo.kind === "convert" ? "Not göreve dönüştürüldü." : "Not silindi."}
          </span>
          <button
            type="button"
            onClick={runUndo}
            className="inline-flex shrink-0 items-center gap-1 font-medium text-brand-ring underline underline-offset-2 transition-colors duration-150 hover:text-white"
          >
            <Undo2 size={13} /> Geri al
          </button>
          <button
            type="button"
            onClick={() => setUndo(null)}
            className="tap-target shrink-0 rounded-md text-white/60 transition-colors duration-150 hover:text-white"
            aria-label="Kapat"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
    </NoteAuthorsContext.Provider>
  );
}
