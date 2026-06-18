"use client";

import {
  useState, useOptimistic, useTransition, useRef, useEffect,
} from "react";
import { Plus, Pencil, Trash2, Check, X, CheckCircle2, Circle, BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { createRule, updateRule, deleteRule, toggleRule } from "@/lib/actions/rules";
import type { WorkspaceRule } from "@/types";

const CATEGORIES = ["Genel", "Kumaş Siparişi", "Üretim", "Operasyon", "Satın Alma", "Pazarlama", "Web & SEO"];

// ── Rule card ──────────────────────────────────────────────────────────────────

function RuleCard({
  rule,
  onToggle,
  onEdit,
  onDelete,
}: {
  rule: WorkspaceRule;
  onToggle: (_id: string, _val: boolean) => void;
  onEdit: (_rule: WorkspaceRule) => void;
  onDelete: (_id: string) => void;
}) {
  return (
    <div className={cn(
      "flex items-start gap-3 p-3 rounded-lg border transition-all group",
      rule.is_active ? "bg-white border-gray-200" : "bg-gray-50 border-gray-100 opacity-60",
    )}>
      <button
        onClick={() => onToggle(rule.id, !rule.is_active)}
        className="shrink-0 mt-0.5"
        aria-label={rule.is_active ? "Kural devre dışı bırak" : "Kural etkinleştir"}
      >
        {rule.is_active
          ? <CheckCircle2 size={16} className="text-green-500" />
          : <Circle size={16} className="text-gray-300" />
        }
      </button>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium leading-snug", !rule.is_active && "line-through text-gray-400")}>
          {rule.title}
        </p>
        {rule.body && (
          <p className="text-xs text-gray-500 mt-1 leading-relaxed whitespace-pre-wrap">{rule.body}</p>
        )}
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={() => onEdit(rule)}
          className="p-1 text-gray-300 hover:text-gray-600 rounded"
          aria-label="Düzenle"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={() => onDelete(rule.id)}
          className="p-1 text-gray-300 hover:text-red-500 rounded"
          aria-label="Sil"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ── Rule form ──────────────────────────────────────────────────────────────────

function RuleForm({
  initial,
  workspaceId,
  ruleCount,
  onSave,
  onCancel,
}: {
  initial?: WorkspaceRule;
  workspaceId: string;
  ruleCount: number;
  onSave: (_data: { title: string; body: string; category: string }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [category, setCategory] = useState(initial?.category ?? "Genel");
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
    <form onSubmit={handleSubmit} className="border-2 border-blue-200 bg-blue-50/30 rounded-lg p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-700"
        >
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
        className="text-sm border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-blue-400"
        placeholder="Kural başlığı…"
        maxLength={500}
        required
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="text-xs border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-blue-400 resize-none"
        placeholder="Açıklama (isteğe bağlı)…"
        rows={2}
        maxLength={5000}
      />
      <div className="flex gap-1 justify-end">
        <button type="button" onClick={onCancel} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 rounded border border-gray-200 bg-white">İptal</button>
        <button type="submit" disabled={!title.trim()} className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40">Kaydet</button>
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
}: {
  category: string;
  rules: WorkspaceRule[];
  onToggle: (_id: string, _val: boolean) => void;
  onEdit: (_rule: WorkspaceRule) => void;
  onDelete: (_id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const activeCount = rules.filter((r) => r.is_active).length;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpen size={13} className="text-gray-400" />
          <span className="text-sm font-semibold text-gray-700">{category}</span>
          <span className="text-[10px] bg-white border border-gray-200 text-gray-500 rounded-full px-1.5 py-0.5 leading-none">
            {activeCount}/{rules.length}
          </span>
        </div>
        {open ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
      </button>
      {open && (
        <div className="p-2 flex flex-col gap-1.5">
          {rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
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
}: {
  rules: WorkspaceRule[];
  workspaceId: string;
}) {
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
    const cat = rule.category ?? "Genel";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(rule);
    return acc;
  }, {});

  const activeTotal = optimisticRules.filter((r) => r.is_active).length;

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <BookOpen size={18} className="text-blue-600" />
          <div>
            <h1 className="text-lg font-bold text-gray-900">Kurallar</h1>
            <p className="text-xs text-gray-400">
              {activeTotal}/{optimisticRules.length} kural aktif — her gün kontrol et
            </p>
          </div>
        </div>
        <button
          onClick={() => { setAdding(true); setEditing(null); setActionError(null); }}
          className="flex items-center gap-1.5 text-sm bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700 transition-colors"
        >
          <Plus size={14} /> Kural ekle
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto flex flex-col gap-4">
          {actionError && (
            <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
              <span>{actionError}</span>
              <button onClick={() => setActionError(null)} className="ml-3 text-red-400 hover:text-red-600">
                <X size={14} />
              </button>
            </div>
          )}
          {adding && (
            <RuleForm
              workspaceId={workspaceId}
              ruleCount={optimisticRules.length}
              onSave={handleAdd}
              onCancel={() => setAdding(false)}
            />
          )}

          {editing && (
            <RuleForm
              initial={editing}
              workspaceId={workspaceId}
              ruleCount={optimisticRules.length}
              onSave={handleUpdate}
              onCancel={() => setEditing(null)}
            />
          )}

          {optimisticRules.length === 0 && !adding ? (
            <div className="text-center py-16 text-gray-400">
              <BookOpen size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Henüz kural yok.</p>
              <p className="text-xs mt-1">Ekip standartlarını buraya ekle.</p>
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
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
