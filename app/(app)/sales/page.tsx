import { redirect } from "next/navigation";

// Satış/konsinye ilişkileri bugün CRM'de yaşıyor; ayrı bir satış vitrini yok.
// Satış hareketi modülü veri ihtiyacı doğduğunda açılır (isim-only modül
// bırakmama kararı).
export default function SalesPage() {
  redirect("/crm");
}
