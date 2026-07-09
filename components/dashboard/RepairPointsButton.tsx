"use client";

import { useState, useTransition } from "react";
import { Wrench, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { repairMissingPoints } from "@/lib/actions/points";

/**
 * Admin-only: backfill missing "earned" ledger rows for tasks that were
 * completed without points (assignee-only or pre-points-system). Idempotent —
 * safe to run repeatedly; a second run reports 0 new rows.
 */
export function RepairPointsButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  function run() {
    setResult(null);
    startTransition(async () => {
      const res = await repairMissingPoints();
      if ("error" in res) {
        setResult(res.error);
        return;
      }
      setResult(
        res.insertedRows > 0
          ? `${res.insertedRows} eksik puan kaydı tamamlandı.`
          : "Eksik puan kaydı bulunamadı. Her şey güncel.",
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        size="sm"
        onClick={run}
        loading={pending}
        title="Tamamlanmış ama puan kaydı oluşmamış görevleri güvenli şekilde tamamlar."
        className="text-muted hover:text-ink"
      >
        {!pending && <Wrench size={13} />}
        Eksik puan kayıtlarını onar
      </Button>
      {result && (
        <span className="inline-flex items-center gap-1 text-[11px] text-muted">
          <Check size={11} className="text-[#1c7a52]" /> {result}
        </span>
      )}
    </div>
  );
}
