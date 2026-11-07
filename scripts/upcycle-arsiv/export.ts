#!/usr/bin/env npx tsx
/**
 * UPCYCLE KAYITLARINI EXCEL'E DÖK — tablo kaldırılmadan önce.
 *
 * Upcycle modülü yanlış anlamayla yapılıp geri alındı (d3b75d2 → 5be6e02), ama
 * canlıdayken ekip 5 Kasım'da ona 5 ürün girdi. Sıraç (07.11.2026): "Excel
 * olarak ver, sonra kaldır." Bu betik canlıdaki `upcycle_items` satırlarını
 * fotoğraflarıyla, modülün kendi Excel düzeninde bir dosyaya yazar.
 *
 * YALNIZ OKUR. Hiçbir satırı ya da fotoğrafı silmez; tabloyu kaldırmak ayrı
 * bir adımdır ve Excel kontrol edildikten sonra yapılır.
 *
 *   npx tsx scripts/upcycle-arsiv/export.ts --prod
 *   → ~/Desktop/Upcycle_Kayitlari_<tarih>.xlsx
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { buildUpcycleWorkbook } from "./xlsx-export";
import type { UpcycleItem } from "./model";

const PROD = process.argv.includes("--prod");
const BUCKET = "production-sheets";

function readEnvFile(name: string): Record<string, string> {
  const p = path.join(process.cwd(), name);
  const env: Record<string, string> = {};
  if (!fs.existsSync(p)) return env;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

async function main() {
  let url: string | undefined, key: string | undefined, label: string;
  if (PROD) {
    const f = readEnvFile(".env.prod");
    url = process.env.IMPORT_SUPABASE_URL ?? f.IMPORT_SUPABASE_URL;
    key = process.env.IMPORT_SUPABASE_SERVICE_ROLE_KEY ?? f.IMPORT_SUPABASE_SERVICE_ROLE_KEY;
    label = "CANLI";
  } else {
    const l = readEnvFile(".env.local");
    url = l.NEXT_PUBLIC_SUPABASE_URL; key = l.SUPABASE_SERVICE_ROLE_KEY; label = "YEREL";
  }
  if (!url || !key) { console.error("❌ Supabase adresi/anahtarı bulunamadı (.env.prod / .env.local)."); process.exit(1); }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await db.from("upcycle_items").select("*").order("section").order("position").order("created_at");
  if (error) { console.error(`❌ ${label}: upcycle_items okunamadı — ${error.message}`); process.exit(1); }
  const items = (data ?? []) as UpcycleItem[];
  console.log(`\n▸ ${label}: ${items.length} satır`);
  for (const it of items) {
    console.log(`  · ${it.section === "urun" ? "Ürün" : "Malzeme"} — ${it.name || "adsız"}${it.color ? ` (${it.color})` : ""} · ${it.before_photos?.length ?? 0}+${it.after_photos?.length ?? 0} fotoğraf`);
  }
  if (!items.length) { console.log("Yazılacak satır yok."); return; }

  let missing = 0;
  const last = items.reduce<string | null>((m, i) => (!m || i.updated_at > m ? i.updated_at : m), null);
  const buffer = await buildUpcycleWorkbook(items, {
    updatedAt: last ? new Date(last) : null,
    fetchPhoto: async (p) => {
      const { data: blob } = await db.storage.from(BUCKET).download(p);
      if (!blob) { missing++; return null; }
      return Buffer.from(await blob.arrayBuffer());
    },
  });

  const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
  const out = path.join(os.homedir(), "Desktop", `Upcycle_Kayitlari_${stamp}.xlsx`);
  fs.writeFileSync(out, buffer);
  console.log(`\n✓ Yazıldı: ${out}${missing ? `\n  ! ${missing} fotoğraf indirilemedi` : ""}`);
  console.log("  Hiçbir şey silinmedi.\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
