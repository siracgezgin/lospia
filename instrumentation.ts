/**
 * Sunucu açılışında BİR KEZ çalışır (Next.js `instrumentation` sözleşmesi).
 *
 * Şimdilik tek işi var: zod'un hata mesajlarını Türkçeye almak. Sunucu
 * aksiyonlarının ortak bir girişi yok — kırk ayrı dosya kendi şemasını
 * doğruluyor ve hatayı `error.issues[0].message` ile olduğu gibi ekrana
 * veriyor. Ayarı burada yapmak, o dosyaların hiçbirine dokunmadan hepsini
 * kapsar (bkz. lib/utils/zod-tr.ts).
 *
 * `await import`: modül yalnız sunucu çalışma zamanında yüklensin; Edge
 * derlemesine gereksiz bir bağımlılık girmesin.
 */
export async function register() {
  await import("@/lib/utils/zod-tr");
}
