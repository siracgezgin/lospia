"use client";

import { useState, useTransition, useMemo, useId } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Lock } from "lucide-react";
import { createTask } from "@/lib/actions/tasks";
import {
  STATUS_LABELS,
  PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_PRIORITIES,
  CARD_STATUS_OPTIONS,
} from "@/lib/utils/task-constants";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { assignPersonTones, personTone } from "@/lib/design/person-colors";
import { getPersonDisplayName } from "@/lib/utils/person-display";
import { cn } from "@/lib/utils/cn";
import { Overlay } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Field, FieldGrid, TextInput, TextArea, SelectInput } from "@/components/ui/Field";
import { type EffortSize } from "@/lib/points/effort";
import {
  TASK_VISIBILITIES, VISIBILITY_LABELS, VISIBILITY_DESCRIPTIONS,
  DEFAULT_VISIBILITY, type TaskVisibility,
} from "@/lib/utils/visibility";
import type { TaskStatus, TaskPriority, Profile, WorkspaceContact, WorkspaceDepartment } from "@/types";

type BoardMember = {
  memberId: string; userId: string; name: string; isAdmin?: boolean;
  /** Yöneticinin Ayarlar'dan seçtiği renk — verilirse kişi kartı onu taşır. */
  colorKey?: string | null;
};

interface Props {
  onClose: () => void;
  workspaceId: string;
  defaultStatus?: TaskStatus;
  defaultDueDate?: string;
  /** avatar_url: "Kim" çipleri fotoğrafı olanın FOTOĞRAFINI gösterir. */
  profiles: (Pick<Profile, "id" | "full_name" | "email"> & { avatar_url?: string | null })[];
  contacts: WorkspaceContact[];
  departments?: WorkspaceDepartment[];
  members?: BoardMember[];
  deptMembers?: { department_id: string; member_id: string }[];
  // Effort is an admin-only lever; members never see or set it.
  isAdmin?: boolean;
  // Pre-select a visibility (e.g. the Yönetici Pano tab decides this).
  defaultVisibility?: TaskVisibility;
  // Restrict the responsible picker to owner/admin people regardless of
  // visibility — used by Yönetici Pano so manager work stays with managers.
  lockResponsibleToAdmins?: boolean;
  // Pre-select responsible people (workspace_members ids). Yönetici Pano seeds
  // this with the active manager (or the creating admin) so a new task lands in
  // the current filter immediately.
  defaultResponsibleIds?: string[];
}

const SIMPLE_STATUS_OPTIONS = CARD_STATUS_OPTIONS;

/* Sunucudan gelen hata bazen ham Postgres/İngilizce metindir ("duplicate key…",
   "Not authenticated"). Kullanıcıya yalnız Türkçe, ne yapacağını söyleyen
   cümle gösterilir; teknik metin konsola düşer. */
const TECHNICAL_ERROR = /duplicate key|violates|permission denied|jwt|pgrst|relation|column|null value|syntax|invalid input|not authenticated|not found|fetch failed|network|unexpected/i;
function friendlyError(msg: string): string {
  if (!msg || TECHNICAL_ERROR.test(msg)) {
    if (msg) console.error("[createTask]", msg);
    return "Görev oluşturulamadı. Lütfen tekrar deneyin.";
  }
  return msg;
}

/* Kişi seçme çipi: seçili = marka dolgusu + onay işareti.
   min-h-10: kişi kartı 24px olunca çip parmakla basılabilir kalsın (≥40px). */
const PICK_CHIP =
  "inline-flex min-h-10 items-center gap-1.5 rounded-full border pl-1 pr-2.5 py-1 text-[12.5px] transition-colors duration-150 ease-standard active:scale-[0.98]";
const PICK_ON = "bg-brand-soft border-brand-ring text-brand-strong font-medium";
const PICK_OFF = "bg-surface border-line text-muted hover:bg-surface-hover hover:border-line-strong";

