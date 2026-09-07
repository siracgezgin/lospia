import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { openManufacturerPortal } from "@/lib/actions/manufacturer-portal";
import { ManufacturerPortal } from "@/components/production/ManufacturerPortal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Üretim Föyü",
  // Dış bağlantı ARANMASIN: adres gizli anahtar taşıyor.
  robots: { index: false, follow: false },
};

/**
 * ÜRETİCİ PANELİ — oturum GEREKTİRMEYEN tek ekran.
 *
 * Aslı Hanım (2026-09-07): "Sabri Bey bizim üreticimiz olacağı için üreticiye
 * de bir panel verebilirsin. Çünkü ÜRÜNÜN DETAYLARINI GİRİP buradan alabilir."
 *
 * Sayfa (app) grubunun DIŞINDA: uygulama kabuğu (sol menü, üst çubuk, bildirim)
 * burada yoktur — dışarıdan gelen kişi bir "sistem" değil, bir FÖY görür.
 * Erişim adresteki token'a bağlıdır; veri SECURITY DEFINER fonksiyondan gelir,
 * yani geçersiz/iptal/süresi dolmuş bağlantı hiçbir satır döndürmez.
 */
export default async function ManufacturerPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await openManufacturerPortal(token);

  if (!data.ok) {
    const message =
      data.reason === "revoked"
        ? "Bu bağlantı kapatılmış."
        : data.reason === "expired"
          ? "Bu bağlantının süresi dolmuş."
          : data.reason === "setup"
            ? "Üretici paneli henüz açılmadı."
            : "Bağlantı geçersiz.";
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-6 text-center">
        <AlertTriangle size={28} className="mb-3 text-warning" aria-hidden />
        <h1 className="text-lg font-semibold tracking-tight text-ink">{message}</h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
          Föyü görüntülemek için sizinle paylaşılan yeni bir bağlantı isteyin.
        </p>
      </main>
    );
  }

  return <ManufacturerPortal token={token} data={data} />;
}
