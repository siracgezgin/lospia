"use client";

import {
  useState, useOptimistic, useTransition, useRef, useEffect,
} from "react";
import {
  Plus, Pencil, Trash2, X, CheckCircle2, Circle, BookOpen, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { canManageRules } from "@/lib/auth/permissions";
import { createRule, updateRule, deleteRule, toggleRule } from "@/lib/actions/rules";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, SelectInput, TextArea, TextInput } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { useConfirm } from "@/components/ui/useConfirm";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import type { WorkspaceRule, WorkspaceRole } from "@/types";

// Rules are department-based. "Tüm çalışma alanı" = applies to everyone.
const ALL_WORKSPACE = "Tüm çalışma alanı";

// ── Rule card ──────────────────────────────────────────────────────────────────

/**
 * Tek kural satırı. Düzenle/Sil düğmeleri HER ZAMAN görünür — önce yalnız
 * fareyle üstüne gelince beliriyordu; telefonda hiç ulaşılamıyordu.
 * Pasif kural soluk değil, OKUNUR gri + üstü çizili: "kapalı" ile "silik"
 * karışmasın.
 */
function RuleCard({
  rule,
  onToggle,
  onEdit,
  onDelete,
  canManage = true,
}: {
  rule: WorkspaceRule;
  onToggle: (_id: string, _val: boolean) => void;
  onEdit: (_rule: WorkspaceRule) => void;
  onDelete: (_id: string) => void;
  canManage?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-start gap-3 rounded-card border p-3 transition-[border-color,box-shadow] duration-150 ease-standard",
      rule.is_active
        ? "border-line bg-surface hover:border-line-strong"
        : "border-hairline bg-surface-muted",
    )}>
      <button
        type="button"
        onClick={() => canManage && onToggle(rule.id, !rule.is_active)}
        className={cn(
          "tap-target mt-0.5 shrink-0 rounded-full transition-transform duration-150",
          canManage ? "active:scale-90" : "cursor-default",
        )}
        aria-pressed={rule.is_active}
        aria-label={rule.is_active ? "Kural etkin — devre dışı bırak" : "Kural devre dışı — etkinleştir"}
        title={canManage ? (rule.is_active ? "Devre dışı bırak" : "Etkinleştir") : undefined}
        disabled={!canManage}
      >
        {rule.is_active
          ? <CheckCircle2 size={16} className="text-success" aria-hidden />
          : <Circle size={16} className="text-line-strong" aria-hidden />
        }
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[13.5px] font-medium leading-snug", rule.is_active ? "text-ink" : "text-subtle line-through")}>
          {rule.title}
        </p>
        {rule.body && (
          <p className={cn("mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed", rule.is_active ? "text-muted" : "text-subtle")}>
            {rule.body}
          </p>
        )}
      </div>
      {canManage && (
        <div className="-mr-1 -mt-1 flex shrink-0 items-center gap-0.5">
          <IconButton size="sm" aria-label="Düzenle" title="Düzenle" onClick={() => onEdit(rule)}>
            <Pencil size={14} />
          </IconButton>
          <IconButton
            size="sm"
            aria-label="Sil"
            title="Sil"
            onClick={() => onDelete(rule.id)}
            className="hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 size={14} />
          </IconButton>
        </div>
      )}
    </div>
  );
}

// ── Rule form ──────────────────────────────────────────────────────────────────

function RuleForm({
  initial,
  departmentNames,
  onSave,
  onCancel,
}: {
  initial?: WorkspaceRule;
  departmentNames: string[];
  onSave: (_data: { title: string; body: string; category: string }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [category, setCategory] = useState(initial?.category ?? ALL_WORKSPACE);
  const options = [ALL_WORKSPACE, ...departmentNames];
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ title: title.trim(), body: body.trim(), category });
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label={initial ? "Kuralı düzenle" : "Yeni kural"}
      className="anim-fade-up flex flex-col gap-3.5 rounded-card border border-line-strong bg-surface p-4 shadow-card"
    >
      <Field label="Departman">
        <SelectInput value={category} onChange={(e) => setCategory(e.target.value)}>
          {options.map((c) => <option key={c} value={c}>{c}</option>)}
        </SelectInput>
      </Field>
      <Field label="Kural" required>
        <TextInput
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
          maxLength={500}
          required
        />
      </Field>
      <Field label="Açıklama" hint="İsteğe bağlı.">
        <TextArea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          maxLength={5000}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Vazgeç</Button>
        <Button type="submit" size="sm" disabled={!title.trim()}>Kaydet</Button>
      </div>
    </form>
  );
}

