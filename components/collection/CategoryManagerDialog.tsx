"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Plus, Trash2 } from "lucide-react";
import {
  createProductCategory, renameProductCategory, deleteProductCategory,
} from "@/lib/actions/collection-categories";
import { Overlay } from "@/components/ui/Overlay";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { useConfirm } from "@/components/ui/useConfirm";
import type { CategoryNode } from "@/lib/collection/taxonomy";

/**
 * KATEGORİ DÜZENLEME — tek pencere, tek yer.
 *
 * Sıraç (2026-08-29): "Kategori ekle neden yok? Ve kategori düzenleme, silme
 * veya föy düzenleme, silme gibi olması gereken ne varsa olmalı."
 *
 * Adlandırma, alt kategori ekleme/silme ve kategoriyi silme aynı pencerede.
 * Alternatif — her kutucuğun üstüne kalem, çöp, artı serpiştirmek — giriş
 * ekranını bir kontrol paneline çevirirdi; oysa orası "ne üretiyoruz?"
 * sorusunun cevabı.
 *
 * Silme YALNIZ boş kategoride mümkün (sunucu da ayrıca reddeder): dolu bir
 * kategoriyi silmek föyleri sessizce öksüz bırakır ve kullanıcı bunu veri
 * kaybı olarak okur.
 */
export function CategoryManagerDialog({
  category,
  onClose,
  itemCount,
}: {
  /** Boşsa YENİ üst kategori penceresi açılır. */
  category: CategoryNode | null;
  onClose: () => void;
  /** Kategorinin içindeki föy sayısı — silme uyarısını yazmak için. */
  itemCount: number;
}) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isNew = !category;
  const [label, setLabel] = useState(category?.label ?? "");
  const [newSub, setNewSub] = useState("");

  function run(fn: () => Promise<Record<string, unknown> | { error: string }>, after?: () => void) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res && "error" in res && typeof res.error === "string") {
        setError(res.error);
        return;
      }
      after?.();
      router.refresh();
    });
  }

  function save() {
    const clean = label.trim();
    if (!clean) return setError("Kategori adı gerekli.");
    if (isNew) run(() => createProductCategory({ label: clean }), onClose);
    else run(() => renameProductCategory(category!.key, clean), onClose);
  }

  function addSub() {
    const clean = newSub.trim();
    if (!clean || !category) return;
    run(() => createProductCategory({ label: clean, parentKey: category.key }), () => setNewSub(""));
  }

  async function removeSub(key: string, subLabel: string) {
    if (!(await ask({
      title: "Alt kategori silinsin mi?",
      message: `“${subLabel}” silinir.\nİçinde föy varsa silme reddedilir — önce föyleri taşıyın.`,
    }))) return;
    run(() => deleteProductCategory(key));
  }

  async function removeCategory() {
    if (!category) return;
    if (!(await ask({
      title: "Kategori silinsin mi?",
      message: `“${category.label}” kalıcı olarak silinir.\nBu işlem geri alınamaz.`,
    }))) return;
    run(() => deleteProductCategory(category.key), onClose);
  }

  return (
    <Overlay
      open
      onClose={onClose}
      title={isNew ? "Yeni kategori" : "Kategoriyi düzenle"}
      size="md"
      dismissOnBackdrop={false}
      footer={
        <>
          {!isNew && (
            <Button
              variant="ghost"
              size="sm"
              onClick={removeCategory}
              disabled={isPending}
              className="mr-auto text-danger hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 size={14} /> Kategoriyi sil
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
            İptal
          </Button>
          <Button size="sm" onClick={save} loading={isPending}>
            {isNew ? "Ekle" : "Kaydet"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="Kategori adı"
          required
          hint={isNew ? "Örn: Bags — föyler bu kategorinin altında oluşur." : undefined}
        >
          <TextInput
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            autoFocus
            placeholder="Ready to Wear"
          />
        </Field>

        {!isNew && (
          <section className="border-t border-hairline pt-4">
            <h3 className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">
              Alt kategoriler
            </h3>

            {category!.subcategories.length === 0 ? (
              <p className="mb-2.5 text-[12.5px] text-subtle">
                Alt kategori yok — ürünler doğrudan bu kategorinin altında durur.
              </p>
            ) : (
              <ul className="mb-2.5 divide-y divide-hairline rounded-control border border-line">
                {category!.subcategories.map((sub) => (
                  <li key={sub.key} className="flex items-center gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{sub.label}</span>
                    <IconButton
                      size="sm"
                      onClick={() => removeSub(sub.key, sub.label)}
                      disabled={isPending}
                      title="Alt kategoriyi sil"
                      aria-label={`${sub.label} alt kategorisini sil`}
                      className="text-subtle hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center gap-2">
              <TextInput
                value={newSub}
                onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSub()}
                placeholder="Yeni alt kategori adı"
                aria-label="Yeni alt kategori adı"
              />
              <Button variant="secondary" onClick={addSub} disabled={isPending || !newSub.trim()} className="shrink-0">
                <Plus size={14} /> Ekle
              </Button>
            </div>
          </section>
        )}

        {!isNew && itemCount > 0 && (
          <p className="rounded-control border border-line bg-surface-muted px-3 py-2 text-[12px] leading-snug text-muted">
            Bu kategoride föy var. Adı değiştirmek föyleri etkilemez; silmek için
            önce föyleri başka bir kategoriye taşımanız gerekir.
          </p>
        )}

        {error && (
          <div className="anim-fade-down flex items-start gap-2 rounded-control border border-danger/25 bg-danger/8 px-3 py-2.5 text-[12.5px] leading-relaxed text-danger">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        )}
      </div>
      {dialog}
    </Overlay>
  );
}
