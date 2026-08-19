"use client";

import {
  useState, useOptimistic, useTransition, useRef, useEffect,
} from "react";
import {
  Plus, Pencil, Trash2, X, CheckCircle2, Circle, BookOpen, ChevronDown, ChevronUp,
  Layers, CalendarCheck, ShieldCheck, Info,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { canManageRules } from "@/lib/auth/permissions";
import { createRule, updateRule, deleteRule, toggleRule } from "@/lib/actions/rules";
import type { WorkspaceRule, WorkspaceRole } from "@/types";

// Rules are department-based. "Tüm çalışma alanı" = applies to everyone.
const ALL_WORKSPACE = "Tüm çalışma alanı";

// ── Rule card ──────────────────────────────────────────────────────────────────

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
      "flex items-start gap-3 p-3 rounded-lg border transition-all duration-200 ease-standard group",
      rule.is_active
        ? "bg-surface border-line hover:border-line-strong hover:shadow-card"
        : "bg-surface-muted border-hairline opacity-60",
    )}>
      <button
        onClick={() => canManage && onToggle(rule.id, !rule.is_active)}
        className={cn(
          "shrink-0 mt-0.5 rounded-full transition-transform duration-150",
          canManage ? "active:scale-90" : "cursor-default",
        )}
        aria-label={rule.is_active ? "Kural devre dışı bırak" : "Kural etkinleştir"}
        disabled={!canManage}
      >
        {rule.is_active
          ? <CheckCircle2 size={16} className="text-success" />
          : <Circle size={16} className="text-line-strong" />
        }
      </button>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium leading-snug text-ink", !rule.is_active && "line-through text-subtle")}>
          {rule.title}
        </p>
        {rule.body && (
          <p className="text-xs text-muted mt-1 leading-relaxed whitespace-pre-wrap">{rule.body}</p>
        )}
      </div>
      {canManage && <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 shrink-0">
        <button
          onClick={() => onEdit(rule)}
          className="p-1 text-subtle hover:text-ink hover:bg-surface-muted rounded-md active:scale-95 transition-all duration-150"
          aria-label="Düzenle"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={() => onDelete(rule.id)}
          className="p-1 text-subtle hover:text-danger hover:bg-danger/10 rounded-md active:scale-95 transition-all duration-150"
          aria-label="Sil"
        >
          <Trash2 size={12} />
        </button>
      </div>}
    </div>
  );
}

// ── Rule form ──────────────────────────────────────────────────────────────────

