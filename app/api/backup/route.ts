import { NextResponse } from "next/server";
import { createClient, getAuthUser, getMembership } from "@/lib/supabase/server";
import { canManageSettings } from "@/lib/auth/permissions";
import {
  BACKUP_BUCKETS,
  collectWorkspaceData,
  listBucketFiles,
  rowsToCsv,
  type StorageFile,
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

export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const membership = await getMembership(user.id);
  const workspaceId = membership?.workspace_id;
  const role = (membership?.role ?? "member") as WorkspaceRole;
  if (!workspaceId) return NextResponse.json({ error: "no_workspace" }, { status: 403 });
  if (!canManageSettings(role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const withFiles = new URL(request.url).searchParams.get("files") === "1";
  const supabase = await createClient();

  // Veri her hâlükârda toplanır (küçük ve hızlı); dosyalar yalnız istenirse.
  const tables = await collectWorkspaceData(supabase, workspaceId);

  let files: StorageFile[] = [];
  let truncated = false;
  const bucketErrors: Record<string, string> = {};
  if (withFiles) {
    let budget = FILE_BUDGET_BYTES;
    for (const bucket of BACKUP_BUCKETS) {
      const res = await listBucketFiles(supabase, bucket, budget);
      if (res.error) bucketErrors[bucket] = res.error;
      if (res.truncated) truncated = true;
      files = files.concat(res.files);
      budget -= res.files.reduce((n, f) => n + f.size, 0);
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
  const manifest = {
    alinma_zamani: takenAt.toISOString(),
    calisma_alani: { id: workspaceId, ad: wsName },
    alan_kisi: { id: user.id, eposta: user.email ?? null, rol: role },
    kapsam: withFiles ? "veri + dosyalar" : "yalnız veri",
    tablolar: tables.map((t) => ({ tablo: t.table, satir: t.rows.length, hata: t.error ?? null })),
    toplam_satir: rowTotal,
    dosyalar: withFiles
      ? { adet: files.length, bayt: files.reduce((n, f) => n + f.size, 0), kova_hatalari: bucketErrors, kesildi: truncated }
      : null,
  };

  const readme = [
    `AF OPERASYON — YEDEK`,
    `Çalışma alanı : ${wsName}`,
    `Alınma zamanı : ${takenAt.toLocaleString("tr-TR")}`,
    `Kapsam        : ${manifest.kapsam}`,
    ``,
    `KLASÖRLER`,
    `  veri/     Her tablonun tam JSON dökümü. Geri yükleme bunlardan yapılır.`,
    `  tablo/    Aynı kayıtların CSV hâli — Excel'de çift tıkla açılır.`,
    withFiles ? `  dosyalar/ Sisteme yüklenmiş dosyalar, kova adına göre klasörlenmiş.` : `  (Bu yedek dosyaları içermez — "Dosyalarla birlikte" seçeneğiyle alınır.)`,
    `  ozet.json Ne alındığının dökümü: tablo tablo satır sayıları.`,
    ``,
    `NELER YEDEKLENMEZ`,
    `  Bildirimler ve teknik kuyruk kayıtları. İkisi de türetilmiş veridir;`,
    `  bildirimler kişiye özeldir ve yedeği alan kişinin göreceği kadarı`,
    `  dosyaya eksik bir liste olarak girerdi.`,
    ``,
    `SAKLAMA`,
    `  Bu dosyayı sistemin dışında bir yerde saklayın (harici disk ya da başka`,
    `  bir bulut hesabı). Yedeğin amacı, sistemin kendisi kaybolduğunda elde`,
    `  kalan kopya olmaktır.`,
    truncated ? `\nUYARI: dosya boyutu sınırına ulaşıldı; arşivdeki dosya listesi eksik.\n       ozet.json içindeki "kesildi" alanına bakın.` : ``,
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

    for (const f of files) {
      const { data, error } = await supabase.storage.from(f.bucket).download(f.path);
      if (error || !data) continue; // erişilemeyen dosya arşivi bozmasın
      const buf = new Uint8Array(await data.arrayBuffer());
      yield { name: `dosyalar/${f.bucket}/${f.path}`, data: buf };
    }
  }

  /* Yedek KAYDI — "en son ne zaman yedek aldık?" sorusunun cevabı. Akış
     başlamadan önce yazılır; tablo henüz migrate edilmemişse indirme yine de
     çalışır (kayıt sessizce atlanır, yedeğin kendisi asla buna takılmaz). */
  await supabase.from("workspace_backups").insert({
    workspace_id: workspaceId,
    created_by: user.id,
    kind: withFiles ? "full" : "data",
    table_count: tables.length,
    row_count: rowTotal,
    file_count: files.length,
    byte_size: files.reduce((n, f) => n + f.size, 0),
  });

  const fileName = `af-operasyon-yedek-${stamp}${withFiles ? "-dosyalarla" : ""}.zip`;

  return new Response(createZipStream(entries()), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${fileName}"`,
      "cache-control": "no-store",
    },
  });
}
