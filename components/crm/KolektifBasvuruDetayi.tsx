import { ExternalLink } from "lucide-react";
import type { KolektifKayit } from "@/lib/crm/kolektif";

/**
 * KOLEKTİF BAŞVURUSU — CRM satırının altında açılan ayrıntı.
 *
 * Aslı Hanım: "Adı, soyadı, bütün aldığımız bilgiler şeklinde." Ad, telefon ve
 * e-posta zaten satırın hücrelerinde; burada başvurunun geri kalanı durur:
 * kategori, il/ilçe, kategoriye özel sorular (bölüm başlıklarıyla), gelenekler,
 * öncelikli konular ve katkı alanları.
 *
 * Açılır pencere değil, satır içi — CRM'de pop-up yok (2026-09-26). Salt
 * okunur: başvuruyu kişi yazdı, ekip üzerine yazmaz; ekibin notu "Not"
 * hücresindedir.
 */

const TARIH = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Istanbul",
});

function tarih(s: string): string {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : TARIH.format(d);
}

function Liste({ baslik, maddeler }: { baslik: string; maddeler: string[] }) {
  return (
    <div className="min-w-0">
      <h4 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">{baslik}</h4>
      {maddeler.length === 0 ? (
        <p className="mt-1 text-[13px] text-subtle">Belirtilmedi</p>
      ) : (
        <ol className="mt-1 space-y-0.5 text-[13px] text-ink">
          {maddeler.map((m, i) => (
            <li key={`${i}-${m}`} className="flex gap-2">
              <span className="w-4 shrink-0 text-right tabular-nums text-subtle">{i + 1}.</span>
              <span className="min-w-0">{m}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Çizilmeden önce şema tekrar sorulmaz: kayıt diskte duruyor ve şemadan
 *  ÖNCE yazılmış ya da elle düzeltilmiş olabilir. Bağlantı yalnız http/https
 *  ise çizilir — aksi halde hiç bağlantı yoktur. */
function guvenliBaglanti(u: string | null): string | null {
  if (!u) return null;
  try { return /^https?:$/.test(new URL(u).protocol) ? u : null; } catch { return null; }
}

export function KolektifBasvuruDetayi({ b }: { b: KolektifKayit }) {
  const panelUrl = guvenliBaglanti(b.panel_url);
  const bilgiler: [string, string | null][] = [
    ["İl / ilçe", [b.il, b.ilce].filter(Boolean).join(" / ") || null],
    ["Kurum", b.kurum],
    ["Rol", b.rol],
    ["Instagram", b.instagram],
    ["Web sitesi", b.web],
  ];
  return (
    <div className="space-y-4 text-left">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[13px] text-ink">
          <span className="font-semibold">Kolektif başvurusu</span>
          <span className="text-subtle"> · {b.kategori} · Kayıt {b.kayit_no} · {tarih(b.alindi)}</span>
        </p>
        {panelUrl ? (
          <a
            href={panelUrl}
            target="_blank"
            rel="noreferrer"
            className="tap-target inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:text-brand-strong"
          >
            Filinta panelinde aç <ExternalLink size={12} aria-hidden />
          </a>
        ) : null}
      </div>

      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-5">
        {bilgiler.map(([etiket, deger]) => (
          <div key={etiket} className="min-w-0">
            <dt className="text-[12px] text-subtle">{etiket}</dt>
            <dd className="truncate text-[13px] text-ink" title={deger ?? undefined}>
              {deger ?? <span className="text-subtle">Belirtilmedi</span>}
            </dd>
          </div>
        ))}
      </dl>

      {b.bolumler.map((bolum, bi) => (
        <div key={bolum.baslik ?? `bolum-${bi}`}>
          {bolum.baslik ? (
            <h4 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">{bolum.baslik}</h4>
          ) : null}
          <dl className="divide-y divide-hairline border-y border-hairline">
            {bolum.sorular.map((s, si) => (
              <div key={`${si}-${s.soru}`} className="grid gap-1 py-1.5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-6">
                <dt className="text-[12.5px] text-subtle">{s.soru}</dt>
                <dd className="whitespace-pre-line text-[13px] text-ink">{s.yanit}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}

      <div className="grid gap-4 md:grid-cols-3">
        <Liste baslik="Yaşatmak istediği gelenekler" maddeler={b.gelenekler} />
        <Liste baslik="Öncelikli konular ve sorular" maddeler={b.konular} />
        <Liste baslik="Katkı sunabileceği alanlar" maddeler={b.katki} />
      </div>
    </div>
  );
}
