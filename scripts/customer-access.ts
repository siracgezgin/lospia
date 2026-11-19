#!/usr/bin/env npx tsx
/**
 * MÜŞTERİ CRM'i — KİM GÖREBİLİR? (KVKK; yalnız Sıraç çalıştırır)
 *
 * İzin listesi panelden DEĞİŞTİRİLEMEZ: `customer_access` tablosuna yalnız
 * service_role yazar (20240379). Liste dört kişidir: Aslı Hanım, Nisa Hanım,
 * Kısmet Hanım, Sıraç. A+ katmanını yalnız `--aplus` ile işaretlenen kişi verir.
 *
 *   npx tsx scripts/customer-access.ts                     # yerel, listeyi göster
 *   npx tsx scripts/customer-access.ts --prod              # canlı, listeyi göster
 *   npx tsx scripts/customer-access.ts --prod --ekle a@x.com,b@y.com --aplus b@y.com
 *   npx tsx scripts/customer-access.ts --prod --cikar a@x.com
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const args = process.argv.slice(2);
const list = (name: string) => { const i = args.indexOf(name); return i >= 0 ? (args[i + 1] ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) : []; };
const PROD = args.includes("--prod");

function readEnvFile(name: string): Record<string, string> {
  const p = path.join(process.cwd(), name);
  const env: Record<string, string> = {};
  if (!fs.existsSync(p)) return env;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim(); const eq = t.indexOf("=");
    if (!t || t.startsWith("#") || eq < 0) continue;
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

async function main() {
  const f = PROD ? readEnvFile(".env.prod") : readEnvFile(".env.local");
  const url = PROD ? (process.env.IMPORT_SUPABASE_URL ?? f.IMPORT_SUPABASE_URL) : f.NEXT_PUBLIC_SUPABASE_URL;
  const key = PROD ? (process.env.IMPORT_SUPABASE_SERVICE_ROLE_KEY ?? f.IMPORT_SUPABASE_SERVICE_ROLE_KEY) : f.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error(`❌ ${PROD ? ".env.prod" : ".env.local"} eksik.`); process.exit(1); }
  const db = createClient(url, key, { auth: { persistSession: false } });
  console.log(`\n▸ ${PROD ? "CANLI" : "YEREL"}`);

  const add = list("--ekle"), remove = list("--cikar"), top = new Set(list("--aplus"));
  const emails = [...new Set([...add, ...remove, ...top])];
  const { data: people, error } = emails.length
    ? await db.from("profiles").select("id, email").in("email", emails)
    : { data: [], error: null };
  if (error) { console.error(`❌ ${error.message}`); process.exit(1); }
  const idOf = new Map((people ?? []).map((p) => [String(p.email).toLowerCase(), p.id as string]));
  for (const e of emails) if (!idOf.has(e)) console.log(`  ⚠ ${e} — bu e-postayla kullanıcı yok`);

  for (const e of [...new Set([...add, ...top])]) {
    const user_id = idOf.get(e);
    if (!user_id) continue;
    const { data: m } = await db.from("workspace_members").select("workspace_id").eq("user_id", user_id).limit(1).maybeSingle();
    if (!m) { console.log(`  ⚠ ${e} — çalışma alanı üyesi değil`); continue; }
    const { error: upErr } = await db.from("customer_access").upsert({ workspace_id: m.workspace_id, user_id, can_mark_top: top.has(e) });
    console.log(upErr ? `  ❌ ${e} — ${upErr.message}` : `  + ${e}${top.has(e) ? " (A+ yetkili)" : ""}`);
  }
  for (const e of remove) {
    const user_id = idOf.get(e);
    if (!user_id) continue;
    const { error: delErr } = await db.from("customer_access").delete().eq("user_id", user_id);
    console.log(delErr ? `  ❌ ${e} — ${delErr.message}` : `  − ${e}`);
  }

  const { data: rows, error: listErr } = await db.from("customer_access").select("user_id, can_mark_top, profiles(email, full_name)");
  if (listErr) { console.error(`❌ liste okunamadı — ${listErr.message} (20240379 uygulandı mı?)`); process.exit(1); }
  console.log(`\n  Müşteri listesini görebilenler (${rows?.length ?? 0}):`);
  for (const r of (rows ?? []) as unknown as { can_mark_top: boolean; profiles: { email: string; full_name: string | null } | null }[]) {
    console.log(`    ${r.profiles?.email ?? "?"}${r.can_mark_top ? " · A+ yetkili" : ""}`);
  }
  console.log("");
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
