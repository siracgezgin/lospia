import { NextResponse } from "next/server";
import { createClient, getAuthUser, getMembership } from "@/lib/supabase/server";
import { canManageSettings } from "@/lib/auth/permissions";
import {
  BACKUP_BUCKETS,
  EXCLUDED_TABLES,
  collectWorkspaceData,
  listBucketFiles,
  rowsToCsv,
  type StorageFile,
  type TableResult,
} from "@/lib/backup/collect";
import { createZipStream, textEntry, type ZipEntry } from "@/lib/backup/zip";
import type { WorkspaceRole } from "@/types";

/**
 * YEDEK İNDİRME — /api/backup  (yalnız yönetici)
 *
 * Sıraç (2026-08-29): "Bütün sisteme eklenen şeylerin ayarlar kısmına yedek
 * tarzı bir şey yazman lazım; haftada bir bu yedeği alıp indirmemiz gerekiyor
 * ki sistemde olan şeyler yanımızda kaybolmasın."
 *
 * Tek tık, tek dosya: çalışma alanının bütün kayıtları hem JSON (geri yükleme
 * için) hem CSV (Excel'de açmak için), istenirse yüklenen dosyalarla birlikte.
 *
 * ?files=1  → depolamadaki dosyalar da arşive girer (büyük ve yavaş olabilir).
 *
 * zlib ve dosya indirmeleri Node API'leri istediği için Edge'de değil Node
 * çalışma zamanında koşar. Yanıt AKIŞ hâlindedir: arşiv belleğe toplanmaz,
 * üretildikçe tarayıcıya iner.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Dosyalı yedek büyük olabilir — platform izin verdiği kadar uzun sürsün. */
export const maxDuration = 300;

/** Dosyalı yedek için üst sınır: ZIP64 yazmıyoruz, 4 GB'a yaklaşılmamalı. */
const FILE_BUDGET_BYTES = 1_500_000_000;

/** Hata mesajı — anahtar/oturum bilgisi taşımayan düz metin. */
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Hata yanıtı — indirme, Ayarlar'daki düğmeden düz bir GEZİNME ile başlar
 * (fetch değil, bkz. components/settings/BackupPanel). Bu yüzden hata JSON
 * dönerse kullanıcı süslü parantezlerle dolu bir sayfada kalırdı. Tarayıcı
 * HTML istiyorsa Türkçe, geri dönüş bağlantısı olan küçük bir sayfa döner;
 * makine çağrıları (curl, izleme) JSON almaya devam eder.
 */
function fail(request: Request, status: number, code: string, mesaj: string): Response {
  const wantsHtml = (request.headers.get("accept") ?? "").includes("text/html");
  if (!wantsHtml) {
    return NextResponse.json({ error: code, mesaj }, { status });
  }
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Yedek alınamadı</title>
<style>
  :root { color-scheme: light dark; --bg:#faf9f7; --ink:#1c1b19; --muted:#57534e; --btn:#1c1b19; --btn-ink:#ffffff; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#17161a; --ink:#f4f3f1; --muted:#a8a29e; --btn:#f4f3f1; --btn-ink:#17161a; }
  }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:var(--bg); color:var(--ink); font: 15px/1.6 ui-sans-serif, system-ui, sans-serif; padding:24px; }
  main { max-width:34rem; }
  h1 { font-size:1.15rem; margin:0 0 .5rem; }
  p { margin:0 0 1.25rem; color:var(--muted); }
  a { display:inline-block; padding:.6rem 1rem; border-radius:.65rem; background:var(--btn); color:var(--btn-ink);
      text-decoration:none; min-height:40px; box-sizing:border-box; }
