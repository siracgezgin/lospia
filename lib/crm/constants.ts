/**
 * CRM v0 — controlled vocabularies with Turkish labels.
 *
 * Stored values are stable keys (never shown raw to the user); the UI always
 * renders the Turkish label. Segment/status maps are intentionally small — this
 * is lightweight relationship management, not a deal pipeline.
 */

export const CRM_SEGMENTS = [
  { key: "vip", label: "VIP" },
  { key: "wholesale", label: "Toptan" },
  { key: "konsinye", label: "Konsinye" },
  { key: "pr", label: "PR" },
  { key: "influencer", label: "Influencer" },
  { key: "basin", label: "Basın" },
  { key: "stylist", label: "Stylist" },
  { key: "celebrity", label: "Celebrity" },
  { key: "isbirligi", label: "İşbirliği" },
  { key: "tedarikci", label: "Tedarikçi" },
  /* 2026-09-07 — Aslı Hanım CRM'e girince doğrudan dosya listesi çıkmasına
     itiraz etti ve içeriği kendi ağzıyla saydı: "Bunu CRM'e girdiğinde bu
     selebriti, bu basın, bu VIP, bu OUTSOURCE, işte TOPLANTILAR, DIŞ EKİP,
     ÜRETİMLER, EKİBİMİZ… ondan sonra burası atıyorum MODA TASARIMCILAR
     DERNEĞİ." Eksik olan altı anahtar aşağıda; eskiler geri uyum için durur. */
  { key: "outsource", label: "Outsource" },
  { key: "toplanti", label: "Toplantılar" },
  { key: "dis_ekip", label: "Dış ekip" },
  { key: "uretim", label: "Üretim" },
  { key: "ekibimiz", label: "Ekibimiz" },
  { key: "dernek", label: "Dernekler" },
  { key: "diger", label: "Diğer" },
] as const;

export type CrmSegmentKey = (typeof CRM_SEGMENTS)[number]["key"];

export const CRM_STATUSES = [
  { key: "aktif", label: "Aktif" },
  { key: "takipte", label: "Takipte" },
  { key: "beklemede", label: "Beklemede" },
  { key: "pasif", label: "Pasif" },
] as const;

export type CrmStatusKey = (typeof CRM_STATUSES)[number]["key"];

export const CRM_SOURCE_CHANNELS = [
  { key: "instagram", label: "Instagram" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "referans", label: "Referans" },
  { key: "etkinlik", label: "Etkinlik" },
  { key: "web", label: "Web" },
  { key: "diger", label: "Diğer" },
] as const;

const SEGMENT_LABELS = new Map<string, string>(CRM_SEGMENTS.map((s) => [s.key, s.label]));
const STATUS_LABELS = new Map<string, string>(CRM_STATUSES.map((s) => [s.key, s.label]));
const SOURCE_LABELS = new Map<string, string>(CRM_SOURCE_CHANNELS.map((s) => [s.key, s.label]));

export function segmentLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return SEGMENT_LABELS.get(key) ?? key;
}
export function statusLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return STATUS_LABELS.get(key) ?? key;
}
export function sourceLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return SOURCE_LABELS.get(key) ?? key;
}

// Soft badge tone per segment (reuses the muted palette used across the app).
/* ON YEDİ SEGMENT, RENK ÇEMBERİNE YAYILDI.
   Önceki hâlinde "Dış ekip" ile "Influencer" aynı hue'daydı (309) ve yalnız
   doygunlukla ayrılıyordu; "Basın" ile "Dernek" ise iki ayrı gri tonuydu —
   yan yana ayırt edilmiyorlardı. Şimdi her segmentin çemberde kendi yeri var,
   üçü (Basın, Dernek, Diğer) bilerek sönük: kimliği olmayan kayıt renk
   taşımasın. Zemin/metin çifti kart aileleriyle aynı merdivenden çıkıyor,
   on yedisinin de kontrastı 5.96–6.08. */
export const SEGMENT_TONE: Record<string, string> = {
  celebrity:  "bg-[#ffd5ca] text-[#9d1c0f]",
  isbirligi:  "bg-[#f9d8c3] text-[#7c400e]",
  vip:        "bg-[#f2dbbf] text-[#6a4a0f]",
  tedarikci:  "bg-[#e7debe] text-[#595110]",
  uretim:     "bg-[#dce1c1] text-[#465610]",
  outsource:  "bg-[#c7e6ce] text-[#165c31]",
  ekibimiz:   "bg-[#b9e8de] text-[#165a50]",
  konsinye:   "bg-[#b4e7ef] text-[#185860]",
  toplanti:   "bg-[#c2e2fc] text-[#175575]",
  wholesale:  "bg-[#d8dcfd] text-[#1a4d9f]",
  dis_ekip:   "bg-[#e1dafa] text-[#273dca]",
  influencer: "bg-[#edd7f4] text-[#7d1da7]",
  pr:         "bg-[#f5d5ed] text-[#8c1e7d]",
  stylist:    "bg-[#fcd3e4] text-[#941e60]",
  basin:      "bg-[#c9e2ed] text-[#37545f]",
  dernek:     "bg-[#eceff8] text-[#505a6d]",
  diger:      "bg-[#e7f1f7] text-[#505b62]",
};
export const STATUS_TONE: Record<string, string> = {
  aktif: "bg-[#dcf0e0] text-[#1e713d]",
  takipte: "bg-[#cbe0fe] text-[#185382]",
  beklemede: "bg-[#f5dac0] text-[#70470f]",
  pasif: "bg-[#e8f0f6] text-[#596268]",
};


