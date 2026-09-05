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
 * Formüller DEĞER olarak yazılır. Uygulamanın formül dili Türkçe adları da
 * kabul ediyor (TOPLA, EĞER…); bunları Excel'e formül diye yazmak dosyayı
 * bozardı. Hesaplanmış sonuç her yerde doğru açılır.
 */
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireModuleMember } from "@/lib/modules/context";
import { logWorkspaceActivity, WORKSPACE_ACTIONS } from "@/lib/activity/log-workspace-activity";
import {
  fromLegacy, emptyWorkbook, activeSheet, mergesOf, colWidth, rowHeight,
  DEFAULT_COL_W, ROW_H, key, type Sheet, type CellStyle,
} from "@/lib/sheets/model";
import { evaluateSheet, isError, type Scalar } from "@/lib/sheets/formula";
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
    if (!cell || (!cell.v && !cell.f && !cell.s)) continue;
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

function csvEscape(value: string): string {
  return /[",;\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

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
    .select("id, title, snapshot")
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

  const row = data as { id: string; title: string; snapshot: unknown };
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

  const base = (row.title || "tablo").replace(/[\\/:*?"<>|]+/g, "-").trim() || "tablo";
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

  wb.sheets.forEach((sheet, index) => {
    // Excel sayfa adı: 31 karakter ve : \ / ? * [ ] yasak.
    const safeName =
      (sheet.name || `Sayfa${index + 1}`).replace(/[:\\/?*[\]]/g, " ").slice(0, 31).trim()
      || `Sayfa${index + 1}`;
    const ws = book.addWorksheet(safeName);
    const values = evaluateSheet(wb, sheet);
    const { rows, cols } = usedRange(sheet);

    for (let c = 0; c < Math.max(cols, 1); c++) {
      // px → Excel karakter genişliği (≈ 7px/karakter + 5px kenar boşluğu).
      ws.getColumn(c + 1).width = Math.max(4, ((colWidth(sheet, c) || DEFAULT_COL_W) - 5) / 7);
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
        if (v !== null) target.value = v;
        if (!style && v === null) continue;

        const fmt = numFmtOf(style);
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

        const horizontal = alignOf(raw, style);
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
