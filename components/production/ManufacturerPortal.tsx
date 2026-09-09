"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Printer, Send } from "lucide-react";
import { addManufacturerNote, type PortalPayload } from "@/lib/actions/manufacturer-portal";
import { Button } from "@/components/ui/Button";
import { Field, TextArea, TextInput } from "@/components/ui/Field";

/**
 * ÜRETİCİNİN GÖRDÜĞÜ EKRAN.
 *
 * Aslı Hanım (2026-09-07): "Üreticiye de bir panel verebilirsin. Çünkü ÜRÜNÜN
 * DETAYLARINI GİRİP buradan alabilir veya direkt mail gidebilir."
 *
 * İki iş yapar: föyü OKUTUR (yazdırılabilir) ve üreticinin DETAY GİRMESİNİ
 * sağlar. Girilen detay föyü değiştirmez — ekip okur, isterse föye işler.
 * Yanlış bir sayı üreticiden gelip sessizce üretim föyüne yazılmamalı.
 *
 * FİYAT YOKTUR. Sunucu tarafındaki fonksiyon birim fiyatı, para birimini ve
 * maliyeti hiç döndürmüyor (mail akışındaki "Fiyat bilgisi gönderilmez"
 * kuralının aynısı) — burada gizlemeye çalışılan bir alan yok, veri hiç
 * gelmiyor.
 */

type Row = { label: string; value: string };

function textRows(sheet: Record<string, unknown>): Row[] {
  const pick = (key: string, label: string): Row | null => {
    const v = sheet[key];
    const s = typeof v === "string" ? v.trim() : "";
    return s ? { label, value: s } : null;
  };
  return [
    pick("product_code", "Ürün kodu"),
    pick("product_kind", "Ürün cinsi"),
    pick("season", "Sezon"),
    pick("production_date", "Üretim tarihi"),
    pick("delivery_date", "Teslim tarihi"),
    pick("meterage", "1 ürüne giden metraj"),
    pick("production_waste", "Üretim fire payı"),
  ].filter((r): r is Row => r !== null);
}

const LONG_FIELDS: { key: string; label: string }[] = [
  { key: "description", label: "Ürünün açıklaması" },
  { key: "fabric_info", label: "Kumaş bilgisi" },
  { key: "fabric_lining", label: "Kumaş / astar" },
  { key: "accessories_info", label: "Aksesuarlar" },
  { key: "embellishments", label: "Süslemeler" },
  { key: "sewing_instruction", label: "Dikiş talimatı" },
  { key: "workmanship_notes", label: "Özel işçilik notları" },
  { key: "wash_instruction", label: "Yıkama talimatı" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <h2 className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">{title}</h2>
      {children}
    </section>
  );
}

