import { redirect } from "next/navigation";

// Üretim Föyü listesi artık Koleksiyon altında (kategori tarayıcısı). Eski
// /production linkleri buraya düşerse Koleksiyona yönlendir. Föy düzenleyici
// /production/[id] ve /production/new olduğu yerde kalır.
export default function ProductionIndexRedirect() {
  redirect("/collection");
}