</style></head><body><main>
<h1>Yedek alınamadı</h1>
<p>${escapeHtml(mesaj)}</p>
<a href="/settings">Ayarlar'a dön</a>
</main></body></html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) {
    return fail(request, 401, "unauthorized", "Oturum bulunamadı. Yeniden giriş yapın.");
  }

  const membership = await getMembership(user.id);
  const workspaceId = membership?.workspace_id;
  const role = (membership?.role ?? "member") as WorkspaceRole;
  if (!workspaceId) {
    return fail(request, 403, "no_workspace", "Bir çalışma alanına bağlı değilsiniz.");
  }
  if (!canManageSettings(role)) {
    return fail(request, 403, "forbidden", "Yedek almak yalnız yöneticiye açıktır.");
  }

  const withFiles = new URL(request.url).searchParams.get("files") === "1";
  const supabase = await createClient();

  // Veri her hâlükârda toplanır (küçük ve hızlı); dosyalar yalnız istenirse.
  // Toplama sırasındaki bir çöküş, akış BAŞLAMADAN yakalanır: kullanıcı bozuk
  // bir .zip yerine Türkçe bir hata görür (akış başladıktan sonra artık HTTP
  // durumu değiştirilemez — bu yüzden burada yakalanması şart).
  let tables: TableResult[];
  try {
    tables = await collectWorkspaceData(supabase, workspaceId);
  } catch (error) {
    console.error("[backup] veri toplanamadı:", message(error));
    return fail(
      request,
      500,
      "collect_failed",
      "Yedek verisi okunamadı. Birazdan tekrar deneyin.",
    );
  }

  let files: StorageFile[] = [];
  let truncated = false;
  const bucketErrors: Record<string, string> = {};
  if (withFiles) {
    let budget = FILE_BUDGET_BYTES;
    for (const bucket of BACKUP_BUCKETS) {
      try {
        const res = await listBucketFiles(supabase, bucket, budget);
        if (res.error) bucketErrors[bucket] = res.error;
        if (res.truncated) truncated = true;
        files = files.concat(res.files);
        budget -= res.files.reduce((n, f) => n + f.size, 0);
      } catch (error) {
        // Tek bir kova listelenemedi diye yedeğin tamamı iptal olmaz; hangi
        // kovanın atlandığı OKUBENI ve ozet.json'a yazılır.
        bucketErrors[bucket] = message(error);
        console.error(`[backup] "${bucket}" kovası listelenemedi:`, bucketErrors[bucket]);
      }
      if (budget <= 0) {
        truncated = true;
        break;
      }
    }
  }

  const takenAt = new Date();
  const stamp = takenAt.toISOString().slice(0, 16).replace("T", "_").replace(":", "");
  const wsName = (tables.find((t) => t.table === "workspaces")?.rows[0]?.name as string) ?? "workspace";

  const rowTotal = tables.reduce((n, t) => n + t.rows.length, 0);
  /* Okunamayan tablolar SESSİZ KALMAMALI: yedeğin değeri "eksiksiz olduğunu
     bilmek"tir. Hem sunucu günlüğüne, hem arşivin ilk sayfasına yazılır. */
  const failedTables = tables.filter((t) => t.error);
  if (failedTables.length > 0) {
    console.error(
      "[backup] okunamayan tablolar:",
      failedTables.map((t) => `${t.table}: ${t.error}`).join(" | "),
    );
  }

  /* HİÇBİR tablo okunamadıysa (veritabanı erişilemiyor, oturum düştü) ortada
     yedek yoktur. Böyle bir durumda boş ama geçerli görünen bir .zip indirmek
     en tehlikeli sonuçtur: kullanıcı "yedeğim var" sanır. Arşiv üretilmez,
     hata döner. */
  if (tables.length > 0 && failedTables.length === tables.length) {
    return fail(
      request,
      500,
      "collect_failed",
      "Hiçbir tablo okunamadı; boş bir yedek indirilmedi. Birazdan tekrar deneyin.",
    );
  }

  const manifest = {
    alinma_zamani: takenAt.toISOString(),
    calisma_alani: { id: workspaceId, ad: wsName },
    alan_kisi: { id: user.id, eposta: user.email ?? null, rol: role },
    kapsam: withFiles ? "veri + dosyalar" : "yalnız veri",
    tablolar: tables.map((t) => ({ tablo: t.table, satir: t.rows.length, hata: t.error ?? null })),
    okunamayan_tablolar: failedTables.map((t) => ({ tablo: t.table, hata: t.error ?? null })),
    kapsam_disi_tablolar: EXCLUDED_TABLES.map((t) => ({ tablo: t.table, neden: t.reason })),
    toplam_satir: rowTotal,
    dosyalar: withFiles
      ? { adet: files.length, bayt: files.reduce((n, f) => n + f.size, 0), kova_hatalari: bucketErrors, kesildi: truncated }
      : null,
  };

  const warnings: string[] = [];
  if (failedTables.length > 0) {
    warnings.push(
      `UYARI: ${failedTables.length} tablo okunamadı, bu yedek EKSİKTİR:`,
      ...failedTables.map((t) => `  · ${t.table} — ${t.error}`),
      `Yedeği tekrar alın; sorun sürerse ozet.json'daki mesajı iletin.`,
      ``,
    );
  }
  if (Object.keys(bucketErrors).length > 0) {
    warnings.push(
      `UYARI: bazı dosya kovaları listelenemedi:`,
      ...Object.entries(bucketErrors).map(([b, e]) => `  · ${b} — ${e}`),
      ``,
    );
  }
  if (truncated) {
    warnings.push(
      `UYARI: dosya boyutu sınırına ulaşıldı; arşivdeki dosya listesi eksik.`,
      `       ozet.json içindeki "kesildi" alanına bakın.`,
      ``,
    );
  }

  const readme = [
    `AF OPERASYON — YEDEK`,
    `Çalışma alanı : ${wsName}`,
    `Alınma zamanı : ${takenAt.toLocaleString("tr-TR")}`,
    `Kapsam        : ${manifest.kapsam}`,
    `Kayıt         : ${tables.length} tablo · ${rowTotal} satır`,
    ``,
    ...(warnings.length > 0 ? [...warnings] : [`Durum         : eksiksiz, uyarı yok.`, ``]),
    `KLASÖRLER`,
    `  veri/     Her tablonun tam JSON dökümü. Geri yükleme bunlardan yapılır.`,
    `  tablo/    Aynı kayıtların CSV hâli — Excel'de çift tıkla açılır.`,
    withFiles ? `  dosyalar/ Sisteme yüklenmiş dosyalar, kova adına göre klasörlenmiş.` : `  (Bu yedek dosyaları içermez — "Dosyalarla birlikte" seçeneğiyle alınır.)`,
    `  ozet.json Ne alındığının dökümü: tablo tablo satır sayıları.`,
    ``,
    `NELER YEDEKLENMEZ`,
    ...EXCLUDED_TABLES.map((t) => `  ${t.table.padEnd(22)} ${t.reason}`),
    `  Hepsi türetilmiş veridir; bildirimler ayrıca kişiye özeldir ve yedeği`,
    `  alan kişinin göreceği kadarı dosyaya eksik bir liste olarak girerdi.`,
    ``,
    `SAKLAMA`,
    `  Bu dosyayı sistemin dışında bir yerde saklayın (harici disk ya da başka`,
    `  bir bulut hesabı). Yedeğin amacı, sistemin kendisi kaybolduğunda elde`,
    `  kalan kopya olmaktır.`,
  ].join("\n");

  async function* entries(): AsyncGenerator<ZipEntry> {
    yield textEntry("OKUBENI.txt", readme);
    yield textEntry("ozet.json", JSON.stringify(manifest, null, 2));

    for (const t of tables) {
      yield textEntry(`veri/${t.table}.json`, JSON.stringify(t.rows, null, 2));
      if (t.rows.length > 0) {
        // BOM: Excel Türkçe karakterleri ancak bununla doğru açıyor.
        yield textEntry(`tablo/${t.table}.csv`, "﻿" + rowsToCsv(t.rows));
      }
    }

    const skippedFiles: string[] = [];
    for (const f of files) {
      // Tek bir dosya inmediği için arşiv bozulmaz; atlananlar sonda listelenir.
      try {
        const { data, error } = await supabase.storage.from(f.bucket).download(f.path);
        if (error || !data) {
          skippedFiles.push(`${f.bucket}/${f.path} — ${error?.message ?? "içerik boş"}`);
          continue;
        }
        const buf = new Uint8Array(await data.arrayBuffer());
        yield { name: `dosyalar/${f.bucket}/${f.path}`, data: buf };
      } catch (error) {
        skippedFiles.push(`${f.bucket}/${f.path} — ${message(error)}`);
      }
    }
    if (skippedFiles.length > 0) {
      console.error(`[backup] ${skippedFiles.length} dosya indirilemedi`);
      yield textEntry(
        "dosyalar/INDIRILEMEYENLER.txt",
        [
          "Bu dosyalar depolamadan alınamadı ve arşive girmedi:",
          "",
          ...skippedFiles.map((s) => `  · ${s}`),
        ].join("\n"),
      );
    }
  }

  /* Yedek KAYDI — "en son ne zaman yedek aldık?" sorusunun cevabı. Akış
     başlamadan önce yazılır; tablo henüz migrate edilmemişse indirme yine de
     çalışır (kayıt sunucuya loglanır, yedeğin kendisi asla buna takılmaz).
     Kayıt yazılamazsa Ayarlar'daki "7 günden eski yedek" uyarısı yanlış kalır,
     bu yüzden sessiz geçilmez. */
  try {
    const { error: logError } = await supabase.from("workspace_backups").insert({
      workspace_id: workspaceId,
      created_by: user.id,
      kind: withFiles ? "full" : "data",
      table_count: tables.length,
      row_count: rowTotal,
      file_count: files.length,
      byte_size: files.reduce((n, f) => n + f.size, 0),
    });
    if (logError) console.error("[backup] yedek kaydı yazılamadı:", logError.message);
  } catch (error) {
    console.error("[backup] yedek kaydı yazılamadı:", message(error));
  }

  const fileName = `af-operasyon-yedek-${stamp}${withFiles ? "-dosyalarla" : ""}.zip`;

  return new Response(createZipStream(entries()), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${fileName}"`,
      "cache-control": "no-store",
    },
  });
}