/* ─────────────────────────────────────────────────────────────────────────
   CRM GİRİŞİ — ÖNCE KUTULAR, SONRA İÇERİK.

   NOT (2026-09-10): AF alıntıda "selebriti" diyor (Türkçe okunuşu) ama kutunun
   ADI "Celebrity" — hem sayfa/etiket adları İngilizce kuralı gereği hem de
   CRM_SEGMENTS'teki rozet zaten "Celebrity" yazdığı için: aynı şey iki ayrı
   adla görünüyordu.

   Aslı Hanım (2026-09-07), CRM'i açıp doğrudan tablo görünce:
     "BU CRM'E BÖYLE GİREMEZSİN. Bak HER GİRDİĞİN DOSYA BÖYLE BAŞLAMALI."
     "Yani şimdi burada girersen böyle DİREKT SEN DOSYAYA GİRİYORSUN."
     "Ben de diyorum ki BÜTÜN TASARIMI BÖYLE YAP." (referans: Collection ve
     AF Teamwork'ün kutucuk ızgarası)

   Kutular AF'nin kendi saydığı sırayla. Her kutu bir ya da birkaç `segment`
   anahtarını toplar: eski kayıtlar (pr, stylist, influencer, tedarikçi…)
   silinmeden doğru kutunun altında görünsün diye. `primary`, o kutunun içinde
   AÇILAN YENİ kaydın varsayılan segmentidir.

   `Dernekler` gibi tek anahtarlı kutular da aynı biçimde tanımlıdır: liste
   büyüyünce kutu değil, kutunun içindeki anahtar listesi genişler.
   ───────────────────────────────────────────────────────────────────────── */
export interface CrmCategory {
  key: string;
  label: string;
  /** Bu kutunun kapsadığı `segment` anahtarları (eski değerler dahil). */
  segments: string[];
  /** Kutu içinde açılan yeni kaydın varsayılan segmenti. */
  primary: string;
  /** Kutunun tek satırlık tarifi — kart altında yazar. */
  hint: string;
}

export const CRM_CATEGORIES: CrmCategory[] = [
  { key: "celebrity", label: "Celebrity", segments: ["celebrity", "influencer", "stylist"], primary: "celebrity", hint: "Oyuncu, influencer, stylist" },
  { key: "basin", label: "Basın", segments: ["basin", "pr"], primary: "basin", hint: "Dergi, gazete, PR ajansı" },
  { key: "vip", label: "VIP", segments: ["vip"], primary: "vip", hint: "Özel müşteriler" },
  { key: "outsource", label: "Outsource", segments: ["outsource", "tedarikci"], primary: "outsource", hint: "Kalıpçı, üretici, tedarikçi" },
  { key: "toplanti", label: "Toplantılar", segments: ["toplanti"], primary: "toplanti", hint: "Dışarıdan toplantı yaptığımız kişiler" },
  { key: "dis_ekip", label: "Dış ekip", segments: ["dis_ekip", "isbirligi"], primary: "dis_ekip", hint: "Proje bazlı birlikte çalıştıklarımız" },
  { key: "uretim", label: "Üretim", segments: ["uretim", "wholesale", "konsinye"], primary: "uretim", hint: "Atölye, toptan, konsinye" },
  { key: "ekibimiz", label: "Ekibimiz", segments: ["ekibimiz"], primary: "ekibimiz", hint: "İç ekip kayıtları" },
  { key: "dernek", label: "Dernekler", segments: ["dernek"], primary: "dernek", hint: "Moda Tasarımcılar Derneği gibi kurumlar" },
  { key: "diger", label: "Diğer", segments: ["diger"], primary: "diger", hint: "Henüz yerleşmemiş kayıtlar" },
];

const CATEGORY_BY_KEY = new Map(CRM_CATEGORIES.map((c) => [c.key, c]));
const CATEGORY_OF_SEGMENT = new Map<string, CrmCategory>();
for (const c of CRM_CATEGORIES) for (const seg of c.segments) CATEGORY_OF_SEGMENT.set(seg, c);

export function crmCategory(key: string | null | undefined): CrmCategory | null {
  if (!key) return null;
  return CATEGORY_BY_KEY.get(key) ?? null;
}

/** Bir kaydın hangi kutuya düştüğü. Tanınmayan/boş segment → "Diğer". */
export function crmCategoryOfSegment(segment: string | null | undefined): CrmCategory {
  return (segment && CATEGORY_OF_SEGMENT.get(segment)) || CATEGORY_BY_KEY.get("diger")!;
}
