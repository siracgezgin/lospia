"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, Link2Off, Loader2 } from "lucide-react";
import { createManufacturerLink, revokeManufacturerLink } from "@/lib/actions/manufacturer-portal";
import { Overlay } from "@/components/ui/Overlay";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, TextInput, SelectInput } from "@/components/ui/Field";
import { useConfirm } from "@/components/ui/useConfirm";

export type PortalLinkRow = {
  id: string;
  token: string;
  manufacturer_name: string | null;
  email: string | null;
  can_write: boolean;
  expires_at: string | null;
  revoked_at: string | null;
  last_seen_at: string | null;
};

/**
 * ÜRETİCİ PANELİ — bağlantı aç / kapat.
 *
 * Aslı Hanım (2026-09-07): "Sabri Bey bizim üreticimiz olacağı için üreticiye
 * de bir panel verebilirsin. Çünkü ürünün detaylarını girip buradan alabilir
 * VEYA DİREKT MAİL GİDEBİLİR." Mail düğmesi ("Üreticiye gönder") yerinde
 * duruyor; bu onun yanındaki ikinci yol.
 *
 * Bağlantı bir HESAP DEĞİLDİR: tek föy, fiyatsız, süreli ve tek tıkla iptal
 * edilebilir. Bu yüzden pencere üç şey sorar — kim, ne kadar süre, yazabilir mi.
 */
export function ManufacturerAccess({
  sheetId, links, defaultName, defaultEmail, confirmed, isAdmin,
}: {
  sheetId: string;
  links: PortalLinkRow[];
  defaultName?: string | null;
  defaultEmail?: string | null;
  confirmed: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName ?? "");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [days, setDays] = useState("30");
  const [canWrite, setCanWrite] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();
  const [isRevoking, startRevoke] = useTransition();

  if (!isAdmin) return null;

  const active = links.filter(
    (l) => !l.revoked_at && (!l.expires_at || new Date(l.expires_at) > new Date()),
  );

  const urlOf = (token: string) =>
    typeof window === "undefined" ? `/uretici/${token}` : `${window.location.origin}/uretici/${token}`;

  async function copy(token: string) {
    const url = urlOf(token);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(token);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      /* Pano izni yoksa kullanıcı adresi elle seçebilsin diye uyarı yerine
         hiçbir şey yapılmaz; bağlantı zaten ekranda yazıyor. */
      setError("Kopyalanamadı — adresi elle seçip kopyalayabilirsiniz.");
    }
  }

  function create() {
    setError(null);
    startSave(async () => {
      try {
        const res = await createManufacturerLink(sheetId, {
          manufacturer_name: name,
          email: email || null,
          can_write: canWrite,
          days: Number(days) || 0,
        });
        if ("error" in res) { setError(res.error); return; }
        setOpen(false);
        router.refresh();
        void copy(res.token);
      } catch {
        setError("Bağlantı oluşturulamadı. Tekrar deneyin.");
      }
    });
  }

  async function revoke(l: PortalLinkRow) {
    if (!(await ask({
      title: "Bağlantı kapatılsın mı?",
      message: `${l.manufacturer_name || "Üretici"} bu bağlantıyla föye bir daha ulaşamaz. Gerekirse yeni bağlantı açabilirsiniz.`,
      confirmLabel: "Kapat",
      tone: "danger",
    }))) return;
    setError(null);
    startRevoke(async () => {
      const res = await revokeManufacturerLink(l.id);
      if ("error" in res) { setError(res.error); return; }
      router.refresh();
    });
  }

  return (
    <>
      <span
        className="inline-flex"
        title={
          confirmed
            ? "Üreticiye bu föy için panel bağlantısı aç"
            : "Önce föyü konfirme edin — eksik föy dışarı açılmaz"
        }
      >
        <Button variant="secondary" onClick={() => setOpen(true)} disabled={!confirmed}>
          <KeyRound size={15} aria-hidden />
          <span className="hidden sm:inline">Üretici paneli</span>
          {active.length > 0 && <span className="tabular-nums">· {active.length}</span>}
        </Button>
      </span>

      {open && (
        <Overlay
          open
          onClose={() => setOpen(false)}
          title="Üretici paneli"
          size="md"
          dismissOnBackdrop={false}
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Kapat</Button>
              <Button size="sm" onClick={create} loading={isSaving}>
                {!isSaving && <KeyRound size={14} aria-hidden />} Bağlantı oluştur
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {error && (
              <p role="alert" className="anim-fade-down rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] font-medium text-danger">
                {error}
              </p>
            )}

            <p className="text-[13px] leading-relaxed text-muted">
              Üreticinin sistemde hesabı olmaz. Bu bağlantı <b className="font-semibold">yalnız bu föyü</b> açar,
              üretici detay notu yazabilir ve <b className="font-semibold">fiyat bilgisi görmez</b>.
            </p>

            <Field label="Kime">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Sabri Bey" />
            </Field>
            <Field label="E-posta" hint="Kayıt için — bağlantı buradan otomatik gönderilmez.">
              <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sabri@atolye.com" />
            </Field>
            <div className="flex flex-wrap gap-3">
              <Field label="Geçerlilik" className="min-w-[150px]">
                <SelectInput value={days} onChange={(e) => setDays(e.target.value)}>
                  <option value="7">7 gün</option>
                  <option value="30">30 gün</option>
                  <option value="90">90 gün</option>
                  <option value="0">Süresiz</option>
                </SelectInput>
              </Field>
              <Field label="Not yazabilsin" className="min-w-[150px]">
                <SelectInput value={canWrite ? "1" : "0"} onChange={(e) => setCanWrite(e.target.value === "1")}>
                  <option value="1">Evet — detay girebilir</option>
                  <option value="0">Hayır — yalnız okur</option>
                </SelectInput>
              </Field>
            </div>

            {links.length > 0 && (
              <section>
                <h3 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">
                  Açılmış bağlantılar
                </h3>
                <ul className="space-y-1.5">
                  {links.map((l) => {
                    const dead = !!l.revoked_at || (!!l.expires_at && new Date(l.expires_at) <= new Date());
                    return (
                      <li
                        key={l.id}
                        className="flex flex-wrap items-center gap-2 rounded-control border border-hairline px-2.5 py-2 text-[13px]"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-ink">
                            {l.manufacturer_name || "Üretici"}
                          </span>
                          <span className="block truncate text-[12px] text-subtle">
                            {dead
                              ? (l.revoked_at ? "Kapatıldı" : "Süresi doldu")
                              : l.expires_at
                                ? `${new Date(l.expires_at).toLocaleDateString("tr-TR")} tarihine kadar`
                                : "Süresiz"}
                            {l.last_seen_at && !dead
                              ? ` · son açılış ${new Date(l.last_seen_at).toLocaleDateString("tr-TR")}`
                              : ""}
                            {!l.can_write ? " · salt okunur" : ""}
                          </span>
                        </span>
                        {!dead && (
                          <>
                            <IconButton
                              size="sm"
                              aria-label="Bağlantıyı kopyala"
                              title={urlOf(l.token)}
                              onClick={() => void copy(l.token)}
                            >
                              {copied === l.token ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                            </IconButton>
                            <IconButton
                              size="sm"
                              aria-label="Bağlantıyı kapat"
                              title="Bağlantıyı kapat"
                              onClick={() => void revoke(l)}
                              className="hover:text-danger"
                            >
                              {isRevoking ? <Loader2 size={14} className="animate-spin" /> : <Link2Off size={14} />}
                            </IconButton>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
          {dialog}
        </Overlay>
      )}
    </>
  );
}
