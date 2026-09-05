"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserCheck, UserPlus, X, Check } from "lucide-react";
import { linkContactToUser, unlinkContactUser } from "@/lib/actions/crm";
import { normalizePersonName } from "@/lib/utils/task-person-match";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SelectInput } from "@/components/ui/Field";
import type { WorkspaceContact } from "@/types";
import type { CrmMember } from "./CrmView";

interface Props {
  contacts: WorkspaceContact[];
  members: CrmMember[];
}

// Suggest a system user for an unlinked contact: exact e-mail first, then a
// normalized full-name match. Contact e-mails and auth e-mails need NOT be the
// same, so this is a hint only — nothing is auto-applied.
function suggestMember(contact: WorkspaceContact, members: CrmMember[]): CrmMember | null {
  const email = contact.email?.trim().toLowerCase();
  if (email) {
    const byEmail = members.find((m) => m.email?.trim().toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  const nameKey = normalizePersonName(contact.name);
  if (nameKey) {
    const byName = members.find((m) => normalizePersonName(m.name) === nameKey);
    if (byName) return byName;
  }
  /* İLK AD ÖNERİSİ.
     Aynı insan iki kayıtta farklı YAZILABİLİYOR: "Aslı Filinta" sistem
     hesabı, "Aslı Hanım" CRM kişisi (Aslı Hanım, 2026-08-24: "Aslı Filinta ve
     Aslı Hanım aynı kişi"). Tam ad eşleşmesi bunları yakalamadığı için panel
     "Eşleşmedi" diyordu ve kimse mükerrer kaydı fark etmiyordu — o kişinin
     işleri panoda iki ayrı karta bölünüyordu.
     Yalnız ilk ad TEK bir üyeye denk geliyorsa önerilir; iki "Ali" varsa
     öneri yapılmaz, seçim kullanıcıya bırakılır. Öneri hiçbir zaman
     kendiliğinden uygulanmaz — yönetici "Eşleştir"e basmalıdır. */
  const firstOf = (n: string) => normalizePersonName(n).split(" ")[0] ?? "";
  const contactFirst = firstOf(contact.name);
  if (contactFirst.length >= 2) {
    const hits = members.filter((m) => firstOf(m.name) === contactFirst);
    if (hits.length === 1) return hits[0];
  }
  return null;
}

function MatchRow({ contact, members }: { contact: WorkspaceContact; members: CrmMember[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const suggestion = useMemo(
    () => (contact.user_id ? null : suggestMember(contact, members)),
    [contact, members],
  );
  const [selected, setSelected] = useState<string>(suggestion?.userId ?? "");

  const linkedMember = contact.user_id ? members.find((m) => m.userId === contact.user_id) : null;

  function doLink(userId: string) {
    if (!userId) return;
    setError(null);
    startTransition(async () => {
      const res = await linkContactToUser(contact.id, userId);
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  }
  function doUnlink() {
    setError(null);
    startTransition(async () => {
      const res = await unlinkContactUser(contact.id);
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 transition-colors duration-150 hover:bg-surface-hover">
      {/* Contact identity */}
      <div className="min-w-[160px] flex-1">
        <div className="truncate text-[13.5px] font-medium text-ink">{contact.name}</div>
        <div className="truncate text-[12px] text-subtle">{contact.email || "e-posta yok"}</div>
      </div>

      {/* Link status + controls. Renkler token'dan: yeşil = bağlı (tamamlanmış
          eşleşme), mavi = öneri (bilgi). Metin her zaman yanında. */}
      {linkedMember ? (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Badge className="bg-success/10 text-success">
            <UserCheck size={13} aria-hidden />
            Sistem hesabı: {linkedMember.name}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={doUnlink}
            disabled={isPending}
            className="hover:bg-danger/10 hover:text-danger"
          >
            <X size={13} aria-hidden /> Eşleşmeyi kaldır
          </Button>
        </div>
      ) : (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {suggestion ? (
            <Badge className="bg-info/10 text-info">Öneri: {suggestion.name}</Badge>
          ) : (
            <Badge className="bg-surface-sunken text-subtle">Eşleşmedi</Badge>
          )}
          <SelectInput
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            aria-label={`${contact.name} için sistem hesabı`}
            className="min-w-[160px] text-[12.5px] text-muted sm:w-auto"
          >
            <option value="">Sistem hesabı seç…</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>{m.name}</option>
            ))}
          </SelectInput>
          {/* Satır başına bir "Eşleştir" — ekranın ana eylemi bu panelde satır
              düzeyinde yaşar; seçim yokken nötr kapalı durur. */}
          <Button variant="secondary" size="sm" onClick={() => doLink(selected)} disabled={isPending || !selected}>
            <Check size={13} aria-hidden /> Eşleştir
          </Button>
        </div>
      )}

      {error && <p role="alert" className="anim-fade-down w-full text-[12px] text-danger">{error}</p>}
    </div>
  );
}

/**
 * Admin-only panel to confirm which CRM contact is which system user. Manual
 * links only (with suggestions). Once linked, the task deep-link matcher counts
 * the member's assignee tasks toward this contact too.
 */
export function ContactMatchingPanel({ contacts, members }: Props) {
  const unlinked = contacts.filter((c) => !c.user_id).length;

  return (
    <div className="anim-fade-up mb-4 overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="flex items-center gap-2 border-b border-hairline bg-surface-muted px-4 py-2.5">
        <UserPlus size={15} className="text-brand" aria-hidden />
        <h2 className="text-[13.5px] font-semibold tracking-tight text-ink">Kişi eşleştirme</h2>
        {/* Listeyi tarif eden sayı: kaç kayıt bağlı. */}
        <span className="text-[12px] tabular-nums text-subtle">
          {contacts.length - unlinked}/{contacts.length} eşleşti
        </span>
      </div>
      <p className="px-4 pt-2.5 text-[12.5px] leading-relaxed text-muted">
        CRM kişilerini sistem kullanıcılarıyla eşleştirin. E-posta ve isim yalnız öneri içindir;
        eşleşme el ile onaylanır.
      </p>
      <div className="mt-1 max-h-[420px] divide-y divide-hairline overflow-y-auto">
        {contacts.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-subtle">Kayıtlı kişi yok.</p>
        ) : (
          contacts.map((c) => <MatchRow key={c.id} contact={c} members={members} />)
        )}
      </div>
    </div>
  );
}
