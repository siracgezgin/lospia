const TZ = "Europe/Istanbul";

/**
 * "Bugün" — İstanbul takvim günü, "YYYY-MM-DD".
 *
 * NEDEN `new Date().toISOString().slice(0,10)` DEĞİL: o ifade SUNUCUNUN
 * saatini kullanır. Vercel UTC'de çalıştığı için 00:00–03:00 arasında bir
 * önceki günü döndürür; "bugün teslim" işleri gecikmiş görünürdü. Aynı ifade
 * bir istemci bileşeninde kullanıldığında sunucu (UTC) ile tarayıcı (yerel)
 * farklı gün üretiyor ve React hydration uyuşmazlığı çıkıyordu.
 *
 * Intl `timeZone` verildiğinde her iki tarafta AYNI sonucu verir — bu yüzden
 * hem sunucu sayfaları hem istemci tabloları bu tek kaynaktan okur.
 */
export function istanbulTodayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
}
