/**
 * KOLEKTİF BAŞVURUSU → CRM — /api/kolektif-basvuru  (2026-09-28)
 *
 * Aslı Hanım: "Operasyon dosyasında kolektif diye bir CRM yapıp oraya bunun
 * database'inin girmesi gerekiyor. Adı, soyadı, bütün aldığımız bilgiler
 * şeklinde."
 *
 * Filinta Metodolojisi'nin kolektif formu (fm.aslifilinta.com/kolektif) bir
 * başvuruyu kaydettiği anda bu uca imzalı bir istek atar:
 *
 *   POST /api/kolektif-basvuru
 *   x-kolektif-signature: <ham gövdenin HMAC-SHA256 imzası, hex>
 *   { fm_basvuru_id, kayit_no, gonderildi, segment, kategori, ad_soyad,
 *     eposta, telefon, il, ilce, kurum, rol, instagram, web,
 *     bolumler[{baslik, sorular[{soru, yanit}]}], gelenekler, konular,
 *     katki, panel_url }                       — şema: lib/crm/kolektif.ts
 *
 * Kişi CRM'in "Kolektif" kutusuna düşer (segment AF'nin beş kategorisinden
 * biri); başvurunun tamamı `metadata.kolektif` alanında durur ve CRM
 * satırının altında açılır. Doğum tarihi bu isteğe HİÇ girmez.
 *
 * YETKİ: gelen istekte oturum yoktur, RLS'in dayanacağı auth.uid() de yoktur.
 * Yazma bu yüzden service_role istemcisiyle yapılır — /api/inbound-email ile
 * aynı gerekçe ve aynı kapı: bu SUNUCUYA ÖZEL bir dosyadır, anahtar tarayıcıya
 * gitmez, kapı HMAC imzasıdır. KOLEKTIF_CRM_SECRET tanımlı değilse uç nokta
 * YOKMUŞ gibi davranır (404). Eski bir isteğin yeniden oynatılmasına karşı
 * `gonderildi` on dakikadan eski olamaz.
 *
 * AYNI BAŞVURU İKİ KEZ GELİRSE ikinci kişi açılmaz: `metadata.kolektif
 * .fm_basvuru_id` ile bulunur ve yalnız başvuru verisi tazelenir — ekibin
 * CRM'de düzelttiği ad, telefon, durum ve not hücreleri EZİLMEZ.
 *
 * Ortam:
 *   KOLEKTIF_CRM_SECRET      imza sırrı (Filinta'daki OPERASYON_CRM_SIRRI ile aynı)
 *   KOLEKTIF_CRM_WORKSPACE   isteğe bağlı; çalışma alanının slug'ı. Boşsa ve
 *                            tek çalışma alanı varsa o kullanılır.
 */

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getAdminClient } from "@/lib/supabase/admin";
import { kolektifIstekSemasi, type KolektifKayit } from "@/lib/crm/kolektif";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;
const TAZELIK_MS = 10 * 60 * 1000;

function hata(kod: string, mesaj: string, status: number) {
  return NextResponse.json({ error: kod, mesaj }, { status });
}

