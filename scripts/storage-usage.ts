#!/usr/bin/env npx tsx
/**
 * Depolama kullanımı — "ne kadar alanımız kaldı?"
 *
 *   npm run storage:usage                 # yerel Supabase (.env.local)
 *
 *   Canlı:
 *     IMPORT_SUPABASE_URL=https://<proj>.supabase.co \
 *     IMPORT_SUPABASE_SERVICE_ROLE_KEY=sb_secret_… \
 *     npm run storage:usage -- --prod
 *
 * Neden betik: panel (Settings → Usage) toplamı gösterir ama HANGİ KOVANIN
 * ne yediğini ve dosya başına ortalamayı göstermez. İçe aktarmadan önce
 * "465 MB görsel bu kotaya sığar mı" sorusunun cevabı bu ayrıntıda.
 *
 * SADECE OKUR — hiçbir şeyi değiştirmez.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const PROD = process.argv.includes("--prod");

/** Ücretsiz planın dosya depolama kotası (Supabase, 2026). Plan değişirse
 *  yalnız bu sayı güncellenir. */
const FREE_PLAN_BYTES = 1 * 1024 * 1024 * 1024;

function loadDotEnvLocal(): Record<string, string> {
  const p = path.join(process.cwd(), ".env.local");
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

function resolveTarget(): { url: string; key: string; label: string } {
  const envUrl = process.env.IMPORT_SUPABASE_URL;
  const envKey = process.env.IMPORT_SUPABASE_SERVICE_ROLE_KEY;
  if (PROD || envUrl || envKey) {
    if (!envUrl || !envKey) {
      console.error("❌  --prod için IMPORT_SUPABASE_URL ve IMPORT_SUPABASE_SERVICE_ROLE_KEY gerekli.");
      console.error("    Panel → Settings → API → Secret keys → default (sb_secret_…)");
      process.exit(1);
    }
    if (envKey.startsWith("sb_publishable_")) {
      console.error("❌  Bu bir tarayıcı anahtarı (publishable) — depolamayı listeleyemez.");
      console.error("    Secret keys → default (sb_secret_…) kullanın.");
      process.exit(1);
    }
    return { url: envUrl, key: envKey, label: "PRODUCTION" };
  }
  const local = loadDotEnvLocal();
  const url = local.NEXT_PUBLIC_SUPABASE_URL;
  const key = local.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("❌  .env.local içinde NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY yok");
    process.exit(1);
  }
  return { url, key, label: "LOCAL" };
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

type Tally = { files: number; bytes: number };

/** Kovayı KLASÖR KLASÖR gezer. Storage list'i tek seferde en çok 100 girdi
 *  döndürür ve alt klasörleri kendiliğinden açmaz; ikisi de elle yürütülür. */
async function walkBucket(supabase: SupabaseClient, bucket: string): Promise<Tally> {
  const tally: Tally = { files: 0, bytes: 0 };
  const queue: string[] = [""];

  while (queue.length) {
    const prefix = queue.shift() as string;
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
      if (error) {
        console.error(`   ⚠  ${bucket}/${prefix} listelenemedi: ${error.message}`);
        break;
      }
      if (!data?.length) break;
      for (const entry of data) {
        const full = prefix ? `${prefix}/${entry.name}` : entry.name;
        // Klasörlerin id'si null gelir; dosyaların metadata.size'ı vardır.
        if (entry.id === null) {
          queue.push(full);
        } else {
          tally.files += 1;
          tally.bytes += Number((entry.metadata as { size?: number } | null)?.size ?? 0);
        }
      }
      if (data.length < 100) break;
      offset += data.length;
    }
  }
  return tally;
}

async function main() {
  const { url, key, label } = resolveTarget();
  console.log(`🎯  Hedef: ${label}  ·  ${url}`);
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) {
    console.error("❌  Kovalar listelenemedi:", error.message);
    process.exit(1);
  }
  if (!buckets?.length) {
    console.log("ℹ️   Hiç kova yok.");
    return;
  }

  let totalFiles = 0;
  let totalBytes = 0;
  const rows: { name: string; files: number; bytes: number }[] = [];

  for (const b of buckets) {
    const t = await walkBucket(supabase, b.name);
    rows.push({ name: b.name, files: t.files, bytes: t.bytes });
    totalFiles += t.files;
    totalBytes += t.bytes;
  }

  rows.sort((a, b) => b.bytes - a.bytes);
  const pad = Math.max(...rows.map((r) => r.name.length), 10);
  console.log("\n  KOVA".padEnd(pad + 4) + "DOSYA".padStart(8) + "BOYUT".padStart(12) + "ORTALAMA".padStart(12));
  for (const r of rows) {
    const avg = r.files ? `${Math.round(r.bytes / r.files / 1024)} KB` : "—";
    console.log(
      "  " + r.name.padEnd(pad + 2) + String(r.files).padStart(8) + mb(r.bytes).padStart(12) + avg.padStart(12),
    );
  }
  console.log("  " + "".padEnd(pad + 2, "─") + "─".repeat(30));
  console.log("  " + "TOPLAM".padEnd(pad + 2) + String(totalFiles).padStart(8) + mb(totalBytes).padStart(12));

  const pct = (totalBytes / FREE_PLAN_BYTES) * 100;
  const free = FREE_PLAN_BYTES - totalBytes;
  console.log(
    `\n📊  Ücretsiz plan kotası 1 GB üzerinden: %${pct.toFixed(1)} dolu · kalan ${mb(free)}`,
  );
  console.log("    (Planınız Pro ise kota 100 GB'dır; bu satırı dikkate almayın.)");
  console.log("    Kesin ve resmî rakam: Panel → Settings → Usage");
}

main().catch((error) => {
  console.error("❌ ", error instanceof Error ? error.message : error);
  process.exit(1);
});
