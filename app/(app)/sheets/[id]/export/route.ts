/**
 * Tablo → dosya indirme.  GET /sheets/[id]/export?format=xlsx|csv
 *
 * Sıraç (2026-09-05): "excel artık excel gibi … çalışmalı." Ekranda Excel gibi
 * davranan bir tablo, Excel'de açılabilmelidir; aksi hâlde veri uygulamanın
 * içinde hapis kalıyor. Üretim Föyü'ndeki indirme rotasının aynı deseni:
 * erişim requireModuleMember ile korunur, satır her zaman kullanıcının
 * çalışma alanıyla eşleştirilir (RLS ayrıca kısıtlar), indirme günlüğe yazılır.
 *
 * xlsx: BÜTÜN sayfalar (sekmeler) ayrı sayfa olarak yazılır; biçim (kalın /
 * italik / renk / kenarlık / hizalama / sayı biçimi), sütun genişlikleri,
 * satır yükseklikleri, birleştirmeler ve dondurulmuş başlık satırı korunur.
 * csv: yalnız ETKİN sayfa — CSV tek ızgaradır, biçim taşımaz.
 *
 * Formüller FORMÜL olarak yazılır (sonucuyla birlikte). Uygulamanın formül
 * dili Türkçe adları, noktalı virgülü ve ondalık virgülü kabul ediyor;
 * dosyaya Excel'in kendi diline çevrilerek girer (bkz. toExcelFormula).
 * Çevrilemeyen formül (tanınmayan ad, #BAŞV!) DEĞER olarak iner — yanlış
 * formül yazmaktansa doğru sayı. Eskiden hepsi değerdi: Excel'de açılan
 * tabloda toplamlar donuk sayıydı.
 *
 * Tarihler TARİH olarak yazılır: panelde "12.03.2026" metni duran hücre
 * Excel'de gerçek tarih hücresidir (sıralanır, süzülür, hesaba girer).
 */
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireModuleMember } from "@/lib/modules/context";
import { logWorkspaceActivity, WORKSPACE_ACTIONS } from "@/lib/activity/log-workspace-activity";
import {
  fromLegacy, emptyWorkbook, activeSheet, mergesOf, colWidth, rowHeight,
  DEFAULT_COL_W, ROW_H, key, type Sheet, type CellStyle,
} from "@/lib/sheets/model";
import { evaluateSheet, isError, toExcelFormula, type Scalar } from "@/lib/sheets/formula";
import { formatValue, alignOf } from "@/lib/sheets/format";

export const dynamic = "force-dynamic";

/** "#fde68a" → "FFFDE68A" (ExcelJS ARGB). Tanınmayan değer atlanır. */
function argb(hex?: string): string | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  return m ? `FF${m[1].toUpperCase()}` : null;
}

function numFmtOf(style: CellStyle | undefined): string | null {
  const d = Math.max(0, Math.min(6, style?.d ?? -1));
  const dec = (fallback: number) => {
    const n = style?.d === undefined ? fallback : d;
    return n > 0 ? `.${"0".repeat(n)}` : "";
  };
  switch (style?.n) {
    case "money": return `#,##0${dec(2)} "₺"`;
    case "percent": return `0${dec(0)}%`;
    case "number": return `#,##0${dec(0)}`;
    case "date": return "dd.mm.yyyy";
    case "text": return "@";
    default: return null;
  }
}

/** Dolu hücrelerin ve birleştirmelerin sardığı en geniş dikdörtgen. */
function usedRange(sheet: Sheet): { rows: number; cols: number } {
  let maxR = -1;
  let maxC = -1;
  for (const k of Object.keys(sheet.cells)) {
    const [r, c] = k.split(":").map(Number);
    const cell = sheet.cells[k];
    if (!Number.isFinite(r) || !Number.isFinite(c)) continue;
    /* Yalnız GÖRSEL taşıyan hücre de kullanılan alandır — yoksa son satırdaki
       fotoğraf dışa aktarımın dışında kalır. */
    if (!cell || (!cell.v && !cell.f && !cell.s && !cell.img)) continue;
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }
  for (const m of mergesOf(sheet)) {
    if (m.r2 > maxR) maxR = m.r2;
    if (m.c2 > maxC) maxC = m.c2;
  }
  return {
    rows: Math.min(sheet.rows, maxR + 1),
    cols: Math.min(sheet.cols, maxC + 1),
  };
}