function imzaTutuyor(beklenen: string, gelen: string): boolean {
  const a = Buffer.from(beklenen, "utf8");
  const b = Buffer.from(gelen, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Kısa, tek satırlık özet — CRM'in "Not" hücresi tek satırdır. */
function ozet(k: { kategori: string; il: string | null; ilce: string | null; kayit_no: string }): string {
  const yer = [k.il, k.ilce].filter(Boolean).join(" / ");
  return `Kolektif başvurusu · ${k.kategori}${yer ? ` · ${yer}` : ""} · Kayıt ${k.kayit_no}`;
}

export async function POST(request: Request) {
  const sir = process.env.KOLEKTIF_CRM_SECRET ?? "";
  if (!sir) return hata("disabled", "Kolektif CRM girişi kapalı.", 404);

  const admin = getAdminClient();
  if (!admin) {
    console.error("[kolektif-basvuru] service_role istemcisi yapılandırılmamış");
    return hata("not_configured", "Sunucu yapılandırılmamış.", 503);
  }

  let ham: string;
  try {
    ham = await request.text();
  } catch {
    return hata("unreadable_body", "İstek gövdesi okunamadı.", 400);
  }
  if (Buffer.byteLength(ham, "utf8") > MAX_BODY_BYTES) {
    return hata("payload_too_large", "İstek gövdesi çok büyük.", 413);
  }

  const imza = request.headers.get("x-kolektif-signature")?.trim() ?? "";
  const beklenen = createHmac("sha256", sir).update(ham, "utf8").digest("hex");
  if (!imza || !imzaTutuyor(beklenen, imza)) {
    console.error("[kolektif-basvuru] imza doğrulanamadı");
    return hata("invalid_signature", "İmza doğrulanamadı.", 401);
  }

  let json: unknown;
  try {
    json = JSON.parse(ham);
  } catch {
    return hata("invalid_json", "Gövde geçerli bir JSON değil.", 400);
  }
  const cozum = kolektifIstekSemasi.safeParse(json);
  if (!cozum.success) {
    /* Alan adı ve sebep loglanır; kişinin yazdığı içerik loglanmaz. */
    const alanlar = cozum.error.issues.map((i) => `${i.path.join(".") || "(gövde)"}: ${i.message}`);
    console.error("[kolektif-basvuru] geçersiz girdi:", alanlar.join(" | "));
    return NextResponse.json({ error: "invalid_payload", mesaj: "Eksik ya da geçersiz alanlar var.", alanlar }, { status: 400 });
  }
  const k = cozum.data;
  if (Math.abs(Date.now() - new Date(k.gonderildi).getTime()) > TAZELIK_MS) {
    return hata("stale_request", "İstek süresi geçmiş.", 401);
  }

  // ── Çalışma alanı ───────────────────────────────────────────────────────
  const slug = process.env.KOLEKTIF_CRM_WORKSPACE?.trim();
  const { data: alanlar, error: alanHatasi } = slug
    ? await admin.from("workspaces").select("id").eq("slug", slug).limit(2)
    : await admin.from("workspaces").select("id").limit(2);
  if (alanHatasi) {
    console.error("[kolektif-basvuru] çalışma alanı okunamadı:", alanHatasi.message);
    return hata("lookup_failed", "Çalışma alanı okunamadı.", 500);
  }
  if (!alanlar || alanlar.length !== 1) {
    console.error("[kolektif-basvuru] çalışma alanı belirsiz — KOLEKTIF_CRM_WORKSPACE ayarlanmalı");
    return hata("workspace_ambiguous", "Çalışma alanı belirlenemedi.", 500);
  }
  const workspaceId = (alanlar[0] as { id: string }).id;

  const kayit: KolektifKayit = {
    fm_basvuru_id: k.fm_basvuru_id,
    kayit_no: k.kayit_no,
    segment: k.segment,
    kategori: k.kategori,
    il: k.il,
    ilce: k.ilce,
    kurum: k.kurum,
    rol: k.rol,
    instagram: k.instagram,
    web: k.web,
    bolumler: k.bolumler,
    gelenekler: k.gelenekler,
    konular: k.konular,
    katki: k.katki,
    panel_url: k.panel_url,
    alindi: new Date().toISOString(),
  };

  // ── Aynı başvuru daha önce geldi mi? ─────────────────────────────────────
  const { data: varOlan, error: aramaHatasi } = await admin
    .from("workspace_contacts")
    .select("id, metadata")
    .eq("workspace_id", workspaceId)
    .filter("metadata->kolektif->>fm_basvuru_id", "eq", k.fm_basvuru_id)
    .limit(1)
    .maybeSingle();
  if (aramaHatasi) {
    console.error("[kolektif-basvuru] kişi aranamadı:", aramaHatasi.message);
    return hata("lookup_failed", "Kişi aranamadı.", 500);
  }

  let kisiId: string;
  let yeni = false;
  if (varOlan) {
    const eski = (varOlan as { id: string; metadata: Record<string, unknown> | null }).metadata ?? {};
    const { error } = await admin
      .from("workspace_contacts")
      .update({ metadata: { ...eski, kolektif: kayit } })
      .eq("id", (varOlan as { id: string }).id);
    if (error) {
      console.error("[kolektif-basvuru] kişi güncellenemedi:", error.message);
      return hata("write_failed", "Kişi güncellenemedi.", 500);
    }
    kisiId = (varOlan as { id: string }).id;
  } else {
    const { data, error } = await admin
      .from("workspace_contacts")
      .insert({
        workspace_id: workspaceId,
        kind: "external",
        name: k.ad_soyad,
        email: k.eposta,
        phone: k.telefon,
        organization: k.kurum,
        role_label: k.rol,
        segment: k.segment,
        source_channel: "web",
        crm_status: "takipte",
        notes: ozet(k),
        metadata: { kolektif: kayit },
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("[kolektif-basvuru] kişi açılamadı:", error?.message);
      return hata("write_failed", "Kişi açılamadı.", 500);
    }
    kisiId = (data as { id: string }).id;
    yeni = true;
  }

  /* Denetim izi — kişisel veri YOK; yalnız hangi başvurunun hangi kişiye
     düştüğü. Yazılamazsa kişi yine açılmıştır; iz yalnız ikincil kanal. */
  await admin.from("webhook_events").insert({
    workspace_id: workspaceId,
    source: "other",
    raw_payload: { tur: "kolektif", fm_basvuru_id: k.fm_basvuru_id, kayit_no: k.kayit_no, segment: k.segment, kisi_id: kisiId, yeni },
    processed: true,
  });

  return NextResponse.json({ ok: true, kisi_id: kisiId, yeni });
}