export function CreateTaskModal({
  onClose,
  workspaceId,
  defaultStatus = "ready",
  defaultDueDate = "",
  profiles = [],
  contacts = [],
  departments = [],
  members = [],
  isAdmin = false,
  defaultVisibility = DEFAULT_VISIBILITY,
  lockResponsibleToAdmins = false,
  defaultResponsibleIds = [],
}: Props) {
  const router = useRouter();
  const formId = useId();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Primary fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [responsibleIds, setResponsibleIds] = useState<string[]>(defaultResponsibleIds);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [status, setStatus] = useState<TaskStatus>(defaultStatus);
  const [priority, setPriority] = useState<TaskPriority>("medium");
  // Efor alanı çizilmiyor (Puan & Motivasyon kapalı) ama sözleşme korunuyor.
  const [effort] = useState<EffortSize>("medium");
  // Visibility is admin-only; members always create 'workspace' tasks. Yönetici
  // Pano pre-selects the visibility that matches the active tab.
  const [visibility, setVisibility] = useState<TaskVisibility>(
    isAdmin ? defaultVisibility : "workspace",
  );
  /* AYRINTILAR KAPALI AÇILIR.
     Pencere on alanla açılıyordu (başlık, açıklama, departman, sorumlular,
     başlangıç, teslim, durum, öncelik, efor, görünürlük) ve altısı zorunlu
     görünüyordu. Aslı Hanım (2026-08-24): "İsmi, işi, tarihi bu kadar…
     Bize ne kadar fazla bilgi verirsen o kadar yavaşlarız."
     Görünen üç alan artık tam olarak bu üçü: İŞ · KİM · NE ZAMAN. Gerisi
     "Daha fazla"nın arkasında ve hepsi isteğe bağlı — başlangıç tarihi zaten
     bugüne dolu geliyor, kimse elle girmek zorunda değil. */
  const [showMore, setShowMore] = useState(false);

  const topDepts = useMemo(() => departments.filter((d) => d.parent_id === null), [departments]);
  const childDepts = useMemo(() => {
    const m: Record<string, WorkspaceDepartment[]> = {};
    for (const d of departments) if (d.parent_id) (m[d.parent_id] ??= []).push(d);
    return m;
  }, [departments]);

  // Everyone in the workspace can be responsible for any task — department
  // membership is organisational info only, never an assignment constraint.
  // The only narrowing is admin_only visibility (owner/admin people only).
  const eligibleMembers = useMemo<BoardMember[]>(() => {
    const adminsOnly = visibility === "admin_only" || lockResponsibleToAdmins;
    return adminsOnly ? members.filter((m) => m.isAdmin) : members;
  }, [members, visibility, lockResponsibleToAdmins]);

  /* "Kim" çipleri artık YUVARLAK KİŞİ KARTI (Sıraç, 2026-08-30: "isimler her
     yerde kart olmalı, harf olarak değil"). Fotoğraf `profiles.avatar_url`'den,
     renk Pano ile AYNI kaynaktan: yönetici seçtiyse o renk, seçmediyse
     id'den deterministik atama. Tohum kümesi de Pano'nunkiyle aynı (üyeler ∪
     kişiler) — aynı insan iki ekranda iki türlü görünmesin. Yeni sorgu yok:
     bu iki liste zaten bileşene geliyordu. */
  const photoOf = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const p of profiles) map[p.id] = p.avatar_url ?? null;
    return map;
  }, [profiles]);

  const personTones = useMemo(
    () =>
      assignPersonTones(
        [...members.map((m) => m.userId), ...contacts.map((c) => c.id)],
        Object.fromEntries(members.map((m) => [m.userId, { colorKey: m.colorKey ?? null }])),
      ),
    [members, contacts],
  );

  // Switching to admin_only drops any already-picked non-admin responsibles.
  function handleVisibilityChange(value: TaskVisibility) {
    setVisibility(value);
    if (value === "admin_only") {
      const adminIds = new Set(members.filter((m) => m.isAdmin).map((m) => m.memberId));
      setResponsibleIds((prev) => prev.filter((id) => adminIds.has(id)));
    }
  }

  function toggleResponsible(memberId: string) {
    setResponsibleIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId],
    );
  }

  // Department is informational — changing it never drops selected people.
  function handleDepartmentChange(value: string) {
    setDepartmentId(value);
  }

  const workspaceIdMissing = !workspaceId || workspaceId.length < 10;

  // Teslim tarihi zorunlu; başlangıç tarihi bugüne dolu gelir (elle girilmez).
  const datesMissing = !dueDate;
  const dateOrderInvalid = !!startDate && !!dueDate && startDate > dueDate;
  const canSubmit = !isPending && !!title.trim() && !workspaceIdMissing && !datesMissing && !dateOrderInvalid;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || workspaceIdMissing) return;
    setError(null);

    if (!dueDate) { setError("Teslim tarihi zorunludur."); return; }
    if (dateOrderInvalid) { setError("Başlangıç tarihi teslim tarihinden sonra olamaz."); return; }

    startTransition(async () => {
      const result = await createTask({
        workspace_id: workspaceId,
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        assignee_id: null,
        responsible_contact_id: null,
        department_id: departmentId || null,
        due_date: dueDate || null,
        start_date: startDate || null,
        effort_size: isAdmin ? effort : undefined,
        visibility: isAdmin ? visibility : undefined,
        require_schedule: true,
        tags: [],
        custom_fields: {},
        // Responsible people become tracked participants (completion rows) —
        // persisted server-side inside createTask so a failed write surfaces
        // here as an error instead of silently losing the selection.
        participant_member_ids: responsibleIds,
      });

      if ("error" in result) {
        setError(friendlyError(result.error));
        return;
      }
      router.refresh(); // pull the newly created task into the board immediately
      onClose();
    });
  }

  return (
    <Overlay
      open
      onClose={onClose}
      title="Görev oluştur"
      size="md"
      dismissOnBackdrop={false}
      // Eylemler Overlay'in sabit alt çubuğunda: uzun formda "Oluştur" ekranın
      // altına düşmez. Düğme <form> dışında olduğu için `form` özniteliğiyle bağlı.
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>Vazgeç</Button>
          <Button type="submit" form={formId} loading={isPending} disabled={!canSubmit}>
            Görev oluştur
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        {/* ── 1. İŞ ─────────────────────────────────────────────────────── */}
        <Field label="İş" required>
          <TextInput
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ne yapılacak?"
            required
            autoFocus
          />
        </Field>

        {/* ── 2. KİM — sorumlu kişiler. Departman ASLA daraltmaz. ───────── */}
        <div>
          <p className="mb-1 block text-[12.5px] font-medium text-muted">Kim</p>
          {eligibleMembers.length === 0 ? (
            <p className="text-[12.5px] text-subtle bg-surface-muted border border-hairline rounded-control px-3 py-2">
              Çalışma alanında üye yok.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Sorumlu kişiler">
              {eligibleMembers.map((m) => {
                const on = responsibleIds.includes(m.memberId);
                return (
                  <button
                    key={m.memberId}
                    type="button"
                    onClick={() => toggleResponsible(m.memberId)}
                    aria-pressed={on}
                    className={cn(PICK_CHIP, on ? PICK_ON : PICK_OFF)}
                  >
                    {/* Renk bulunamazsa nötr griye düşmez; adından türeyen
                        kalıcı palet rengi verilir — kimse renksiz kalmasın. */}
                    <PersonAvatar
                      name={m.name}
                      photoUrl={photoOf[m.userId] ?? null}
                      colorHex={personTones[m.userId]?.hex ?? personTone(m.name).hex}
                      size="xs"
                    />
                    {getPersonDisplayName(m.name)}
                    {on && <Check size={12} aria-hidden />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── 3. NE ZAMAN — teslim tarihi. Tek zorunlu tarih. ───────────── */}
        <Field label="Ne zaman" required error={dateOrderInvalid ? "Başlangıç tarihi teslim tarihinden sonra olamaz." : undefined}>
          <TextInput
            type="date"
            value={dueDate}
            min={startDate || undefined}
            required
            onChange={(e) => setDueDate(e.target.value)}
            className="tabular-nums"
          />
        </Field>

        {/* ── Daha fazla — hepsi isteğe bağlı ───────────────────────────── */}
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
          className="inline-flex items-center gap-1 text-[13.5px] font-medium text-muted transition-colors duration-150 hover:text-ink"
        >
          {showMore ? "Daha az" : "Daha fazla"}
          <ChevronDown size={14} className={cn("transition-transform duration-200 ease-standard", showMore && "rotate-180")} aria-hidden />
        </button>

        {showMore && (
          <div className="anim-fade-down space-y-4 border-t border-hairline pt-4">
            <Field label="Açıklama">
              <TextArea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Gerekiyorsa birkaç satır…"
                className="resize-none"
              />
            </Field>

            <Field label="Departman">
              <SelectInput value={departmentId} onChange={(e) => handleDepartmentChange(e.target.value)}>
                <option value="">— Departman seçin</option>
                {topDepts.map((d) => (
                  <optgroup key={d.id} label={d.name}>
                    <option value={d.id}>{d.name} (genel)</option>
                    {(childDepts[d.id] ?? []).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </optgroup>
                ))}
              </SelectInput>
            </Field>

            <FieldGrid>
              <Field label="Başlangıç tarihi">
                <TextInput
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="tabular-nums"
                />
              </Field>
              <Field label="Durum">
                <SelectInput value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
                  {SIMPLE_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </SelectInput>
              </Field>
            </FieldGrid>

            <Field label="Öncelik">
              <SelectInput value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                ))}
              </SelectInput>
            </Field>

            {/* Görünürlük — admin-only. Members always create 'workspace' tasks. */}
            {isAdmin && (
              <div>
                <p className="mb-1 block text-[12.5px] font-medium text-muted">Görünürlük</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="group" aria-label="Görünürlük">
                  {TASK_VISIBILITIES.map((v) => {
                    const on = visibility === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => handleVisibilityChange(v)}
                        aria-pressed={on}
                        className={cn(
                          "text-left rounded-control border px-3 py-2 transition-colors duration-150",
                          on
                            ? "bg-brand-soft border-brand-ring"
                            : "bg-surface border-line hover:bg-surface-hover hover:border-line-strong",
                        )}
                      >
                        <span className={cn("flex items-center gap-1.5 text-[13.5px] font-medium", on ? "text-brand-strong" : "text-ink")}>
                          {v === "admin_only" && <Lock size={12} aria-hidden />}
                          {VISIBILITY_LABELS[v]}
                          {on && <Check size={13} className="ml-auto shrink-0" aria-hidden />}
                        </span>
                        <span className="block text-[12px] text-muted mt-0.5 leading-snug">
                          {VISIBILITY_DESCRIPTIONS[v]}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {visibility === "admin_only" && (
                  <p className="anim-fade-down text-[12px] text-muted mt-1.5">
                    Bu görevde yalnızca yönetici kişiler sorumlu olarak seçilebilir.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {workspaceIdMissing && (
          <p className="text-[12.5px] text-warning bg-warning/10 border border-warning/30 rounded-control px-3 py-2">
            Çalışma alanı bilgisi yüklenemedi. Sayfayı yenileyin.
          </p>
        )}

        {error && (
          <p role="alert" className="anim-fade-down text-[12.5px] text-danger bg-danger/10 border border-danger/20 rounded-control px-3 py-2">{error}</p>
        )}
      </form>
    </Overlay>
  );
}

// Keep STATUS_LABELS exported for compatibility with other components that may import from here
export { STATUS_LABELS, TASK_STATUSES };
