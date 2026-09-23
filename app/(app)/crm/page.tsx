
import { redirectToSignIn } from "@/lib/auth/session-redirect";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { CrmView } from "@/components/crm/CrmView";
import { CrmCategoryGrid } from "@/components/crm/CrmCategoryGrid";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { crmCategoryOfSegment, FIHRIST_ID_PREFIX } from "@/lib/crm/constants";
import { Contact } from "lucide-react";
import { contactDescriptor, taskMatchesPerson, type PersonMatchTask } from "@/lib/utils/task-person-match";
import { maybeDatabaseSetupRequired } from "@/lib/utils/supabase-errors";
import type { WorkspaceContact, Profile } from "@/types";

export const dynamic = "force-dynamic";
// Sekme adı uygulama çubuğuyla aynı (PAGE_TITLES ↔ registry).
export const metadata = { title: "CRM" };

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{ segment?: string; k?: string }>;
}) {
  const params = await searchParams;
  const initialSegment = typeof params.segment === "string" ? params.segment : "";
  /* `?k=` AÇIK KUTUdur. Yokken CRM kutucuk ızgarasıyla açılır — Aslı Hanım
     (2026-09-07): "Bu CRM'e böyle giremezsin. Bak her girdiğin dosya böyle
     başlamalı… yani şimdi burada girersen böyle direkt sen dosyaya giriyorsun."
     Eski `?segment=` bağlantıları KIRILMAZ: segment hangi kutuya düşüyorsa o
     kutu açılır ve liste doğrudan gelir. */
  const categoryKey =
    typeof params.k === "string" && params.k
      ? params.k
      : initialSegment
        ? crmCategoryOfSegment(initialSegment).key
        : null;

  // Herkes görür, yönetici düzenler — CrmView isAdmin=false iken tüm yazma
  // aksiyonlarını gizler; RLS zaten üye okumasına izin veriyor.
  const { supabase, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirectToSignIn();
  if (gate !== "ok" || !workspaceId) return <AccessDenied />;

  const [contactsResult, membersResult, tasksResult, probeResult, fihristResult] = await Promise.all([
    // Base contacts always load with select("*") — resilient even when the CRM
    // migration hasn't been applied yet (missing columns are simply absent).
    supabase
      .from("workspace_contacts")
      .select("*")
      /* YALNIZ DIŞ İLİŞKİLER. Aslı Hanım (2026-08-24): "CRM'de neden sistemde
         kayıtlı çalışanlar var? Bu kısımda bir mantık hatası var gibi."
         workspace_contacts iki iş birden yapıyordu (atanabilir ekip + CRM
         ilişkisi); artık `kind` ayırıyor. Ekip kayıtları Pano'da atanabilir
         kalır ama müşteri listesinde görünmez. */
      .eq("kind", "external")
      .eq("workspace_id", workspaceId)
      .order("name"),
    /* avatar_url da alınır: sistem hesabıyla EŞLEŞTİRİLMİŞ bir CRM kişisi
       listede o kişinin fotoğrafıyla görünsün — aynı insan her ekranda aynı
       görünür (PersonAvatar tek kaynak). */
    supabase
      .from("workspace_members")
      .select("user_id, role, profiles(id, full_name, email, avatar_url)")
      .eq("workspace_id", workspaceId),
    // Fields needed to relate a task to a contact (same logic + scope the List
    // filter uses — non-deleted, non-archived — so the "X görev" count and the
    // list you land on agree).
    supabase
      .from("tasks")
      .select("responsible_contact_id, assignee_id, custom_fields")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .neq("status", "archived"),
    // Probe the additive CRM columns. If the Phase 1 migration hasn't been
    // applied yet this errors with PGRST204/42703 → we render a setup banner and
    // disable migration-dependent actions instead of leaking a raw error.
    supabase
      .from("workspace_contacts")
      .select("id, crm_status, segment, user_id")
      .eq("workspace_id", workspaceId)
      .limit(1),
    /* FİHRİST CRM'İN İÇİNDE. Sıraç (23.09.2026): "Nakışçı, üretici… direkt o
       sekmede ekle butonuna basıp ekleyebilelim, sonra onlar CRM'e
       kaydedilsin. Aradaki ilişki entegrasyonu iyi kur."

       CRM'de zaten "Outsource" segmenti vardı ama üretici/kalıpçı/nakışçı
       kayıtları başka bir tabloda (`workspace_manufacturers`) duruyordu; CRM'e
       bakan onları hiç göremiyordu. İki tabloya İKİ KOPYA yazmak yerine —
       kopyalar zamanla birbirinden ayrışırdı — fihrist burada OKUNUYOR ve
       listeye katılıyor. Kayıt tek yerde kalır, düzenleme Fihrist'te yapılır.

       Tablo migrate edilmemişse hata yutulur, CRM eskisi gibi çalışır. */
    supabase
      .from("workspace_manufacturers")
      .select("id, name, role, phone, email, city, notes, is_active, address")
      .eq("workspace_id", workspaceId)
      .order("name"),
  ]);

  const setup = maybeDatabaseSetupRequired(probeResult.error);

  const baseContacts = (contactsResult.data ?? []) as WorkspaceContact[];

  /* Fihrist satırları CRM kişisi KILIĞINDA. `id` öneki bilerek konuluyor:
     CrmView bu satırların düzenleme/silme düğmelerini kapatıp Fihrist'e
     yönlendiriyor — yanlışlıkla CRM'den silinip üretimdeki bağların kopması
     mümkün olmasın. Segment "outsource": Aslı Hanım'ın CRM'i sayarken
     kullandığı başlık (2026-09-07). */
  type FihristRow = {
    id: string; name: string; role: string | null; phone: string | null;
    email: string | null; city: string | null; notes: string | null;
    is_active: boolean | null; address: string | null;
  };
  const ROLE_TR: Record<string, string> = {
    uretici: "Üretici", kalipci: "Kalıpçı", nakisci: "Nakışçı",
    kumasci: "Kumaşçı", aksesuarci: "Aksesuarcı", diger: "Diğer",
  };
  const fihristContacts: WorkspaceContact[] = ((fihristResult.data ?? []) as FihristRow[])
    .filter((m) => m.is_active !== false)
    .map((m) => ({
      id: `${FIHRIST_ID_PREFIX}${m.id}`,
      workspace_id: workspaceId,
      name: m.name,
      email: m.email,
      phone: m.phone,
      organization: [m.city, m.address].filter(Boolean).join(" · ") || null,
      role_label: ROLE_TR[m.role ?? "uretici"] ?? "Üretici",
      segment: "outsource",
      notes: m.notes,
    }) as unknown as WorkspaceContact);

  const contacts = [...baseContacts, ...fihristContacts];

  type ProfileLite = Pick<Profile, "id" | "full_name" | "email" | "avatar_url">;
  type MemberRow = { user_id: string; role: string; profiles: ProfileLite | ProfileLite[] | null };
  const members = ((membersResult.data ?? []) as unknown as MemberRow[]).map((m) => {
    const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return {
      userId: m.user_id,
      name: prof?.full_name ?? prof?.email ?? "—",
      email: prof?.email ?? null,
      photoUrl: prof?.avatar_url ?? null,
    };
  });

  // İlgili görev sayısı — count with the shared matcher so the number matches
  // exactly what /list?person=<contactId> will display.
  const tasks = (tasksResult.data ?? []) as PersonMatchTask[];
  /* FİHRİST SATIRI SAYILMAZ. Sayı hesaplanınca hücrede "Görevleri aç"
     bağlantısı çıkıyordu; bağlantı `/list?person=fihrist:<id>`e gidiyor ve
     liste o kimliği HİÇBİR kayıtla eşleştiremiyordu (usta `workspace_contacts`
     tablosunda yok) — kullanıcı her seferinde boş bir listede kalıyordu.
     Ölü bağlantı yerine hücre boş kalır. */
  const descriptors = contacts
    .filter((c) => !c.id.startsWith(FIHRIST_ID_PREFIX))
    .map((c) => ({ id: c.id, d: contactDescriptor(c) }));
  const taskCounts: Record<string, number> = {};
  for (const { id, d } of descriptors) {
    let n = 0;
    for (const t of tasks) if (taskMatchesPerson(t, d)) n++;
    if (n > 0) taskCounts[id] = n;
  }

  /* GİRİŞ = KUTULAR. Kutu seçilmemişse tablo hiç çizilmez; kurulum uyarısı
     gerekiyorsa o da burada, kutuların üstünde durur. */
  if (!categoryKey) {
    return (
      <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
        <ModulePageHeader title="CRM" icon={Contact} />
        <CrmCategoryGrid contacts={contacts} />
      </div>
    );
  }

  return (
    <CrmView
      contacts={contacts}
      members={members}
      taskCounts={taskCounts}
      isAdmin={isAdmin}
      initialSegment={initialSegment}
      categoryKey={categoryKey}
      setupRequired={setup.setupRequired}
      setupMessage={setup.message}
      setupTechnicalDetail={setup.technicalDetail}
    />
  );
}
