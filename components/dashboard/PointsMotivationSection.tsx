import { Sparkles, Clock3, RotateCcw, Trophy, Building2, ListTree, CheckCircle2, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatDateTimeTR } from "@/lib/utils/format-date";
import { RepairPointsButton } from "@/components/dashboard/RepairPointsButton";
import type { AdminPointsData, MemberPointsSummary } from "@/lib/points/queries";

interface Props {
  isAdmin: boolean;
  admin: AdminPointsData | null;
  member: MemberPointsSummary;
}

function Tile({
  icon, label, value, tone = "neutral",
}: { icon: React.ReactNode; label: string; value: number | string; tone?: "neutral" | "brand" | "warning" | "danger" | "success" }) {
  const toneCls = {
    neutral: "text-ink",
    brand: "text-brand",
    warning: "text-warning",
    danger: "text-danger",
    success: "text-[#1c7a52]",
  }[tone];
  return (
    <div className="bg-surface rounded-xl border border-line shadow-card p-4">
      <div className="flex items-center gap-2 text-subtle">
        {icon}
        <span className="text-xs font-medium text-muted">{label}</span>
      </div>
      <p className={cn("mt-2 text-3xl font-semibold tabular-nums", toneCls)}>{value}</p>
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = {
  earned: "Kazanıldı",
  revoked: "Geri alındı",
  adjustment: "Düzeltme",
};

export function PointsMotivationSection({ isAdmin, admin, member }: Props) {
  return (
    <section id="puan-motivasyon" className="space-y-4 scroll-mt-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink flex items-center gap-2">
            <Sparkles size={16} className="text-brand" />
            Puan &amp; Motivasyon
          </h2>
          <p className="text-sm text-muted mt-0.5">
            {isAdmin
              ? "Ekip katkısı ve puan hareketleri. Puan yalnızca yönetici onayından sonra kesinleşir."
              : "Kişisel katkı özetiniz. Puan yalnızca yönetici onayından sonra kesinleşir."}
          </p>
        </div>
        {isAdmin && <RepairPointsButton />}
      </div>

      {isAdmin && admin ? (
        <AdminPanel admin={admin} />
      ) : (
        <MemberPanel member={member} />
      )}
    </section>
  );
}

// --- Member: only their own figures. No ranking, no other members' data. ---
function MemberPanel({ member }: { member: MemberPointsSummary }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Tile icon={<Sparkles size={15} />} label="Bu ay kazandığım" value={`${member.monthPoints} puan`} tone="brand" />
      <div title="Görev yönetici tarafından tamamlandığında kesinleşir.">
        <Tile icon={<Clock3 size={15} />} label="Onay bekleyen puanım" value={`${member.pending} puan`} tone="warning" />
      </div>
      <Tile icon={<CheckCircle2 size={15} />} label="Tamamladığım işler" value={member.doneCount} tone="success" />
      <Tile icon={<ClipboardCheck size={15} />} label="Kontrol bekleyen işlerim" value={member.reviewCount} />
    </div>
  );
}

// --- Admin: full workspace visibility. ---
function AdminPanel({ admin }: { admin: AdminPointsData }) {
  const maxContrib = Math.max(1, ...admin.contributors.map((c) => c.earned));
  const maxDept = Math.max(1, ...admin.byDepartment.map((d) => d.points));

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Tile icon={<Sparkles size={15} />} label="Bu ay kazanılan" value={`${admin.monthEarned} puan`} tone="success" />
        <Tile icon={<Clock3 size={15} />} label="Bekleyen toplam" value={`${admin.pendingTotal} puan`} tone="warning" />
        <Tile icon={<RotateCcw size={15} />} label="Geri alınan" value={admin.revokedCount} tone={admin.revokedCount > 0 ? "danger" : "neutral"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Contributors */}
        <div className="bg-surface rounded-xl border border-line shadow-card p-5">
          <h3 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
            <Trophy size={15} className="text-subtle" /> En çok katkı sağlayanlar
          </h3>
          {admin.contributors.length === 0 ? (
            <p className="text-sm text-subtle py-6 text-center">Bu ay henüz puan hareketi yok</p>
          ) : (
            <div className="space-y-3">
              {admin.contributors.slice(0, 8).map((c) => (
                <div key={c.userId}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs text-ink truncate" title={c.name}>{c.name}</span>
                    <span className="flex items-center gap-1.5 shrink-0 text-xs">
                      {c.pending > 0 && (
                        <span className="text-[10px] font-medium text-warning bg-[#fbeede] rounded-full px-1.5 py-0.5">
                          {c.pending} bekleyen
                        </span>
                      )}
                      <span className="font-semibold text-muted tabular-nums">{c.earned}</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${Math.max(4, (Math.max(0, c.earned) / maxContrib) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By department */}
        <div className="bg-surface rounded-xl border border-line shadow-card p-5">
          <h3 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
            <Building2 size={15} className="text-subtle" /> Departmana göre puan
          </h3>
          {admin.byDepartment.length === 0 ? (
            <p className="text-sm text-subtle py-6 text-center">Bu ay departman bazlı puan yok</p>
          ) : (
            <div className="space-y-3">
              {admin.byDepartment.map((d) => (
                <div key={d.name}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs text-ink truncate" title={d.name}>{d.name}</span>
                    <span className="text-xs font-semibold text-muted tabular-nums">{d.points}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#3a8f63]"
                      style={{ width: `${Math.max(4, (d.points / maxDept) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Ledger */}
      <div className="bg-surface rounded-xl border border-line shadow-card p-5">
        <h3 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
          <ListTree size={15} className="text-subtle" /> Puan hareketleri
        </h3>
        {admin.ledger.length === 0 ? (
          <p className="text-sm text-subtle py-6 text-center">Bu ay puan hareketi yok</p>
        ) : (
          <div className="divide-y divide-hairline">
            {admin.ledger.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate">
                    <span className="font-medium">{row.userName}</span>
                    {row.taskTitle && <span className="text-muted"> · {row.taskTitle}</span>}
                  </p>
                  <p className="text-[11px] text-subtle">
                    {TYPE_LABEL[row.type] ?? row.type} · {formatDateTimeTR(row.createdAt)}
                  </p>
                </div>
                <span className={cn(
                  "text-sm font-semibold tabular-nums shrink-0",
                  row.amount >= 0 ? "text-[#1c7a52]" : "text-danger",
                )}>
                  {row.amount >= 0 ? `+${row.amount}` : row.amount}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
