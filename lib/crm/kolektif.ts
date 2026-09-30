import { z } from "zod";

/**
 * KOLEKTİF BAŞVURUSU → CRM — 2026-09-28.
 *
 * Aslı Hanım: "Operasyon dosyasında kolektif diye bir CRM yapıp oraya bunun
 * database'inin girmesi gerekiyor. Adı, soyadı, bütün aldığımız bilgiler
 * şeklinde."
 *
 * Başvurular Filinta Metodolojisi'nin kolektif formundan gelir
 * (fm.aslifilinta.com/kolektif). Form kaydı açtığı anda bu uygulamanın
 * /api/kolektif-basvuru ucuna imzalı bir istek atar; uç nokta kişiyi CRM'in
 * "Kolektif" kutusuna ekler. Başvurunun bütün yanıtları kişinin `metadata`
 * alanında `kolektif` anahtarı altında durur ve CRM satırının altında açılır.
 *
 * Bu dosya o verinin TEK tanımıdır: uç nokta gelen isteği bununla doğrular,
 * ekran kayıttaki veriyi bununla okur. Doğum tarihi bu veriye HİÇ girmez —
 * Filinta tarafında gizli katmanda kalır.
 */

export const KOLEKTIF_SEGMENTLERI = [
  "kolektif_tasarim",
  "kolektif_zanaat",
  "kolektif_uretim",
  "kolektif_marka",
  "kolektif_kamu",
] as const;

const metin = (en: number) => z.string().trim().max(en);
const bosOlabilir = (en: number) => metin(en).nullish().transform((v) => (v ? v : null));

const soruSemasi = z.object({ soru: metin(600), yanit: metin(4000) });
const bolumSemasi = z.object({ baslik: bosOlabilir(200), sorular: z.array(soruSemasi).max(60) });
const liste = z.array(metin(400)).max(10);

/** Filinta'dan gelen isteğin gövdesi. */
export const kolektifIstekSemasi = z.object({
  /* Gevşek kalıp — lib/actions/crm.ts'teki hexUuid ile aynı gerekçe: zod 4'ün
     uuid() doğrulaması RFC sürüm bitlerini de arıyor. */
  fm_basvuru_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  kayit_no: metin(20),
  /** İsteğin atıldığı an — eski bir isteğin yeniden oynatılmasına karşı. */
  gonderildi: z.string().datetime({ offset: true }),
  segment: z.enum(KOLEKTIF_SEGMENTLERI),
  kategori: metin(120),
  ad_soyad: metin(200).min(1),
  eposta: z.string().trim().email().max(320),
  telefon: bosOlabilir(60),
  il: bosOlabilir(80),
  ilce: bosOlabilir(80),
  kurum: bosOlabilir(200),
  rol: bosOlabilir(100),
  instagram: bosOlabilir(200),
  web: bosOlabilir(300),
  bolumler: z.array(bolumSemasi).max(10),
  gelenekler: liste,
  konular: liste,
  katki: liste,
  /* YALNIZ http/https. Zod'un `url()` doğrulaması `new URL()` kullanıyor ve
     `javascript:` ile `data:` şemalarını GEÇERLİ sayıyor (ölçüldü). Bu değer
     CRM'de bir `href`e dönüşüyor ve yöneticinin tarayıcısında operasyon alan
     adının oturumuyla açılıyor — şema kısıtlanmazsa saklanmış XSS olurdu.
     İstek imzalı geliyor, yani sömürmek için sır gerekir; ama o sır iki ayrı
     projenin ortamında duruyor ve bu satır bedava bir emniyet. */
  panel_url: z.string().url().max(500)
    .refine((u) => { try { return /^https?:$/.test(new URL(u).protocol); } catch { return false; } },
      "Bağlantı yalnız http/https olabilir.")
    .nullish().transform((v) => v ?? null),
});

export type KolektifIstek = z.infer<typeof kolektifIstekSemasi>;

/** Kişinin `metadata.kolektif` alanında duran hâli. */
export const kolektifKayitSemasi = kolektifIstekSemasi
  .omit({ gonderildi: true, ad_soyad: true, eposta: true, telefon: true })
  .extend({ alindi: z.string() });

export type KolektifKayit = z.infer<typeof kolektifKayitSemasi>;

/** Kişi kaydının metadata'sından başvuruyu okur; yoksa ya da bozuksa null. */
export function kolektifKaydi(metadata: unknown): KolektifKayit | null {
  if (!metadata || typeof metadata !== "object") return null;
  const k = (metadata as Record<string, unknown>).kolektif;
  if (!k) return null;
  const r = kolektifKayitSemasi.safeParse(k);
  return r.success ? r.data : null;
}
