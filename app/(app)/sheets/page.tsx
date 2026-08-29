import { redirect } from "next/navigation";

/**
 * /sheets — AF Teamwork'e yönlendirir.
 *
 * Sıraç (2026-08-29): "Mantık Drive'daki gibi olsun." Tablolar artık
 * klasörlerin içinde yaşıyor (20240329); ayrı bir "bütün tablolar" listesi
 * aynı içeriği ikinci bir yerden gösterip "birine basıyorum klasör, diğerine
 * basıyorum tablo çıkıyor" karmaşasını üretiyordu.
 *
 * Tablo EDİTÖRÜ duruyor: /sheets/[id]. Yalnız bu liste ekranı kalktı.
 */
export default function SheetsIndexRedirect() {
  redirect("/documents");
}
