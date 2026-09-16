"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { cn } from "@/lib/utils/cn";

/**
 * KİMLE BİRLİKTE ÇALIŞIYORUM — açık kaydın üstündeki kişi rozetleri.
 *
 * TABLO ve YAZI için AYNI bileşen: ikisi de aynı anda birden fazla kişi
 * tarafından açılabiliyor ve ikisinde de kaydetme "son yazan kazanır".
 * Ayrı ayrı yazmak, "bazısında var bazısında yok" sınıfına yeni bir örnek
 * eklemek olurdu.
 *
 * Sıraç (2026-09-16): "Aynı anda birden fazla kişi girince Excel'de sağ üstte
 * kişiler oluyor ya, kimle düzenliyor filan — bizde de yapabilir miyiz onu?"
 *
 * NEDEN ÖNEMLİ, SÜS DEĞİL: bu tablo aynı anda iki kişi tarafından
 * düzenlenebiliyor ve kaydetme "son yazan kazanır" mantığıyla çalışıyor.
 * Karşıda birinin olduğunu GÖRMEK, birbirinin üstüne yazmadan önce tek
 * uyarıdır. Rozet aslında bir tehlike işareti.
 *
 * NEDEN PRESENCE, NEDEN TABLO DEĞİL: kimin açık olduğu KALICI bir bilgi değil.
 * Veritabanına yazsaydık sekmeyi kapatan, ağı kopan ya da uyku moduna geçen
 * herkes için "hâlâ burada" diyen ölü satırlar kalırdı ve onları temizlemek
 * için ayrı bir iş gerekirdi. Supabase Presence bağlantı düşünce kişiyi
 * kendiliğinden düşürür; yazma yok, temizlik yok.
 *
 * SESSİZCE YOK OLUR: kanal açılamıyorsa ya da ağ yoksa bileşen hiçbir şey
 * çizmez. Tablo bu şeride bağlı değil — çalışmazsa düzenleme aksamaz.
 *
 * NEDEN `featureFlags.realtime` ARKASINDA DEĞİL: o bayrak `postgres_changes`
 * içindir — veritabanı çoğaltması açık olmayan bir projede abonelik sessizce
 * çalışmaz, o yüzden kapalı başlar. Presence ÇOĞALTMA KULLANMAZ; kanal
 * düzeyinde çalışır, hiçbir tabloyu dinlemez ve hiçbir şey yazmaz. Bayrağın
 * arkasına koysaydık, kullanıcının Vercel'de bir ortam değişkeni ayarlamasını
 * beklerdik — istenen şey basit bir rozet şeridiyken.
 */

type Peer = { userId: string; name: string; color: string | null; photo: string | null };

/** En fazla kaç yüz gösterilir; gerisi "+N" olur. Beşten sonrası şerit değil
 *  kalabalık olur ve başlığı sıkıştırır. */
const MAX_FACES = 5;

export function PresenceBar({
  channelKey,
  me,
  className,
}: {
  /** Aynı kaydı açan herkes aynı anahtarda buluşur, ör. "sheet:<id>". */
  channelKey: string;
  me: Peer;
  className?: string;
}) {
  const [peers, setPeers] = useState<Peer[]>([]);

  /* Efekt NESNEYE değil ALANLARA bağlı. `me` sunucudan gelen bir nesne
     ve her yeniden çizimde yeni bir kimlik taşıyabilir; bağımlılığa nesneyi
     koysaydık kanal boş yere kapanıp yeniden açılır, karşı taraf da bizi
     sürekli girip çıkıyor sanırdı. */
  const { userId, name, color, photo } = me;

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    /* `key` KİŞİ BAŞINA: aynı kişi iki sekme açarsa Presence iki ayrı giriş
       tutar ama ikisi de aynı anahtarda toplanır — listede tek görünür. */
    const self: Peer = { userId, name, color, photo };
    const channel = supabase.channel(channelKey, {
      config: { presence: { key: userId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        if (cancelled) return;
        const state = channel.presenceState<Peer>();
        const seen = new Map<string, Peer>();
        for (const entries of Object.values(state)) {
          for (const p of entries) {
            /* KENDİNİ SAYMA: "yanımda kim var" sorusunun cevabında kişinin
               kendisi yoktur; kendi yüzünü görmek bilgi taşımaz. */
            if (!p?.userId || p.userId === userId) continue;
            seen.set(p.userId, p);
          }
        }
        setPeers([...seen.values()]);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track(self);
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [channelKey, userId, name, color, photo]);

  if (peers.length === 0) return null;

  const shown = peers.slice(0, MAX_FACES);
  const rest = peers.length - shown.length;
  const names = peers.map((p) => p.name).join(", ");

  return (
    <div
      className={cn("flex items-center", className)}
      /* Ekran okuyucu için TEK cümle: üst üste binmiş yüzleri tek tek okutmak
         gürültü olurdu. */
      role="group"
      aria-label={`Şu anda birlikte: ${names}`}
      title={`Şu anda bu tabloda: ${names}`}
    >
      {/* Yüzler ÜST ÜSTE BİNER (-ml) ve her birinin etrafında yüzey rengiyle
          bir halka var — Drive/Docs'ta da aynı dil, yan yana dizmekten daha az
          yer kaplar. */}
      {shown.map((p) => (
        <PersonAvatar
          key={p.userId}
          name={p.name}
          photoUrl={p.photo}
          colorHex={p.color}
          size="sm"
          ring
          className="-ml-1.5 first:ml-0"
        />
      ))}
      {rest > 0 && (
        <span className="-ml-1.5 grid size-7 place-items-center rounded-full bg-surface-sunken text-[11px] font-semibold tabular-nums text-muted ring-2 ring-surface">
          +{rest}
        </span>
      )}
    </div>
  );
}
