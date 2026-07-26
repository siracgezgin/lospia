import { redirect } from "next/navigation";

// Raporlama yüzeyi Gösterge Paneli'dir — ayrı bir "Raporlar" vitrini yok.
// (İsim-only modül bırakmama kararı; bkz. Operasyon Modülleri sadeleştirmesi.)
export default function ReportsPage() {
  redirect("/dashboard");
}