// ── Category group ────────────────────────────────────────────────────────────

function CategoryGroup({
  category,
  rules,
  onToggle,
  onEdit,
  onDelete,
  canManage = true,
}: {
  category: string;
  rules: WorkspaceRule[];
  onToggle: (_id: string, _val: boolean) => void;
  onEdit: (_rule: WorkspaceRule) => void;
  onDelete: (_id: string) => void;
  canManage?: boolean;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="anim-fade-up overflow-hidden rounded-card border border-line bg-surface shadow-card">
      {/* Katlanır başlık — segment düğmesi, class-only. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full select-none items-center justify-between gap-3 bg-surface-muted px-4 py-2.5 text-left transition-colors duration-150 hover:bg-surface-hover"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <BookOpen size={14} className="shrink-0 text-subtle" aria-hidden />
          <span className="truncate text-[13.5px] font-semibold tracking-tight text-ink">{category}</span>
          {/* Listeyi tarif eden sayı: bu grupta kaç kural var. */}
          <span className="shrink-0 text-[12px] tabular-nums text-subtle">{rules.length} kural</span>
        </span>
        {open ? <ChevronUp size={14} className="shrink-0 text-subtle" aria-hidden /> : <ChevronDown size={14} className="shrink-0 text-subtle" aria-hidden />}
      </button>
      {open && (
        <div className="anim-fade flex flex-col gap-1.5 border-t border-hairline p-2">
          {rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
              canManage={canManage}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

/**
 * RULES — ekip standartları, departmana göre gruplu.
 *
 * Sayfa önce bir başlık bloğu (ikon + "Rules" + açıklama cümlesi), üç özet
 * çipi ("Aktif kural 5/8", "Kategori 3", "Günlük kontrol") ve sağda iki
 * öğüt paneliyle ("Kontrol disiplini", "Nasıl kullanılır?") açılıyordu.
 * Başlık uygulama çubuğunda zaten yazıyor; çipler kuralları sayıp
 * puanlıyordu; paneller ilk günden sonra okunmuyordu. Geriye kuralların
 * kendisi kaldı — tam genişlikte.
 *
 * Silme artık ONAY SORAR (useConfirm) — önce tek tıkla, sessizce gidiyordu.
 */
export function RulesView({
  rules: initialRules,
  workspaceId,
  userRole = "member",
  departmentNames = [],
}: {
  rules: WorkspaceRule[];
  workspaceId: string;
  userRole?: WorkspaceRole;
  departmentNames?: string[];
}) {
  const isManager = canManageRules(userRole);
  const { ask, dialog } = useConfirm();
  const [_isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<WorkspaceRule | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [optimisticRules, applyOptimistic] = useOptimistic(
    initialRules,
    (state: WorkspaceRule[], action:
      | { type: "add"; rule: WorkspaceRule }
      | { type: "update"; id: string; data: Partial<WorkspaceRule> }
      | { type: "delete"; id: string }
    ) => {
      if (action.type === "add") return [...state, action.rule];
      if (action.type === "update") return state.map((r) => r.id === action.id ? { ...r, ...action.data } : r);
      if (action.type === "delete") return state.filter((r) => r.id !== action.id);
      return state;
    },
  );

  function handleAdd(data: { title: string; body: string; category: string }) {
    const tempRule: WorkspaceRule = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      title: data.title,
      body: data.body || null,
      category: data.category,
      is_active: true,
      position: optimisticRules.length,
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setAdding(false);
    setActionError(null);
    startTransition(async () => {
      applyOptimistic({ type: "add", rule: tempRule });
      const result = await createRule({ workspace_id: workspaceId, ...data, position: optimisticRules.length });
      if (result && "error" in result) {
        setActionError(`Kural eklenemedi: ${result.error}`);
      }
    });
  }

  function handleUpdate(data: { title: string; body: string; category: string }) {
    if (!editing) return;
    const id = editing.id;
    setEditing(null);
    setActionError(null);
    startTransition(async () => {
      applyOptimistic({ type: "update", id, data: { title: data.title, body: data.body || null, category: data.category } });
      const result = await updateRule({ id, title: data.title, body: data.body || null, category: data.category });
      if (result && "error" in result) {
        setActionError(`Kural güncellenemedi: ${result.error}`);
      }
    });
  }

  function handleToggle(id: string, is_active: boolean) {
    setActionError(null);
    startTransition(async () => {
      applyOptimistic({ type: "update", id, data: { is_active } });
      const result = await toggleRule(id, is_active);
      if (result && "error" in result) {
        setActionError(`İşlem başarısız: ${result.error}`);
      }
    });
  }

  async function handleDelete(id: string) {
    const rule = optimisticRules.find((r) => r.id === id);
    if (!(await ask({
      title: "Kural silinsin mi?",
      message: rule ? `"${rule.title}" listeden kalıcı olarak kaldırılır.` : "Kural kalıcı olarak kaldırılır.",
    }))) return;
    setActionError(null);
    startTransition(async () => {
      applyOptimistic({ type: "delete", id });
      const result = await deleteRule(id);
      if (result && "error" in result) {
        setActionError(`Silinemedi: ${result.error}`);
      }
    });
  }

  // Group rules by category
  const grouped = optimisticRules.reduce<Record<string, WorkspaceRule[]>>((acc, rule) => {
    const cat = rule.category ?? ALL_WORKSPACE;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(rule);
    return acc;
  }, {});

  const formOpen = adding || !!editing;

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      <ModulePageHeader
        title="Rules"
        rightSlot={
          isManager ? (
            /* Form açıkken ekranın ana eylemi "Kaydet"tir; ikinci bir primary
               durmasın diye bu düğme o sırada kapalı. */
            <Button
              onClick={() => { setAdding(true); setEditing(null); setActionError(null); }}
              disabled={formOpen}
            >
              <Plus size={15} aria-hidden /> Kural ekle
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-4">
        {actionError && (
          <div
            role="alert"
            className="anim-fade-down flex items-start justify-between gap-3 rounded-control border border-danger/25 bg-danger/8 px-3 py-2 text-[13px] leading-relaxed text-danger"
          >
            <span className="min-w-0 break-words py-1">{actionError}</span>
            <IconButton size="sm" aria-label="Kapat" onClick={() => setActionError(null)} className="-mr-1 text-danger hover:bg-danger/10 hover:text-danger">
              <X size={14} />
            </IconButton>
          </div>
        )}

        {isManager && adding && (
          <RuleForm
            departmentNames={departmentNames}
            onSave={handleAdd}
            onCancel={() => setAdding(false)}
          />
        )}

        {isManager && editing && (
          <RuleForm
            initial={editing}
            departmentNames={departmentNames}
            onSave={handleUpdate}
            onCancel={() => setEditing(null)}
          />
        )}

        {optimisticRules.length === 0 && !adding ? (
          <div className="anim-fade-up rounded-card border border-line bg-surface shadow-card">
            <EmptyState
              icon={BookOpen}
              title="Henüz kural yok."
              description={isManager ? "Ekip standartlarını “Kural ekle” ile yazın." : undefined}
            />
          </div>
        ) : (
          Object.entries(grouped).map(([cat, catRules]) => (
            <CategoryGroup
              key={cat}
              category={cat}
              rules={catRules}
              onToggle={handleToggle}
              onEdit={(r) => { setEditing(r); setAdding(false); }}
              onDelete={handleDelete}
              canManage={isManager}
            />
          ))
        )}
      </div>
      {dialog}
    </div>
  );
}