/** Skaler → ExcelJS hücre değeri. Sayı sayı kalır; hata/boolean metin olur. */
function cellValue(raw: Scalar, style: CellStyle | undefined): string | number | null {
  if (raw === "" || raw === null || raw === undefined) return null;
  if (isError(raw)) return String(raw);
  if (typeof raw === "boolean") return raw ? "DOĞRU" : "YANLIŞ";
  if (typeof raw === "number") {
    // "Metin" biçimi seçilmişse sayı da metin olarak dışarı çıkar.
    return style?.n === "text" ? String(raw) : raw;
  }
  return raw;
}

/** "12.03.2026" / "12/03/2026" → UTC gece yarısı; geçersiz tarih null.
 *  "Metin" biçimli hücre ve iki haneli yıl çevrilmez. */
function dateOf(raw: Scalar, style: CellStyle | undefined): Date | null {
  if (typeof raw !== "string" || style?.n === "text") return null;
  if (style?.n !== undefined && style.n !== "auto" && style.n !== "date") return null;
  const m = /^\s*(\d{1,2})[./](\d{1,2})[./](\d{4})\s*$/.exec(raw);
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
  if (y < 1900 || y > 9999) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null;
}

/** Formülün dosyadaki önbellek sonucu. Hata değeri Excel'in diline çevrilir. */
const XL_ERRORS: Record<string, string> = {
  "#BÖL/0!": "#DIV/0!", "#AD?": "#NAME?", "#DEĞER!": "#VALUE!", "#BAŞV!": "#REF!", "#DÖNGÜ!": "#REF!", "#YOK": "#N/A",
};
function formulaResult(raw: Scalar): ExcelJS.CellFormulaValue["result"] {
  if (raw === "" || raw === null || raw === undefined) return "";
  if (isError(raw)) return { error: (XL_ERRORS[raw] ?? "#VALUE!") as ExcelJS.CellErrorValue["error"] };
  return raw;
}

