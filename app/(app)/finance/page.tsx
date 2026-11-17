import { redirect } from "next/navigation";

/**
 * FINANCE KALDIRILDI (Sıraç, 17–18.11.2026: "Finance kısmı gereksiz, boşa
 * düştü… bu hâlen var"). Ayrı bir ödeme ekranı ikinci bir doğruydu; ödemeler
 * Collection → Payment Table'da izleniyor. Eski adres (yer imi, bildirim)
 * boşa düşmesin diye oraya yönlenir.
 *
 * VERİ SİLİNMEDİ: `finance_payments` tablosu, RLS'i ve yedekteki yeri durur
 * (lib/backup/collect.ts). Eski ekranın bileşeni ve eylemleri silindi
 * (18.11.2026); git geçmişinde durur.
 */
export default function FinancePage() {
  redirect("/collection/odeme");
}
