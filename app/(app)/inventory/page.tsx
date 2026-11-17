import { redirect } from "next/navigation";

// Eski adres — stok artık kendi modülünde (20240373).
export default function InventoryPage() {
  redirect("/stock");
}
