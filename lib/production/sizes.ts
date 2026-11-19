import { canonicalSize, orderSizes } from "@/lib/collection/cost";
import type { SizeDistribution } from "@/types";

/**
 * KÂĞITTA HANGİ BEDEN SÜTUNLARI ÇİZİLİR — tek kural.
 *
 * Föy on iki standart bedenin hepsini taşır (XS … XL-XXL, One Size) ve hepsinin
 * varsayılan bir GRUP etiketi vardır. Excel "adedi ya da grup etiketi olan
 * beden çizilir" diyordu; grup etiketi hepsinde dolu olduğu için on iki beden de
 * "kullanılıyor" sayılıyor, sonra tablo altı sütuna KESİLİYORDU: sıralamada
 * araya giren boş XS-S / S-M / M-L sütunları çiziliyor, adedi olan L ve XL
 * dosyaya hiç yazılmıyordu. Tek sayfa çıktı da on iki sütunu birden basıyordu.
 *
 * Kural: bir beden, herhangi bir satırında SIFIRDAN FARKLI bir değer varsa
 * çizilir. Hiçbiri dolu değilse elle doldurulacak temel set döner.
 */

const BASIC = ["XS", "S", "M", "L", "XL", "One Size"];

const meaningful = (v: unknown) => {
  const t = String(v ?? "").trim();
  return t !== "" && !/^0+([.,]0+)?$/.test(t);
};

export function printableSizes(sd: SizeDistribution | null | undefined): string[] {
  const raw = sd?.sizes ?? [];
  const rows = sd?.rows ?? [];
  const used = raw.filter((_, i) => rows.some((row) => meaningful(row.values?.[i])));
  if (used.length) return orderSizes(used);
  const have = new Set(raw.map(canonicalSize));
  const basic = BASIC.filter((s) => have.has(s));
  return basic.length ? basic : orderSizes(raw).slice(0, 6);
}
