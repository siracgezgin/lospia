"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import {
  MODULE_GROUP_TITLES,
  modulesForRole,
  type ModuleGroup,
} from "@/lib/modules/registry";
import { OfficeCenterCard } from "./OfficeCenterCard";

/** Bölüm sırası sol menüdekiyle AYNI — göz aynı sırayı iki kez öğrenmesin. */
const GROUP_ORDER: ModuleGroup[] = ["calisma", "urun", "yonetim"];

/** Bölümün ne işe yaradığı — tek satır, ekran adlarını TEKRARLAMADAN. */
const GROUP_NOTES: Record<ModuleGroup, string> = {
  calisma: "Günün ritmi: ne yapılacak, ne zaman, hangi aşamada.",
  urun: "Üzerinde çalışılan şeyler: koleksiyon, dosyalar, kişiler.",
  yonetim: "Yalnız yönetici: para akışı, hareket kaydı, arşiv ve çalışma alanı.",
};

/**
 * Türkçe-duyarlı arama anahtarı: büyük/küçük harf ve şapkalı/noktalı
 * harf farkı aramayı bozmasın — "odeme" yazan da "Ödeme"yi bulsun.
 */
function searchKey(value: string): string {
  return value
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ç/g, "c")
    .trim();
}

/**
 * Operation Modules listesi — dizinin kendisi.
 *
 * Sayfa on altı ekranı üç bölüm hâlinde çiziyordu ve aradığını bulmanın tek
 * yolu gözle taramaktı. Tek bir süzgeç alanı eklendi: yazdıkça başlık ve
 * açıklama üzerinde eşleşenler kalır, boş bölüm hiç çizilmez, hiç sonuç
 * yoksa ne yapılacağını söyleyen bir boş durum çıkar.
 *
 * Sayaç yok (Aslı Hanım, 2026-08-24: "boş hesap istemiyorum"); kartlar hâlâ
 * MODULE_DIRECTORY'den geliyor, ikinci bir isim listesi doğmuyor.
 */
export function ModuleDirectory({ isAdmin }: { isAdmin: boolean }) {
  const [query, setQuery] = useState("");

  const modules = useMemo(() => modulesForRole(isAdmin), [isAdmin]);

  const filtered = useMemo(() => {
    const key = searchKey(query);
    if (key === "") return modules;
    return modules.filter((m) =>
      searchKey(`${m.title} ${m.description}`).includes(key)
    );
  }, [modules, query]);

  const hasQuery = query.trim() !== "";

  return (
    <div>
      <div className="mb-6 max-w-md">
        <label htmlFor="module-search" className="sr-only">
          Modül ara
        </label>
        <div className="relative">
          <Search
            size={15}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle"
          />
          <input
            id="module-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Modül ara — örn. maliyet, ödeme, takvim"
            autoComplete="off"
            className="h-10 w-full rounded-control border border-line bg-surface pl-9 pr-10 text-[13.5px] text-ink placeholder:text-subtle focus:border-brand-ring focus:outline-none focus:ring-2 focus:ring-brand-ring/40 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {hasQuery && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Aramayı temizle"
              title="Aramayı temizle"
              className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-control text-subtle transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
            >
              <X size={15} aria-hidden />
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-surface px-5 py-10 text-center">
          <p className="text-[14px] font-medium text-ink">
            &ldquo;{query.trim()}&rdquo; ile eşleşen bir ekran yok.
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">
            Ekran adının bir parçasını yazmayı deneyin; aradığınız yalnızca
            yöneticiye açık bir alan da olabilir.
          </p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="mt-4 inline-flex h-9 items-center rounded-control border border-line px-3.5 text-[13.5px] font-medium text-muted transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
          >
            Tüm modülleri göster
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {GROUP_ORDER.map((group) => {
            const items = filtered.filter((m) => m.group === group);
            if (items.length === 0) return null;
            return (
              <section key={group}>
                <div className="mb-3 border-b border-hairline pb-2">
                  <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">
                    {MODULE_GROUP_TITLES[group]}
                  </h2>
                  {!hasQuery && (
                    <p className="mt-1 text-[13px] text-muted">{GROUP_NOTES[group]}</p>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {items.map((m) => (
                    <OfficeCenterCard
                      key={m.key}
                      title={m.title}
                      description={m.description}
                      href={m.href}
                      icon={m.icon}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
