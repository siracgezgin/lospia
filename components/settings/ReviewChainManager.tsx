"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, Plus, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { SelectInput } from "@/components/ui/Field";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { setReviewChain } from "@/lib/actions/task-review";

export type ChainPerson = { id: string; name: string; avatarUrl: string | null };

/**
 * KONTROL KUYRUĞU — çalışma alanının SABİT kademesi.
 *
 * Aslı Hanım (2026-09-07): "İkinizin yaptığını NİSA kontrol etsin. ONDAN SONRA
 * BANA GELSİN." Yani kuyruğun sabit kısmı iki kişidir: koordinatör, sonra
 * yönetici. Çapraz kontrolcü (Gül⇄Kısmet) buraya yazılmaz — işi kimin yaptığına
 * göre değiştiği için görev kontrole gönderilirken seçilir.
 *
 * Sıra ÖNEMLİ: görev kuyruğu yukarıdan aşağı gezer, sıra atlanamaz.
 */
export function ReviewChainManager({
  people, initial, canManage,
}: {
  people: ChainPerson[];
  initial: string[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [chain, setChain] = useState<string[]>(initial);
  const [pick, setPick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSaving, start] = useTransition();

  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "—";
  const photoOf = (id: string) => people.find((p) => p.id === id)?.avatarUrl ?? null;
  const available = people.filter((p) => !chain.includes(p.id));
  const dirty = chain.join(",") !== initial.join(",");

  function save() {
    setError(null);
    setSaved(false);
    start(async () => {
      try {
        const res = await setReviewChain(chain);
        if ("error" in res) { setError(res.error); return; }
        setSaved(true);
        router.refresh();
      } catch {
        setError("Kaydedilemedi. Tekrar deneyin.");
      }
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] font-medium text-danger">
          {error}
        </p>
      )}
      {saved && !dirty && (
        <p role="status" className="rounded-control border border-success/30 bg-success/10 px-3 py-2 text-[13px] font-medium text-success">
          Kontrol kuyruğu kaydedildi.
        </p>
      )}

      {chain.length === 0 ? (
        <p className="text-[13px] text-muted">
          Kuyruk boş — görevler eskisi gibi doğrudan yöneticinin onayına gider.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {chain.map((id, i) => (
            <li key={id} className="flex items-center gap-2 rounded-control border border-hairline px-2.5 py-2">
              <span className="w-4 shrink-0 text-center text-[12px] font-semibold tabular-nums text-subtle">{i + 1}</span>
              <PersonAvatar name={nameOf(id)} photoUrl={photoOf(id)} size="sm" />
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{nameOf(id)}</span>
              {i < chain.length - 1 && <ArrowDown size={13} className="shrink-0 text-subtle" aria-hidden />}
              {canManage && (
                <IconButton
                  size="sm"
                  aria-label={`${nameOf(id)} kuyruktan çıkar`}
                  title="Kuyruktan çıkar"
                  onClick={() => setChain((c) => c.filter((x) => x !== id))}
                  className="hover:text-danger"
                >
                  <Trash2 size={13} />
                </IconButton>
              )}
            </li>
          ))}
        </ol>
      )}

      {canManage && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <SelectInput
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              aria-label="Kuyruğa eklenecek kişi"
              className="w-auto min-w-[180px]"
            >
              <option value="">Kişi seçin…</option>
              {available.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </SelectInput>
            <Button
              variant="secondary"
              size="sm"
              disabled={!pick}
              onClick={() => { setChain((c) => [...c, pick]); setPick(""); setSaved(false); }}
            >
              <Plus size={13} aria-hidden /> Sıraya ekle
            </Button>
            <Button size="sm" onClick={save} loading={isSaving} disabled={!dirty}>
              Kaydet
            </Button>
          </div>
          <p className="text-[12px] leading-relaxed text-subtle">
            Sıra yukarıdan aşağı işler ve atlanamaz. Çapraz kontrolü yapacak kişi
            buraya yazılmaz — onu işi bitiren kişi gönderirken seçer.
          </p>
        </>
      )}
    </div>
  );
}
