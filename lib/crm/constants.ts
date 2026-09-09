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
export const SEGMENT_TONE: Record<string, string> = {
  outsource: "bg-[#eaf2ec] text-[#2f6142]",
  toplanti: "bg-[#e9eefb] text-[#28448f]",
  dis_ekip: "bg-[#f2eef7] text-[#5b3d84]",
  uretim: "bg-[#f7efe4] text-[#82551a]",
  ekibimiz: "bg-[#e6f4f1] text-[#15665b]",
  dernek: "bg-[#f0f1f4] text-[#4a5262]",
  vip: "bg-[#fbf2e2] text-[#8a5e14]",
  wholesale: "bg-[#e8f1fd] text-[#1a4889]",
  konsinye: "bg-[#e6f6f7] text-[#11707a]",
  pr: "bg-[#fce9f3] text-[#9a216c]",
  influencer: "bg-[#f1ecfc] text-[#5325a3]",
  basin: "bg-[#eff2f6] text-[#43526b]",
  stylist: "bg-[#f9eef1] text-[#9c3a55]",
  celebrity: "bg-[#fdeae7] text-[#971f12]",
  isbirligi: "bg-[#fdf0e3] text-[#964b0c]",
  tedarikci: "bg-[#f4f1e2] text-[#675c16]",
  diger: "bg-[#eef0f2] text-[#5c636b]",
};

export const STATUS_TONE: Record<string, string> = {
  aktif: "bg-[#dcf0e6] text-[#1f6e4d]",
  takipte: "bg-[#e3effb] text-[#1f5fa8]",
  beklemede: "bg-[#f6ecd4] text-[#8a6516]",
  pasif: "bg-[#eef0f2] text-[#7a828b]",
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
