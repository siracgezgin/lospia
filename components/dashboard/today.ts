/**
 * Bu dosya artık TEK KAYNAK DEĞİL — `lib/utils/today.ts` öyle.
 *
 * "Bugün"ü İstanbul gününden okuma kuralı burada doğmuştu ama bir bileşen
 * klasöründe saklı kaldığı için yayılamadı: aynı hata `getCardState`
 * ("Gecikti" rozeti), Liste ekranı, Pano sıralaması, CRM takibi ve görev
 * oluşturma varsayılanında duruyordu (2026-09-12 denetimi). Kural paylaşılan
 * yere taşındı; buradaki dışa aktarım eski çağrı yerleri kırılmasın diye
 * duruyor. YENİ KODDA doğrudan `@/lib/utils/today` içe aktar.
 */
export { istanbulTodayISO } from "@/lib/utils/today";
