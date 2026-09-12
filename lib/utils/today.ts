const TZ = "Europe/Istanbul";

/**
 * "Bugün" — İSTANBUL takvim günü, "YYYY-MM-DD".
 *
 * NEDEN `new Date().toISOString().slice(0,10)` DEĞİL: o ifade SUNUCUNUN
 * saatini kullanır. Vercel UTC'de çalıştığı için 00:00–03:00 arasında bir
 * önceki günü döndürür; "bugün teslim" işler GECİKMİŞ görünürdü. Aynı ifade
 * bir istemci bileşeninde kullanıldığında sunucu (UTC) ile tarayıcı (yerel)
 * farklı gün üretiyor ve React hydration uyuşmazlığı çıkıyordu.
 *
 * Intl `timeZone` verildiğinde her iki tarafta AYNI sonucu verir — bu yüzden
 * hem sunucu sayfaları hem istemci tabloları bu tek kaynaktan okur.
 *
 * NEDEN lib/utils ALTINDA: eskiden `components/dashboard/today.ts` idi ve
 * yalnız Raporlar ekranı kullanıyordu. Oysa aynı hata "Gecikti" rozetini
 * çizen `getCardState`, Liste ekranı, Pano sıralaması ve CRM takibi dâhil
 * ALTI yerde daha duruyordu (2026-09-12 denetimi). Doğru cevabın bir modülün
 * içinde saklı kalması, o cevabın yayılmamasının sebebiydi.
 */
export function istanbulTodayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
}

/**
 * "YYYY-MM-DD" + n gün → "YYYY-MM-DD".
 *
 * Hesap TAMAMEN string/UTC uzayında yapılır (`Date.UTC` + `toISOString`), yani
 * çalıştığı makinenin saat diliminden bağımsızdır. Eski kod şöyleydi:
 *
 *     const soon = new Date(today + "T00:00:00");   // YEREL gece yarısı
 *     soon.setDate(soon.getDate() + 3);
 *     soon.toISOString().slice(0, 10)               // UTC'ye çevrilir
 *
 * İstanbul UTC+3 olduğu için yerel gece yarısı UTC'de bir ÖNCEKİ günün 21:00'i
 * eder; `slice` bir gün geri veriyordu. Sonuç: "yaklaşan" penceresi üç gün
 * yerine iki gün çalışıyordu. Gün aritmetiğini tarih nesnesiyle yapmak yerine
 * UTC'de yapmak bu sınıf hatayı tümüyle kapatır.
 */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
