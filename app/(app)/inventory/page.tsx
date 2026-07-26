import { redirect } from "next/navigation";

// Stok/kumaş görünürlüğü bugün Koleksiyon & Üretim föylerinde yaşıyor;
// ayrı bir stok vitrini yok. Gerçek stok hareketi modülü veri ihtiyacı
// doğduğunda açılır (isim-only modül bırakmama kararı).
export default function InventoryPage() {
  redirect("/collection");
}
