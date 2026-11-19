/**
 * MÜŞTERİ CRM'i — ortak model (sunucu + istemci). Migration 20240379.
 *
 * KVKK: liste yalnız izin listesindeki kişilere açık (customer_access).
 * Gerçek müşteri verisi repoya, örnek veriye, ekran görüntüsüne GİRMEZ.
 */

export type CustomerTier = "A+" | "A" | "B" | "C" | "D";
export type CustomerSource = "site" | "magaza" | "elle";
export type EmailConsent = "var" | "yok" | "bilinmiyor";
export type EmailStatus = "ok" | "hatali" | "cikti";

export interface Customer {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  city: string;
  tier: CustomerTier;
  source: CustomerSource;
  last_activity: string | null; // yyyy-MM-dd
  email_consent: EmailConsent;
  email_consent_at: string | null;
  email_status: EmailStatus;
  /** Ana listedeki etiket, olduğu gibi ("www.C", "Mağaza A", "Event A"). */
  label: string;
  note: string;
}

export interface CustomerSend {
  id: string;
  sent_on: string;
  subject: string;
  result: "gitti" | "dondu" | "cikti";
}

export const CUSTOMER_SELECT =
  "id, full_name, email, phone, city, tier, source, label, last_activity, email_consent, email_consent_at, email_status, note";

/** Katmanlar (22.10 toplantısı). Sıra = giriş ekranındaki kutucuk sırası. */
export const TIERS: { key: CustomerTier; label: string }[] = [
  { key: "A+", label: "Çok alışveriş yapan" },
  { key: "A", label: "Alışveriş yapan" },
  { key: "B", label: "Deneyip almayan" },
  { key: "C", label: "Bilgisini veren" },
  { key: "D", label: "E-postası olmayan" },
];
export const isTier = (v: string | undefined): v is CustomerTier => TIERS.some((t) => t.key === v);

export const SOURCE_LABEL: Record<CustomerSource, string> = { site: "Site", magaza: "Mağaza", elle: "Elle" };
export const CONSENT_LABEL: Record<EmailConsent, string> = { var: "Var", yok: "Yok", bilinmiyor: "Bilinmiyor" };
export const STATUS_LABEL: Record<EmailStatus, string> = { ok: "Geçerli", hatali: "Adres hatalı", cikti: "Abonelikten çıktı" };
export const SEND_LABEL: Record<CustomerSend["result"], string> = { gitti: "Gitti", dondu: "Geri döndü", cikti: "Abonelikten çıktı" };

/**
 * Liste YILA göre gruplanır: önce bu yıl, sonra geçen yıl, sonra öncekiler;
 * tarihi olmayanlar en sonda (22.10: "sıralama yıla göre").
 */
export function groupByYear(rows: Customer[], thisYear: number): { key: string; label: string; rows: Customer[] }[] {
  const groups = new Map<string, Customer[]>();
  const keyOf = (c: Customer) => {
    if (!c.last_activity) return "yok";
    const y = Number(c.last_activity.slice(0, 4));
    return y >= thisYear ? String(thisYear) : y === thisYear - 1 ? String(thisYear - 1) : "once";
  };
  for (const c of rows) groups.set(keyOf(c), [...(groups.get(keyOf(c)) ?? []), c]);
  const order = [String(thisYear), String(thisYear - 1), "once", "yok"];
  const label = (k: string) => (k === "once" ? "Önceki yıllar" : k === "yok" ? "Tarihsiz" : k);
  return order.filter((k) => groups.has(k)).map((k) => ({
    key: k, label: label(k),
    rows: groups.get(k)!.sort((a, b) =>
      (b.last_activity ?? "").localeCompare(a.last_activity ?? "") || a.full_name.localeCompare(b.full_name, "tr")),
  }));
}

export const fmtDay = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" }) : "";
