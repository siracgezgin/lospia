#!/usr/bin/env npx tsx
/**
 * MÜŞTERİ CRM'i — YEREL geliştirme için SAHTE veri.
 *
 * Gerçek müşteri verisi repoya, örnek veriye, ekran görüntüsüne girmez (KVKK).
 * Bu betik uydurma adlarla ~150 kişi ve birkaç gönderim kaydı üretir; YALNIZ
 * yerel veritabanına yazar (.env.local) — `--prod` bayrağı YOKTUR.
 *
 *   npx tsx scripts/customers-seed-fake.ts            # yerel, yazar
 *   npx tsx scripts/customers-seed-fake.ts --izin alice@taskos.local,nisa@taskos.local --aplus nisa@taskos.local
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const env: Record<string, string> = {};
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const eq = line.indexOf("=");
  if (eq > 0 && !line.trim().startsWith("#")) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
}
const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!/127\.0\.0\.1|localhost/.test(url)) { console.error("❌ Bu betik yalnız YEREL veritabanında çalışır."); process.exit(1); }
const db = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const AD = ["Defne", "Elif", "Zeynep", "Selin", "Ece", "Deniz", "Melis", "İpek", "Naz", "Ada", "Lara", "Derin", "Mert", "Kaan", "Emre", "Can", "Bora", "Arda", "Sarp", "Tuna"];
const SOYAD = ["Örnek", "Deneme", "Sahte", "Uydurma", "Taslak", "Prova", "Kurgu", "Model", "Numune", "Şablon"];
const SEHIR = ["İstanbul", "İzmir", "Ankara", "Bodrum", "Çeşme", "New York", "Londra", ""];
let seed = 20261119;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

async function main() {
  const { data: ws } = await db.from("workspaces").select("id").limit(2);
  if (!ws || ws.length !== 1) { console.error(`❌ ${ws?.length ?? 0} çalışma alanı bulundu; tam bir tane olmalı.`); process.exit(1); }
  const workspace_id = ws[0].id as string;

  const izin = (arg("--izin") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const aplus = new Set((arg("--aplus") ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  for (const email of izin) {
    const { data: p } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
    if (!p) { console.log(`  ⚠ ${email} bulunamadı`); continue; }
    await db.from("customer_access").upsert({ workspace_id, user_id: p.id, can_mark_top: aplus.has(email) });
    console.log(`  izin: ${email}${aplus.has(email) ? " (A+ yetkili)" : ""}`);
  }

  const tiers = ["A+", "A", "A", "A", "B", "B", "C", "C", "C", "D"];
  const rows = Array.from({ length: 150 }, (_, i) => {
    const tier = pick(tiers);
    const name = `${pick(AD)} ${pick(SOYAD)}`;
    const year = pick([2026, 2026, 2025, 2024, 2023]);
    const hasDate = tier !== "C" && tier !== "D" ? true : rnd() < 0.3;
    const email = tier === "D" ? "" : `sahte${String(i + 1).padStart(3, "0")}@ornek.test`;
    return {
      workspace_id, full_name: name, email,
      phone: rnd() < 0.7 ? `+90 5${Math.floor(rnd() * 90 + 10)} 000 ${String(Math.floor(rnd() * 9000 + 1000))}` : "",
      city: pick(SEHIR), tier, source: pick(["site", "site", "magaza", "elle"]),
      last_activity: hasDate ? `${year}-${String(Math.floor(rnd() * 12) + 1).padStart(2, "0")}-${String(Math.floor(rnd() * 28) + 1).padStart(2, "0")}` : null,
      email_consent: email ? pick(["var", "var", "bilinmiyor", "yok"]) : "bilinmiyor",
      email_status: email ? pick(["ok", "ok", "ok", "ok", "ok", "hatali", "cikti"]) : "ok",
      note: rnd() < 0.15 ? "Sahte kayıt — yerel deneme." : "",
      source_ref: `sahte:${i + 1}`,
    };
  });
  const { data: saved, error } = await db.from("customers").upsert(rows, { onConflict: "workspace_id,source_ref" }).select("id, email");
  if (error) { console.error("❌", error.message); process.exit(1); }
  const withMail = (saved ?? []).filter((r) => r.email).slice(0, 40);
  const sends = withMail.flatMap((r, i) => [
    { workspace_id, customer_id: r.id, sent_on: "2026-11-09", subject: "Welcome to the world of Aslı Filinta", result: i % 11 === 0 ? "dondu" : "gitti", source_ref: `sahte:${r.id}:1` },
    { workspace_id, customer_id: r.id, sent_on: "2026-11-16", subject: "Discover the Yörük Collection", result: i % 13 === 0 ? "cikti" : "gitti", source_ref: `sahte:${r.id}:2` },
  ]);
  const s = await db.from("customer_sends").upsert(sends, { onConflict: "workspace_id,source_ref" });
  if (s.error) { console.error("❌", s.error.message); process.exit(1); }
  console.log(`✓ ${rows.length} sahte kişi · ${sends.length} gönderim kaydı (yerel)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