function RuleForm({
  initial,
  workspaceId,
  ruleCount,
  departmentNames,
  onSave,
  onCancel,
}: {
  initial?: WorkspaceRule;
  workspaceId: string;
  ruleCount: number;
  departmentNames: string[];
  onSave: (_data: { title: string; body: string; category: string }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [category, setCategory] = useState(initial?.category ?? ALL_WORKSPACE);
  const options = [ALL_WORKSPACE, ...departmentNames];
  const inputRef = useRef<HTMLInputElement>(null);

  void workspaceId;
  void ruleCount;

  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ title: title.trim(), body: body.trim(), category });
  }

  return (
    <form onSubmit={handleSubmit} className="anim-fade-up border border-brand-ring/60 bg-brand-soft/40 rounded-xl p-3 flex flex-col gap-2 shadow-card">
      <div className="flex items-center gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="text-xs border border-line rounded-lg px-2 py-1 bg-surface text-muted transition-colors duration-150 hover:border-line-strong focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40"
        >
          {options.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
        className="text-sm border border-line rounded-lg bg-surface px-2.5 py-1.5 text-ink placeholder:text-subtle transition-colors duration-150 hover:border-line-strong focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40"
        placeholder="Kural başlığı…"
        maxLength={500}
        required
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="text-xs border border-line rounded-lg bg-surface px-2.5 py-1.5 text-ink placeholder:text-subtle transition-colors duration-150 hover:border-line-strong focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40 resize-none"
        placeholder="Açıklama (isteğe bağlı)…"
        rows={2}
        maxLength={5000}
      />
      <div className="flex gap-1.5 justify-end">
        <button type="button" onClick={onCancel} className="px-2.5 py-1 text-xs font-medium text-muted hover:text-ink hover:bg-surface-muted rounded-lg border border-line bg-surface active:scale-[0.98] transition-all duration-150">İptal</button>
        <button type="submit" disabled={!title.trim()} className="px-2.5 py-1 text-xs font-medium bg-brand text-white rounded-lg hover:bg-brand-strong active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 transition-all duration-150">Kaydet</button>
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
  const activeCount = rules.filter((r) => r.is_active).length;

  return (
    <div className="anim-fade-up border border-line bg-surface rounded-xl overflow-hidden shadow-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-surface-muted select-none hover:bg-surface-hover transition-colors duration-150"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <BookOpen size={13} className="text-subtle" />
          <span className="text-sm font-semibold tracking-tight text-ink">{category}</span>
          <span className="text-[10px] tabular-nums bg-surface border border-line text-muted rounded-full px-1.5 py-0.5 leading-none">
            {activeCount}/{rules.length}
          </span>
        </div>
        {open ? <ChevronUp size={13} className="text-subtle" /> : <ChevronDown size={13} className="text-subtle" />}
      </button>
      {open && (
        <div className="anim-fade p-2 flex flex-col gap-1.5 border-t border-hairline">
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

  function handleDelete(id: string) {
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

  const activeTotal = optimisticRules.filter((r) => r.is_active).length;
  const categoryCount = Object.keys(grouped).length;

  return (
    <div className="flex flex-col h-full">
      {/* ── Page header: brand well + summary chips ─────────────────────────── */}
      <div className="border-b border-line bg-surface shrink-0">
        <div className="w-full px-6 py-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3 min-w-0">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand shrink-0">
                <BookOpen size={20} strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight text-ink">Rules</h1>
                <p className="text-sm text-muted mt-0.5 max-w-xl leading-relaxed">
                  Operasyon kuralları, kalite standardını ve günlük kontrol disiplinini korur.
                </p>
              </div>
            </div>
            {isManager && (
              <button
                onClick={() => { setAdding(true); setEditing(null); setActionError(null); }}
                className="flex items-center gap-1.5 text-sm bg-brand text-white rounded-lg px-3 py-2 hover:bg-brand-strong active:scale-[0.98] transition-all duration-150 shrink-0 font-medium"
              >
                <Plus size={14} /> Kural ekle
              </button>
            )}
          </div>

          {/* Summary chips */}
          <div className="stagger-children flex flex-wrap gap-2 mt-4">
            <SummaryChip icon={CheckCircle2} label="Aktif kural" value={`${activeTotal}/${optimisticRules.length}`} tone="brand" />
            <SummaryChip icon={Layers} label="Kategori" value={String(categoryCount)} tone="neutral" />
            <SummaryChip icon={CalendarCheck} label="Günlük kontrol" value="Her gün gözden geçir" tone="neutral" />
          </div>
        </div>
      </div>

      {/* ── Content: rule categories + side discipline panel ─────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="w-full px-6 py-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_308px] items-start">
          <div className="flex flex-col gap-4 min-w-0">
            {actionError && (
              <div role="alert" className="anim-fade-down flex items-center justify-between border border-danger/25 bg-danger/10 rounded-lg px-4 py-2.5 text-sm font-medium text-danger">
                <span className="min-w-0 break-words">{actionError}</span>
                <button onClick={() => setActionError(null)} aria-label="Kapat" className="ml-3 shrink-0 rounded-md p-0.5 text-danger/70 hover:text-danger hover:bg-danger/15 active:scale-95 transition-all duration-150">
                  <X size={14} />
                </button>
              </div>
            )}
            {isManager && adding && (
              <RuleForm
                workspaceId={workspaceId}
                ruleCount={optimisticRules.length}
                departmentNames={departmentNames}
                onSave={handleAdd}
                onCancel={() => setAdding(false)}
              />
            )}

            {isManager && editing && (
              <RuleForm
                initial={editing}
                workspaceId={workspaceId}
                ruleCount={optimisticRules.length}
                departmentNames={departmentNames}
                onSave={handleUpdate}
                onCancel={() => setEditing(null)}
              />
            )}

            {optimisticRules.length === 0 && !adding ? (
              <div className="anim-fade-up rounded-2xl border border-dashed border-line bg-surface text-center py-16 px-6">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-brand ring-8 ring-brand-soft/35 mx-auto mb-4">
                  <BookOpen size={20} strokeWidth={1.75} />
                </div>
                <p className="text-sm font-semibold tracking-tight text-ink">Henüz kural yok</p>
                <p className="text-[13px] text-muted mt-1">Ekip standartlarını buraya ekleyin.</p>
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

          {/* Right rail — control discipline / how-to (static guidance) */}
          <aside className="stagger-children flex flex-col gap-4 lg:sticky lg:top-6">
            <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
              <div className="flex items-center gap-2 mb-2.5">
                <ShieldCheck size={15} className="text-brand" />
                <h2 className="text-sm font-semibold tracking-tight text-ink">Kontrol disiplini</h2>
              </div>
              <p className="text-[13px] text-muted leading-relaxed">
                Kurallar; her görevin aynı kalite çıtasında teslim edilmesini sağlar.
                Aktif kurallar günlük kontrolün temelidir — düzenli gözden geçirin.
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
              <div className="flex items-center gap-2 mb-2.5">
                <Info size={15} className="text-brand" />
                <h2 className="text-sm font-semibold tracking-tight text-ink">Nasıl kullanılır?</h2>
              </div>
              <ul className="space-y-2 text-[13px] text-muted leading-relaxed">
                <li className="flex gap-2">
                  <CheckCircle2 size={14} className="text-brand shrink-0 mt-0.5" />
                  <span>Kurallar kategori (departman) bazında gruplanır.</span>
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 size={14} className="text-brand shrink-0 mt-0.5" />
                  <span>Yuvarlak işareti tıklayarak bir kuralı aktif/pasif yapabilirsiniz.</span>
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 size={14} className="text-brand shrink-0 mt-0.5" />
                  <span>Pasif kurallar listede kalır ama günlük kontrole dahil edilmez.</span>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ── Summary chip (header stat) ───────────────────────────────────────────────
function SummaryChip({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: string;
  tone?: "brand" | "neutral";
}) {
  return (
    <div className={cn(
      "inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 shadow-xs",
      tone === "brand" ? "border-brand-ring/60 bg-brand-soft" : "border-line bg-surface",
    )}>
      <Icon size={15} className={tone === "brand" ? "text-brand" : "text-subtle"} />
      <span className="text-[13px] text-muted">{label}</span>
      <span className={cn("text-[13px] font-semibold tabular-nums", tone === "brand" ? "text-brand-strong" : "text-ink")}>{value}</span>
    </div>
  );
}
