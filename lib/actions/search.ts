"use server";

import { z } from "zod";
import { requireModuleMember } from "@/lib/modules/context";
import { isMissingSchemaError, type DbLikeError } from "@/lib/utils/supabase-errors";
import { formatDateOnlyTR } from "@/lib/utils/format-date";
import { crmCategoryOfSegment, segmentLabel } from "@/lib/crm/constants";

/**
 * GENEL ARAMA — uygulama çubuğundaki tek arama kutusunun sunucu tarafı.
 *
 * Sıraç (2026-09-10): "Yukarıda kişinin profili ve bildirim ikonu yanına arama
 * ikonu ekleyelim, o da genel arama olabilir. Yani çok profesyonel, işlevsel,
 * hem basic kullanıma sahip bir sistem olmalı."
 *
 * TASARIM KARARLARI
 *  • RLS BYPASS YOK. Sorgular kullanıcının kendi oturumuyla (createClient →
 *    requireModuleMember) atılır; service role hiç devreye girmez. Yani arama
 *    kimseye normalde göremediği bir satırı gösteremez — güvenlik veritabanında
 *    kalır, burada yalnız çalışma alanı sınırı tekrar edilir (kuşak + kemer).
 *  • TÜR BAŞINA 5 SATIR. Arama katmanı bir liste ekranı DEĞİL; "aradığını bul,
 *    git" kapısıdır. Uzun liste isteyen kullanıcı ilgili modülün kendi
 *    süzgecine gider.
 *  • MİGRATE EDİLMEMİŞ TABLO ARAMAYI ÖLDÜRMEZ. Prod'a migration'lar elle
 *    uygulanıyor (bkz. CLAUDE.md); bir tablo henüz yoksa o TÜR sessizce boş
 *    döner, arama diğer türlerle çalışmaya devam eder.
 */

/** Sonuç türleri — arama katmanındaki grup başlıklarıyla birebir. */
export type SearchKind = "task" | "topic" | "teamwork" | "contact" | "production";

export interface SearchHit {
  /** Satır anahtarı — `${kind}:${id}` klavye gezinmesinde de kullanılır. */
  key: string;
  kind: SearchKind;
  title: string;
  /** Tek satırlık sakin alt bilgi (tarih, kod, kurum). Yoksa çizilmez. */
  subtitle: string | null;
  /** Tıklanınca gidilecek uygulama içi rota. */
  href: string;
}

export interface SearchGroup {
  kind: SearchKind;
  label: string;
  items: SearchHit[];
}

export interface SearchResult {
  /** Sunucunun gerçekten aradığı metin — istemci geç gelen cevabı eşler. */
  query: string;
  groups: SearchGroup[];
}

const AUTH_REQUIRED = "Kimlik doğrulama gerekli.";

/** Tür başına en fazla kaç satır döneceği. */
const PER_KIND = 5;

const QuerySchema = z
  .string()
  .trim()
  .min(2, "En az 2 karakter yazın.")
  .max(80, "Arama metni çok uzun.");

/**
 * ILIKE deseni. İki ayrı tuzağı birden kapatır:
 *  • `%` ve `_` ILIKE'ın joker karakterleridir — kullanıcı yazınca "her şeyle
 *    eşleş" anlamına gelir ve arama anlamsızlaşır.
 *  • `,` `(` `)` `"` `\` `*` PostgREST'in `or=(...)` sözdiziminde AYRAÇTIR;
 *    metnin içinde geçerse sorgu ayrıştırma hatasıyla kırılır.
 * İkisini de boşluğa çeviriyoruz: nokta, tire, kesme işareti (e-posta, ürün
 * kodu, "Aslı'nın" gibi) olduğu gibi kalır.
 */
