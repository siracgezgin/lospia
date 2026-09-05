import { redirect } from "next/navigation";
import { redirectToSignIn } from "@/lib/auth/session-redirect";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { ModuleDirectory } from "@/components/modules/ModuleDirectory";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operation Modules" };

/**
 * Operation Modules — sistemin DİZİNİ.
 *
 * Sıraç (2026-08-29): "Operasyon modülü kısmında çoğu başlık aynı linklere
 * farklı bir alt başlıkla gidiyor… ben neyin nerede olduğunun belli olmasını
 * istiyorum."
 *
 * İki kusur vardı ve ikisi de elle seçilmiş kart listesinden geliyordu:
 *   • BÖLÜM DİLİ AYRIŞMIŞTI. Sol menü "Core Operations · Product & Office ·
 *     Admin" derken bu sayfa "Çekirdek Operasyon · AF Teamwork · Yönetim"
 *     diyordu. Aynı yapı, iki ayrı isim — "her şey her yerde" hissinin
 *     birebir kaynağı.
 *   • DİZİN EKSİKTİ. Board, List, Reports, Admin Board, Product Data ve
 *     Payment Table registry'de kayıtlıydı ama burada hiç çizilmiyordu; "ne
 *     nerede" sorusunun cevabı olduğunu iddia eden sayfa yarım listeydi.
 *
 * Artık kartlar doğrudan MODULE_DIRECTORY'den, bölüm adları
 * MODULE_GROUP_TITLES'tan geliyor. Sol menü ile bu sayfa AYNI kaynaktan
 * beslendiği için ayrışmaları imkânsız: menü sık kullanılanı taşır, burası
 * hepsini listeler.
 *
 * Listenin kendisi (süzgeç + kartlar) ModuleDirectory'de yaşar; sunucu yalnız
 * yetkiyi çözer. Sayaç yok (Aslı Hanım, 2026-08-24: "boş hesap istemiyorum")
 * — sayfa hiç sayım sorgusu atmaz.
 */
export default async function ModulesPage() {
  // Herkes görür; yalnız Yönetim bölümü yöneticiye çıkar (veri düzeyinde de kapalı).
  const { workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirectToSignIn();
  if (gate !== "ok" || !workspaceId) return <AccessDenied />;

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      <ModulePageHeader title="Operation Modules" />

      {/* Tek satırlık yön tarifi: menü ile bu sayfanın işi FARKLI. */}
      <p className="mb-5 text-[13.5px] text-muted">
        Sol menü her gün açtığınız ekranları taşır; burası sistemdeki her ekranın listesidir.
        Bir ekran sistemde tek isimle yaşar — buradaki ad, menüdeki ad ve sayfanın başlığı hep aynıdır.
      </p>

      <ModuleDirectory isAdmin={isAdmin} />
    </div>
  );
}
