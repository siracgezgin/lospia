import { redirect } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { getModuleEntry } from "@/lib/modules/registry";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { OfficeCenterCard } from "@/components/modules/OfficeCenterCard";

export const dynamic = "force-dynamic";

/** Registry kaydını hub kartına çevirir — isim/ikon TEK kaynaktan. */
function hubCard(key: string) {
  const m = getModuleEntry(key);
  return (
    <OfficeCenterCard
      key={m.key}
      title={m.title}
      description={m.description}
      href={m.href}
      icon={m.icon}
    />
  );
}

function SectionHeading({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-subtle">{title}</h2>
      {note && <p className="mt-1 text-[13px] text-muted">{note}</p>}
    </div>
  );
}

export const metadata = { title: "Operation Modules" };

/**
 * Operation Modules — "ne nerede" dizini.
 *
 * Her kartın köşesinde canlı bir sayaç çipi vardı ("3 föy", "12 kayıt",
 * "5 üye") ve sayfa bunun için 11 sayım sorgusu atıyordu. Aslı Hanım
 * (2026-08-24): "Boş hesap istemiyorum… Mühendis gibi hissetmek istemiyorum."
 * Rakamlar kalktı; hub bir DİZİN, bir gösterge paneli değil. Sayfa artık hiç
 * sayım sorgusu atmıyor — 11 round-trip eksildi.
 *
 * Tablosu henüz migrate edilmemiş modüller sessizce listelenir; hedef sayfanın
 * kendi kurulum uyarısı zaten devrede.
 */
export default async function ModulesPage() {
  // Herkes görür ("ekip olarak herkes her şeyi görebilmeli") — yalnız Yönetim
  // bölümü ve Finans kartı yönetici-only kalır (veri düzeyinde de kapalılar).
  const { workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirect("/login");
  if (gate !== "ok" || !workspaceId) return <AccessDenied />;

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      {/* Page header */}
      <ModulePageHeader
        title="Operation Modules"
        description="Tüm modüllerin genel bakışı — her ekran sistemde TEK isimle yaşar; buradaki kartlar sol menüyle aynı adı taşır."
        icon={LayoutGrid}
        badge={isAdmin ? "Yönetici düzenler" : "Görüntüleme"}
      />

      {/* Çekirdek Operasyon — haftalık ritim + ürün. */}
      <SectionHeading title="Çekirdek Operasyon" />
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {hubCard("planning")}
        {hubCard("collection")}
        {hubCard("maliyet")}
        {hubCard("crm")}
      </div>

      {/* Ofis Merkezi — Word/Excel ihtiyacının sistemdeki karşılığı. */}
      <SectionHeading
        title="Ofis Merkezi"
        note="Doküman & tablolar — Word/Excel ile yürüyen operasyon işlerinin sistemdeki karşılığı."
      />
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {hubCard("documents")}
        {hubCard("templates")}
        {hubCard("sheets")}
        {hubCard("creative")}
      </div>

      {/* Yönetim — yalnız yönetici: para akışı + denetim + düzen. */}
      {isAdmin && (
        <>
          <SectionHeading
            title="Yönetim"
            note="Yalnız yönetici — ödemeler, hareket kaydı, arşiv/çöp ve çalışma alanı ayarları."
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {hubCard("finance")}
            {hubCard("activity")}
            {hubCard("archive")}
            {hubCard("trash")}
            {hubCard("settings")}
          </div>
        </>
      )}
    </div>
  );
}