export function ManufacturerPortal({ token, data }: { token: string; data: PortalPayload }) {
  const sheet = data.sheet;
  const [body, setBody] = useState("");
  const [author, setAuthor] = useState(data.manufacturer_name ?? "");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSending, startSend] = useTransition();

  const head = textRows(sheet);
  const measurements = Array.isArray(sheet.measurements) ? (sheet.measurements as Record<string, unknown>[]) : [];
  const delivered = Array.isArray(sheet.delivered_items) ? (sheet.delivered_items as Record<string, unknown>[]) : [];
  const longs = LONG_FIELDS
    .map((f) => ({ ...f, value: typeof sheet[f.key] === "string" ? (sheet[f.key] as string).trim() : "" }))
    .filter((f) => f.value);

  function send() {
    setError(null);
    startSend(async () => {
      try {
        const res = await addManufacturerNote(token, body, author);
        if ("error" in res) { setError(res.error); return; }
        setBody("");
        setSent(true);
      } catch {
        setError("Gönderilemedi. Bağlantınızı kontrol edip tekrar deneyin.");
      }
    });
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">Aslı Filinta · Üretim Föyü</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          {String(sheet.title ?? "Üretim Föyü")}
        </h1>
        {data.manufacturer_name && (
          <p className="mt-1 text-[13.5px] text-muted">{data.manufacturer_name} için hazırlandı.</p>
        )}
        {/* Yazdırma tarayıcının kendi işidir — dosya indirtmeye çalışmıyoruz. */}
        <Button variant="secondary" size="sm" className="no-print mt-3" onClick={() => window.print()}>
          <Printer size={14} aria-hidden /> Yazdır
        </Button>
      </header>

      <div className="space-y-3">
        {head.length > 0 && (
          <Section title="Künye">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {head.map((r) => (
                <div key={r.label} className="flex gap-2 text-[13.5px]">
                  <dt className="shrink-0 text-subtle">{r.label}</dt>
                  <dd className="min-w-0 flex-1 break-words font-medium text-ink">{r.value}</dd>
                </div>
              ))}
            </dl>
          </Section>
        )}

        {measurements.length > 0 && (
          <Section title="Ölçüler">
            <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {measurements.map((m, i) => (
                <li key={i} className="flex gap-2 text-[13.5px]">
                  <span className="min-w-0 flex-1 truncate text-muted">{String(m.label ?? "—")}</span>
                  <span className="shrink-0 font-medium tabular-nums text-ink">{String(m.value ?? "")}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {data.bom.length > 0 && (
          <Section title="Reçete">
            {/* Geniş içerik KENDİ kutusunda kayar — sayfa yatay kaymaz. */}
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[420px] text-[13.5px]">
                <thead>
                  <tr className="border-b border-hairline text-left text-[12px] uppercase tracking-[0.06em] text-subtle">
                    <th className="py-1.5 pr-3 font-semibold">Malzeme</th>
                    <th className="py-1.5 pr-3 font-semibold">Birim</th>
                    <th className="py-1.5 pr-3 text-right font-semibold">Miktar</th>
                    <th className="py-1.5 text-right font-semibold">Fire %</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bom.map((b, i) => (
                    <tr key={i} className="border-b border-hairline last:border-0">
                      <td className="py-1.5 pr-3 text-ink">
                        {String(b.name ?? "—")}
                        {b.note ? <span className="block text-[12.5px] text-subtle">{String(b.note)}</span> : null}
                      </td>
                      <td className="py-1.5 pr-3 text-muted">{String(b.unit ?? "")}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-ink">{String(b.consumption ?? "")}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted">{String(b.waste_pct ?? "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {delivered.length > 0 && (
          <Section title="Teslim edilenler">
            <ul className="space-y-1">
              {delivered.map((d, i) => (
                <li key={i} className="flex gap-2 text-[13.5px]">
                  <span className="min-w-0 flex-1 text-ink">{String(d.label ?? "—")}</span>
                  <span className="shrink-0 tabular-nums text-muted">{String(d.qty ?? "")}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {longs.map((f) => (
          <Section key={f.key} title={f.label}>
            <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink">{f.value}</p>
          </Section>
        ))}

        {/* ÜRETİCİNİN GİRDİĞİ DETAY. Föyü değiştirmez; ekibe iletilir. */}
        {data.can_write && (
          <Section title="Üretim notunuz">
            <p className="mb-2.5 text-[13px] leading-relaxed text-muted">
              Ürünle ilgili gördüğünüz detayları buraya yazın — ölçü farkı, malzeme
              önerisi, teslim süresi. Ekibe iletilir; föy sizin yazdığınızla değişmez.
            </p>
            {error && (
              <p role="alert" className="mb-2 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] font-medium text-danger">
                {error}
              </p>
            )}
            {sent && (
              <p role="status" className="mb-2 flex items-center gap-1.5 rounded-control border border-success/30 bg-success/10 px-3 py-2 text-[13px] font-medium text-success">
                <CheckCircle2 size={14} aria-hidden /> Notunuz iletildi.
              </p>
            )}
            <div className="space-y-2.5">
              <Field label="Adınız">
                <TextInput
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Adınız"
                  autoComplete="name"
                />
              </Field>
              <Field label="Not">
                <TextArea
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Kumaş enine göre metraj 1.4 m çıkıyor…"
                />
              </Field>
              <Button onClick={send} disabled={!body.trim() || isSending}>
                {isSending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Send size={14} aria-hidden />}
                Gönder
              </Button>
            </div>
          </Section>
        )}

        {data.notes.length > 0 && (
          <Section title="İletilen notlar">
            <ul className="space-y-2.5">
              {data.notes.map((n, i) => (
                <li key={i} className="border-b border-hairline pb-2.5 last:border-0 last:pb-0">
                  <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink">{n.body}</p>
                  <p className="mt-0.5 text-[12px] text-subtle">
                    {n.author ? `${n.author} · ` : ""}
                    {new Date(n.at).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      <footer className="mt-6 text-[12px] text-subtle">
        Bu bağlantı yalnız bu föy içindir ve süreli olabilir. Lütfen üçüncü kişilerle paylaşmayın.
      </footer>
    </main>
  );
}
