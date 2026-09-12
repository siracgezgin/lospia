/**
 * TAKVİM HÜCRESİNİN ETKİLEŞİM DİLİ — üç görünüm için tek tanım.
 *
 * Sıraç (2026-09-12): "Calendar'da her kutucuğun üzerine gelince Excel gibi
 * etrafı çerçeve olsun, hoverlama vs. estetik bir görünüm kazandır siteye."
 *
 * NE VARDI: üç görünüm üç ayrı şey yapıyordu.
 *   • Hafta ızgarası — %4'lük bir mürekkep perdesi (`after:bg-ink/[0.04]`).
 *     Kategori rengini bozmuyordu ama neredeyse görünmüyordu; hangi hücrenin
 *     üstünde olduğunuz belli olmuyordu.
 *   • Ay ızgarası — `hover:bg-surface-hover`. Renkli günlerde hiç etkisi yok,
 *     çünkü hücrenin kendi zemini zaten var.
 *   • Yıl görünümü — yine `hover:bg-surface-hover`.
 *
 * NEDEN ÇERÇEVE DOĞRU ÇÖZÜM: bu bir ızgara. Elektronik tabloda hücre sınırı
 * zaten gözün takip ettiği şeydir; imleç nerede olursa olsun o sınırın
 * belirginleşmesi "buradayım" der. Dolgu ise hücrenin KENDİ rengiyle yarışır —
 * takvimde her hücre bir kategori rengi taşıyabildiği için dolguyla sinyal
 * vermek en renkli hücrelerde tümüyle kayboluyordu.
 *
 * ÜÇ AĞIRLIK, ÜÇ ANLAM — birbirine karışmasın diye kalınlıkla ayrılır:
 *   hover        → 1px iç çerçeve (brand-ring, yarı saydam) + çok hafif perde
 *   sürükle-hedef→ 2px dolu iç çerçeve (mevcut davranış, hücrede yazılı)
 *   odak         → globals.css'teki tek odak halkası (2px dış, offset'li)
 *
 * `ring-inset` ŞART: dış halka komşu hücrenin üstüne taşar ve ızgarada
 * kayma hissi yaratır. İçeride kalan çerçeve hücrenin kendi sınırını çizer.
 */

/** Tıklanabilir takvim hücresi — hover'da Excel benzeri iç çerçeve. */
export const CELL_INTERACTIVE =
  "cursor-pointer transition-[box-shadow,background-color] duration-150 ease-standard " +
  "hover:ring-1 hover:ring-inset hover:ring-brand-ring/60 " +
  /* Perde ÇOK hafif: çerçeve zaten sinyali taşıyor, dolgu yalnız hücreyi bir
     tık öne çıkarır. Kategori rengini ezmemesi için mürekkep, beyaz değil. */
  "hover:bg-ink/[0.025]";

/** Sürükleme hedefi — hover'dan KALIN, karışmasın. */
export const CELL_DROP_TARGET = "ring-2 ring-inset ring-brand-ring";

/**
 * ŞERİT BAŞLIĞI (gün görünümü) — ızgara DEĞİL, dikey liste.
 *
 * Buraya iç çerçeve KONMADI: gün görünümü kartların alt alta dizildiği bir
 * liste, hücre ızgarası değil. Her satırı çerçevelemek ızgaradaki "sınırı
 * belirginleştir" faydasını vermez, yalnız gürültü üretir. Şerit başlığı
 * kategori rengini taşıdığı için zemini boyamak da olmaz — ince mürekkep
 * perdesi burada doğru araç.
 */
export const STRIP_INTERACTIVE =
  "relative after:pointer-events-none after:absolute after:inset-0 after:bg-ink/[0.04] " +
  "after:opacity-0 after:transition-opacity after:duration-150 " +
  "hover:after:opacity-100 active:after:opacity-100";