function toPattern(term: string): string | null {
  const safe = term.replace(/[%_,()"\\*]/g, " ").trim();
  if (safe.length < 2) return null;
  return `%${safe}%`;
}

/**
 * Bir sorgunun satırlarını güvenle çıkarır. Hata varsa BOŞ döner: tek bir
 * türün patlaması (henüz uygulanmamış migration, tek seferlik ağ hatası)
 * aramanın tamamını çökertmesin. Şema hatası beklenen bir durumdur, log'a
 * bile yazılmaz; gerçek hatalar sunucu günlüğüne düşer.
 */
function rowsOf<T>(res: { data: unknown; error: unknown }, where: string): T[] {
  const error = res.error as DbLikeError | null;
  if (error) {
    if (!isMissingSchemaError(error)) {
      console.error(`[globalSearch] ${where}:`, error.message ?? error);
    }
    return [];
  }
  return (res.data ?? []) as T[];
}

/** Boş/kısa metinleri atıp tek satırlık alt bilgi kurar. */
function subtitleOf(...parts: (string | null | undefined)[]): string | null {
  const clean = parts.map((p) => (p ?? "").trim()).filter((p) => p.length > 0);
  return clean.length ? clean.join(" · ") : null;
}

/** Uzun serbest metinleri (konu metni gibi) tek satırlık başlığa indirger. */
function oneLine(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

type TaskRow = { id: string; title: string; due_date: string | null };
type TopicRow = {
  id: string;
  text: string | null;
  meeting_id: string;
  due_date: string | null;
  planning_meetings: { meeting_date: string; title: string | null } | { meeting_date: string; title: string | null }[] | null;
};
type DocRow = { id: string; title: string; updated_at: string };
type SheetRow = { id: string; title: string; updated_at: string };
type ContactRow = { id: string; name: string; organization: string | null; segment: string | null };
type ProductionRow = { id: string; title: string; product_code: string | null; season: string | null };

/** Gömülü ilişki tek kayıt da dizi de dönebilir (PostgREST). */
function firstOf<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function globalSearch(q: string): Promise<SearchResult | { error: string }> {
  const parsed = QuerySchema.safeParse(q);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const term = parsed.data;
  const like = toPattern(term);
  // Yalnız joker/ayraç karakterlerinden oluşan metin → arama yapılmaz.
  if (!like) return { query: term, groups: [] };

  /* Aynı üyelik kapısı: oturum + çalışma alanı. Uygulamanın her modül
     sayfasında kullanılan desen; istek başına önbellekli olduğu için kabuk
     zaten çekmişse ikinci bir tur atılmaz. */
  const { supabase, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate !== "ok" || !workspaceId) return { error: AUTH_REQUIRED };

  /* GÖREVLER. Silinen/arşivlenen görünmez. Yönetici olmayan `admin_only`
     görevleri göremez — RLS de aynı kuralı uyguluyor, burada tekrar etmemizin
     sebebi kuralın sorguda da OKUNUR olması (bkz. app/(app)/list/page.tsx). */
  const tasksQuery = supabase
    .from("tasks")
    .select("id, title, due_date")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .neq("status", "archived")
    .or(`title.ilike.${like},description.ilike.${like}`)
    .order("updated_at", { ascending: false })
    .limit(PER_KIND);
  if (!isAdmin) tasksQuery.eq("visibility", "workspace");

  /* TOPLANTI KONULARI. Konunun kendi sayfası yok; takvimin GÜN görünümüne
     gidilir, o yüzden toplantının tarihi de çekilir (`!inner`: tarihi
     okunamayan konu zaten bir yere bağlanamaz). */
  const topicsQuery = supabase
    .from("planning_topics")
    .select("id, text, meeting_id, due_date, planning_meetings!inner(meeting_date, title)")
    .eq("workspace_id", workspaceId)
    .ilike("text", like)
    .order("created_at", { ascending: false })
    .limit(PER_KIND);

  // AF TEAMWORK — yazılar (operation_documents) ve tablolar (operation_spreadsheets).
  const docsQuery = supabase
    .from("operation_documents")
    .select("id, title, updated_at")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .or(`title.ilike.${like},description.ilike.${like}`)
    .order("updated_at", { ascending: false })
    .limit(PER_KIND);

  const sheetsQuery = supabase
    .from("operation_spreadsheets")
    .select("id, title, updated_at")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .or(`title.ilike.${like},description.ilike.${like}`)
    .order("updated_at", { ascending: false })
    .limit(PER_KIND);

  /* CRM KİŞİLERİ. `kind = 'external'` ŞART: CRM ekranı yalnız dış ilişkileri
     listeler (ekip kayıtları oraya girmez). Filtresiz arasaydık, tıklanınca
     kişinin GÖRÜNMEDİĞİ bir kutuya düşen ölü satırlar üretirdik. */
  const contactsQuery = supabase
    .from("workspace_contacts")
    .select("id, name, organization, segment")
    .eq("workspace_id", workspaceId)
    .eq("kind", "external")
    .or(`name.ilike.${like},organization.ilike.${like},email.ilike.${like}`)
    .order("name")
    .limit(PER_KIND);

  // ÜRETİM FÖYLERİ — ada ve ürün koduna göre (föy çoğu zaman kodla anılır).
  const productionQuery = supabase
    .from("production_sheets")
    .select("id, title, product_code, season")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .or(`title.ilike.${like},product_code.ilike.${like}`)
    .order("updated_at", { ascending: false })
    .limit(PER_KIND);

  // Altı sorgu TEK turda paralel gider — arama katmanı yazarken bekliyor.
  const [tasksRes, topicsRes, docsRes, sheetsRes, contactsRes, productionRes] = await Promise.all([
    tasksQuery,
    topicsQuery,
    docsQuery,
    sheetsQuery,
    contactsQuery,
    productionQuery,
  ]);

  const groups: SearchGroup[] = [];

  const tasks = rowsOf<TaskRow>(tasksRes, "tasks").map<SearchHit>((t) => ({
    key: `task:${t.id}`,
    kind: "task",
    title: t.title,
    subtitle: t.due_date ? formatDateOnlyTR(t.due_date) : null,
    href: `/tasks/${t.id}`,
  }));
  if (tasks.length) groups.push({ kind: "task", label: "Görevler", items: tasks });

  const topics = rowsOf<TopicRow>(topicsRes, "planning_topics")
    .map<SearchHit | null>((t) => {
      const meeting = firstOf(t.planning_meetings);
      if (!meeting) return null;
      const day = meeting.meeting_date.slice(0, 10);
      return {
        key: `topic:${t.id}`,
        kind: "topic",
        title: oneLine(t.text ?? ""),
        subtitle: subtitleOf(meeting.title, formatDateOnlyTR(day)),
        // Konunun kendi rotası yok → takvimin O GÜNKÜ görünümü.
        href: `/planning?v=gun&d=${day}`,
      };
    })
    .filter((h): h is SearchHit => h !== null && h.title.length > 0);
  if (topics.length) groups.push({ kind: "topic", label: "Toplantı konuları", items: topics });

  /* AF Teamwork tek grup ama İKİ tablodan besleniyor. Sırayla eklersek
     (önce yazılar, sonra tablolar) beş yazı bulunduğunda hiçbir tablo
     görünmez; onun yerine dönüşümlü diziyoruz — iki tür de temsil edilir. */
  const docs = rowsOf<DocRow>(docsRes, "operation_documents").map<SearchHit>((d) => ({
    key: `doc:${d.id}`,
    kind: "teamwork",
    title: d.title,
    subtitle: "Yazı",
    href: `/documents/${d.id}`,
  }));
  const sheets = rowsOf<SheetRow>(sheetsRes, "operation_spreadsheets").map<SearchHit>((s) => ({
    key: `sheet:${s.id}`,
    kind: "teamwork",
    title: s.title,
    subtitle: "Tablo",
    href: `/sheets/${s.id}`,
  }));
  const teamwork: SearchHit[] = [];
  const teamworkDepth = Math.max(docs.length, sheets.length);
  for (let i = 0; i < teamworkDepth && teamwork.length < PER_KIND; i++) {
    const doc = docs[i];
    if (doc) teamwork.push(doc);
    const sheet = sheets[i];
    if (sheet && teamwork.length < PER_KIND) teamwork.push(sheet);
  }
  if (teamwork.length) groups.push({ kind: "teamwork", label: "AF Teamwork dosyaları", items: teamwork });

  const contacts = rowsOf<ContactRow>(contactsRes, "workspace_contacts").map<SearchHit>((c) => ({
    key: `contact:${c.id}`,
    kind: "contact",
    title: c.name,
    subtitle: subtitleOf(c.organization, segmentLabel(c.segment)),
    // CRM'in girişi kutucuk ızgarası; `?k=` doğrudan kişinin kutusunu açar.
    href: `/crm?k=${crmCategoryOfSegment(c.segment).key}`,
  }));
  if (contacts.length) groups.push({ kind: "contact", label: "CRM kişileri", items: contacts });

  const production = rowsOf<ProductionRow>(productionRes, "production_sheets").map<SearchHit>((p) => ({
    key: `production:${p.id}`,
    kind: "production",
    title: p.title,
    subtitle: subtitleOf(p.product_code, p.season),
    href: `/production/${p.id}`,
  }));
  if (production.length) groups.push({ kind: "production", label: "Üretim föyleri", items: production });

  return { query: term, groups };
}
