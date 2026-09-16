#!/usr/bin/env npx tsx
/**
 * AF TEAMWORK ENVANTERİ — "ne var, kimin, ne kadar yer kaplıyor?"
 *
 * Silme kararından ÖNCE çalıştırılır. Yalnız okur.
 *
 *   npm run teamwork:inventory -- --prod
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const PROD = process.argv.includes("--prod");

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

function target() {
  const f = readEnvFile(".env.prod");
  const url = process.env.IMPORT_SUPABASE_URL ?? f.IMPORT_SUPABASE_URL;
  const key = process.env.IMPORT_SUPABASE_SERVICE_ROLE_KEY ?? f.IMPORT_SUPABASE_SERVICE_ROLE_KEY;
  if (PROD || url || key) {
    if (!url || !key) { console.error("❌ .env.prod eksik."); process.exit(1); }
    return { url, key, label: "PRODUCTION" };
  }
  const l = readEnvFile(".env.local");
  return { url: l.NEXT_PUBLIC_SUPABASE_URL, key: l.SUPABASE_SERVICE_ROLE_KEY, label: "LOCAL" };
}

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

async function main() {
  const { url, key, label } = target();
  const db: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });
  console.log(`\n▸ ${label}\n`);

  const { data: profiles } = await db.from("profiles").select("id, full_name, email");
  const who = new Map(((profiles ?? []) as { id: string; full_name: string | null; email: string | null }[])
    .map((p) => [p.id, p.full_name || p.email || p.id.slice(0, 8)]));
  const name = (id: string | null) => (id ? who.get(id) ?? id.slice(0, 8) : "—");

  const { data: folders } = await db
    .from("document_folders").select("id, name, parent_id, created_by, created_at").order("name");
  console.log("── KLASÖRLER");
  for (const f of (folders ?? []) as { id: string; name: string; parent_id: string | null; created_by: string | null; created_at: string }[]) {
    console.log(`   ${f.name.padEnd(34)} ${day(f.created_at)}  ${name(f.created_by)}${f.parent_id ? "  (alt klasör)" : ""}`);
  }

  const { data: sheets } = await db
    .from("operation_spreadsheets").select("id, title, created_by, created_at, status, source_document_id");
  console.log("\n── TABLOLAR");
  for (const s of (sheets ?? []) as { id: string; title: string; created_by: string | null; created_at: string; status: string; source_document_id: string | null }[]) {
    console.log(`   ${s.title.padEnd(34)} ${day(s.created_at)}  ${name(s.created_by).padEnd(18)} ${s.status}${s.source_document_id ? "  ← dosyadan aktarıldı" : ""}`);
  }

  const { data: docs } = await db
    .from("operation_documents")
    .select("id, title, document_type, created_by, created_at, file_size, folder_id");
  const rows = (docs ?? []) as { id: string; title: string; document_type: string; created_by: string | null; created_at: string; file_size: number | null; folder_id: string | null }[];
  const byKind = new Map<string, { n: number; bytes: number }>();
  for (const d of rows) {
    const k = d.document_type ?? "?";
    const t = byKind.get(k) ?? { n: 0, bytes: 0 };
    t.n++; t.bytes += d.file_size ?? 0;
    byKind.set(k, t);
  }
  console.log("\n── KAYITLAR (operation_documents)");
  for (const [k, t] of byKind) console.log(`   ${k.padEnd(10)} ${String(t.n).padStart(5)} adet · ${mb(t.bytes)}`);

  console.log("\n── DOSYA/YAZI/BAĞLANTI (görsel olmayanlar)");
  const folderName = new Map(((folders ?? []) as { id: string; name: string }[]).map((f) => [f.id, f.name]));
  for (const d of rows) {
    const isImg = (d.file_size ?? 0) > 0 && folderName.get(d.folder_id ?? "") === "Excel Görselleri";
    if (isImg) continue;
    if (d.document_type === "file" && folderName.get(d.folder_id ?? "")?.includes("örsel")) continue;
    console.log(`   ${(d.title ?? "").slice(0, 40).padEnd(42)} ${d.document_type.padEnd(6)} ${day(d.created_at)}  ${name(d.created_by).padEnd(18)} ${d.file_size ? mb(d.file_size) : ""}`);
  }
  console.log();
}
void main();