function csvEscape(value: string): string {
  return /[",;\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const IMAGE_BUCKET = "documents";
/** Tek dosyaya gömülecek en çok görsel — bellek ve süre sınırı. */
const EXPORT_IMAGE_LIMIT = 300;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const format = new URL(req.url).searchParams.get("format") === "csv" ? "csv" : "xlsx";

  const { supabase, user, workspaceId, gate } = await requireModuleMember();
  if (gate !== "ok" || !workspaceId || !user) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("operation_spreadsheets")
    .select("id, title, snapshot, updated_at")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Tablo okunamadı. Lütfen tekrar deneyin." },
      { status: 500 },
    );
  }
  if (!data) return NextResponse.json({ error: "Tablo bulunamadı." }, { status: 404 });

  const row = data as { id: string; title: string; snapshot: unknown; updated_at: string | null };
  const wb = fromLegacy(row.snapshot) ?? emptyWorkbook();

  // İndirme günlüğe yazılır — dosya sistemin dışına çıkıyor. Günlük
  // yazılamazsa indirme yine de sürer.
  await logWorkspaceActivity(supabase, {
    workspaceId,
    actorId: user.id,
    action: WORKSPACE_ACTIONS.SHEET_DOWNLOADED,
    entityType: "spreadsheet",
    entityId: row.id,
    entityLabel: row.title,
    metadata: { format },
  });

  /* DOSYA ADINDA TABLONUN SON DEĞİŞİKLİK ZAMANI. Ad yalnız tablo başlığıydı;
     aynı tablo ikinci kez indirilince tarayıcı üzerine yazmayıp "… (1).xlsx"
     diye kaydediyor, kullanıcı İndirilenler klasöründe eski kopyayı açıp
     "güncel şeklinde indirmiyor" diyordu. Damga tablonun KENDİ zamanı olduğu
     için değişmeyen tablo tekrar indirilince ad da değişmez. Saat İstanbul'dur
     (sunucu UTC) ve ":" yerine "." yazar — Windows'ta iki nokta yasak. */
  const at = new Date(row.updated_at ?? "");
  const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" })
    .format(Number.isNaN(at.getTime()) ? new Date() : at).replace(":", ".");
  const title = (row.title || "tablo").replace(/[\\/:*?"<>|]+/g, "-").trim() || "tablo";
  const base = `${title} ${stamp}`;
  const ext = format === "csv" ? "csv" : "xlsx";
  const asciiName = `${base.replace(/[^\x20-\x7E]/g, "_")}.${ext}`;
  const utf8Name = encodeURIComponent(`${base}.${ext}`);
  const disposition = `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`;

  if (format === "csv") {
    const sheet = activeSheet(wb);
    const values = evaluateSheet(wb, sheet);
    const { rows, cols } = usedRange(sheet);
    const lines: string[] = [];
    for (let r = 0; r < rows; r++) {
      const cells: string[] = [];
      for (let c = 0; c < cols; c++) {
        const raw = values.get(key(r, c)) ?? "";
        cells.push(csvEscape(formatValue(raw, sheet.cells[key(r, c)]?.s)));
      }
      lines.push(cells.join(";"));
    }
    // BOM: Excel Türkçe karakterleri UTF-8 olarak tanısın.
    const body = `﻿${lines.join("\r\n")}`;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": disposition,
        "Cache-Control": "no-store",
      },
    });
  }

  const book = new ExcelJS.Workbook();
  book.created = new Date();
  /* Excel açılışta formülleri KENDİ motoruyla yeniden hesaplasın: dosyadaki
     önbellek sonucu bizim motorumuzun sonucudur. */
  book.calcProperties.fullCalcOnLoad = true;

  // Excel sayfa adı: 31 karakter ve : \ / ? * [ ] yasak. Formüller başka
  // sayfaya bu (temizlenmiş) adla başvurur.
  const used = new Set<string>();
  const safeNames = wb.sheets.map((sheet, index) => {
    const base =
      (sheet.name || `Sayfa${index + 1}`).replace(/[:\\/?*[\]]/g, " ").slice(0, 31).trim()
      || `Sayfa${index + 1}`;
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 28)} ${n}`;
    used.add(name.toLowerCase());
    return name;
  });
  const safeNameOf = (name: string): string | null => {
    const i = wb.sheets.findIndex((x) => x.name.toLocaleLowerCase("tr") === name.toLocaleLowerCase("tr"));
    return i >= 0 ? safeNames[i] : null;
  };

  /* ── GÖRSELLER ───────────────────────────────────────────────────────────
     Dışa aktarılan dosyada fotoğraf YOKTU (17.11.2026 denetimi: 9 ve 30
     görselli iki dosya 0 görselle iniyordu) — ekip tabloyu Excel'e alınca
     ürün fotoğrafları kayboluyordu. Hücre görselin kimliğini tutar; baytlar
     Drive'dan (documents kovası) indirilip dosyaya gömülür. Excel yalnız
     JPEG/PNG/GIF gömer; başka tür (WebP, HEIC) atlanır. */
  const imageIds = new Set<string>();
  for (const sh of wb.sheets) for (const cell of Object.values(sh.cells)) if (cell?.img?.id) imageIds.add(cell.img.id);
  const embedded = new Map<string, number>(); // doküman kimliği → çalışma kitabındaki görsel
  if (imageIds.size > 0) {
    const ids = [...imageIds].slice(0, EXPORT_IMAGE_LIMIT);
    const { data: docs } = await supabase
      .from("operation_documents")
      .select("id, file_path, file_mime, file_name")
      .eq("workspace_id", workspaceId)
      .in("id", ids);
    const queue = [...((docs ?? []) as { id: string; file_path: string | null; file_mime: string | null; file_name: string | null }[])];
    const worker = async () => {
      for (;;) {
        const d = queue.shift();
        if (!d) return;
        const kind = `${d.file_mime ?? ""} ${d.file_name ?? ""}`.toLowerCase();
        const extension = /png/.test(kind) ? "png" : /jpe?g/.test(kind) ? "jpeg" : /gif/.test(kind) ? "gif" : null;
        if (!d.file_path || !extension) continue;
        try {
          const { data: blob } = await supabase.storage.from(IMAGE_BUCKET).download(d.file_path);
          if (!blob) continue;
          const buffer = Buffer.from(await blob.arrayBuffer());
          embedded.set(d.id, book.addImage({ buffer: buffer as unknown as ExcelJS.Buffer, extension }));
        } catch {
          /* Tek görselin indirilememesi dosyayı düşürmez — o hücre görselsiz iner. */
        }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
  }

  wb.sheets.forEach((sheet, index) => {
    const ws = book.addWorksheet(safeNames[index]);
    const values = evaluateSheet(wb, sheet);
    const { rows, cols } = usedRange(sheet);

    for (let c = 0; c < Math.max(cols, 1); c++) {
      /* px → Excel karakter genişliği. İçe aktarım `karakter × 7` kullanıyor;
         burada `(px − 5) / 7` vardı ve dosya her içe-dışa turunda sütun başına
         ~0,7 karakter DARALIYORDU. İkisi artık birbirinin tersi. */
      ws.getColumn(c + 1).width = Math.max(4, (colWidth(sheet, c) || DEFAULT_COL_W) / 7);
    }

    for (let r = 0; r < rows; r++) {
      const h = rowHeight(sheet, r);
      if (h && h !== ROW_H) ws.getRow(r + 1).height = h * 0.75; // px → punto

      for (let c = 0; c < cols; c++) {
        const src = sheet.cells[key(r, c)];
        const style = src?.s;
        const raw = values.get(key(r, c)) ?? "";
        const target = ws.getCell(r + 1, c + 1);

        const v = cellValue(raw, style);
        const xf = src?.f ? toExcelFormula(src.f, safeNameOf) : null;
        const date = xf ? null : dateOf(raw, style);
        if (xf) target.value = { formula: xf, result: formulaResult(raw) } as ExcelJS.CellFormulaValue;
        else if (date) target.value = date;
        else if (v !== null) target.value = v;
        if (!style && v === null && !xf) continue;

        const fmt = date ? "dd.mm.yyyy" : numFmtOf(style);
        if (fmt) target.numFmt = fmt;

        const fg = argb(style?.fg);
        if (style?.b || style?.i || style?.u || fg) {
          target.font = {
            bold: !!style?.b,
            italic: !!style?.i,
            underline: !!style?.u,
            ...(fg ? { color: { argb: fg } } : {}),
          };
        }

        const bg = argb(style?.bg);
        if (bg) {
          target.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
        }

        const horizontal = date && !style?.a ? "right" : alignOf(raw, style);
        if (horizontal !== "left" || style?.w) {
          target.alignment = {
            horizontal,
            vertical: "middle",
            ...(style?.w ? { wrapText: true } : {}),
          };
        }

        if (style?.bd) {
          const edge = { style: "thin" as const, color: { argb: "FFD9DCE1" } };
          target.border = {
            ...(style.bd.includes("t") ? { top: edge } : {}),
            ...(style.bd.includes("l") ? { left: edge } : {}),
            ...(style.bd.includes("b") ? { bottom: edge } : {}),
            ...(style.bd.includes("r") ? { right: edge } : {}),
          };
        }
      }
    }

    for (const m of mergesOf(sheet)) {
      if (m.r1 === m.r2 && m.c1 === m.c2) continue;
      try {
        ws.mergeCells(m.r1 + 1, m.c1 + 1, m.r2 + 1, m.c2 + 1);
      } catch {
        // Çakışan birleştirme dosyayı bozmasın — o hücre birleşmeden çıkar.
      }
    }

    if (sheet.frozen && sheet.frozen > 0) {
      ws.views = [{ state: "frozen", ySplit: sheet.frozen }];
    }

    /* Görseller hücrenin ÜSTÜNE, kapladığı aralık kadar yerleşir (içe
       aktarımdaki cs/rs ile aynı ölçü). Kenardan az pay: çizgiye yapışmasın. */
    for (const [k, cell] of Object.entries(sheet.cells)) {
      const imageId = cell?.img?.id ? embedded.get(cell.img.id) : undefined;
      if (imageId === undefined || !cell?.img) continue;
      const [r, c] = k.split(":").map(Number);
      if (!Number.isFinite(r) || !Number.isFinite(c)) continue;
      const cs = Math.max(1, cell.img.cs ?? 1);
      const rs = Math.max(1, cell.img.rs ?? 1);
      ws.addImage(imageId, {
        tl: { col: c + 0.04, row: r + 0.04 } as ExcelJS.Anchor,
        br: { col: c + cs - 0.04, row: r + rs - 0.04 } as ExcelJS.Anchor,
        editAs: "oneCell",
      });
    }
  });

  const buffer = await book.xlsx.writeBuffer();

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": disposition,
      "Cache-Control": "no-store",
    },
  });
}
