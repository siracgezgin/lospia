import { cn } from "@/lib/utils/cn";
import {
  blockButton, SOCIAL_PLATFORMS,
  type NewsletterBlock, type NewsletterProduct, type NewsletterWeek,
} from "@/lib/newsletter/model";

/**
 * POSTA ÖNİZLEMESİ — salt okunur, AF-Bulten-No01.html düzeninde.
 *
 * Hafta numaralı bloklardan oluşur (8.11 toplantısı); her blok kendi türünün
 * posta kalıbıyla, SIRAYLA çizilir. Sabit olan yalnız üst satır + logo ve
 * footer. Başlıklar Georgia, metin Helvetica, düğmeler siyah — taslakla aynı.
 */

/* `family-name:` etiketi ŞART: etiketsiz `font-[…]` sınıfını tailwind-merge
   yazı KALINLIĞI sanıyor ve yanındaki `font-normal` ile birlikte siliyordu —
   başlık Georgia yerine Inter çiziliyordu (CLAUDE.md'deki border-l tuzağının
   aynısı). */
const SERIF = "font-[family-name:Georgia,'Times_New_Roman',serif]";
const SANS = "font-[family-name:Helvetica,Arial,sans-serif]";

export function MailPreview({ week }: { week: NewsletterWeek }) {
  return (
    <div className="w-[600px] max-w-full bg-white text-[#111] shadow-[0_1px_12px_rgba(0,0,0,.08)]">
      <p className={cn(SANS, "px-6 pt-[34px] text-center text-[11px] leading-[1.4]")}>
        Can&apos;t see the images? <span className="underline">View in browser</span>
      </p>
      <div className="flex justify-center pb-[30px] pt-[26px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brands/asli-filinta-logo.png" alt="aslıfilinta" className="h-auto w-[220px] max-w-[60%]" />
      </div>

      {week.blocks.map((b) => (
        <div key={b.id} className="pb-12">
          <Block block={b} />
        </div>
      ))}

      <MailFooter />
    </div>
  );
}

function Block({ block: b }: { block: NewsletterBlock }) {
  switch (b.type) {
    case "gorsel":
      return <MailImage src={b.image_url} alt={b.title} ratio="aspect-[4/5]" empty="Görsel" />;
    case "metin":
      return (
        <>
          <Heading size={28}>{b.title}</Heading>
          <Text className="px-6 sm:px-14">{b.text}</Text>
        </>
      );
    case "urun":
      return (
        <>
          <Heading size={26}>{b.title}</Heading>
          <div className="grid grid-cols-2 px-2">
            {b.products.map((p) => <ProductCard key={p.id} product={p} />)}
            {b.products.length < 2 &&
              Array.from({ length: 2 - b.products.length }).map((_, i) => (
                <div key={i} className="px-1 pb-7"><div className="aspect-[4/5] bg-[#f1f1f1]" /></div>
              ))}
          </div>
          <MailButton>{blockButton(b)}</MailButton>
        </>
      );
    case "kategori":
      return (
        <>
          {b.image_url && <div className="pb-8"><MailImage src={b.image_url} alt={b.title} ratio="aspect-[4/5]" empty="" /></div>}
          <Heading size={26}>{b.title}</Heading>
          <Text className="px-6 pb-6 sm:px-14">{b.text}</Text>
          <MailButton>{blockButton(b)}</MailButton>
        </>
      );
    case "story":
      return (
        <>
          <MailImage src={b.image_url} alt={b.title} ratio="aspect-[4/3]" empty="Story görseli" />
          <div className="h-10" />
          <Text className="px-6 pb-6 sm:px-[72px]">{b.text}</Text>
          <MailButton>{blockButton(b)}</MailButton>
        </>
      );
    case "sosyal": {
      const social = SOCIAL_PLATFORMS.find((p) => p.key === b.platform) ?? SOCIAL_PLATFORMS[0];
      return (
        <>
          <MailImage src={b.image_url} alt={`Aslı Filinta on ${social.label}`} ratio="aspect-[4/5]" empty={`${social.label} görseli`} />
          <div className="h-8" />
          <MailButton>{blockButton(b)}</MailButton>
        </>
      );
    }
  }
}

function Heading({ size, children }: { size: 26 | 28; children: string }) {
  if (!children.trim()) return null;
  return (
    <div className={cn(SERIF, "whitespace-pre-line px-6 pb-6 text-center font-normal leading-[1.25] sm:px-10", size === 28 ? "text-[28px]" : "text-[26px]")}>
      {children}
    </div>
  );
}

function Text({ className, children }: { className: string; children: string }) {
  if (!children.trim()) return null;
  return <div className={cn(SANS, "whitespace-pre-line text-center text-[15px] leading-[1.75]", className)}>{children}</div>;
}

function MailImage({ src, alt, ratio, empty }: { src: string; alt: string; ratio: string; empty: string }) {
  if (/^https?:\/\//.test(src)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className="block h-auto w-full" />;
  }
  return (
    <div className={cn(SANS, "flex items-center justify-center bg-[#f1f1f1] text-[13px] text-[#999]", ratio)}>
      {empty}
    </div>
  );
}

function MailButton({ children }: { children: string }) {
  if (!children) return null;
  return (
    <div className="flex justify-center px-4 pt-1">
      <span className={cn(SANS, "inline-block max-w-full border border-[#111] bg-[#111] px-10 py-[15px] text-center text-[12px] uppercase tracking-[2.5px] text-white")}>
        {children}
      </span>
    </div>
  );
}

function ProductCard({ product: p }: { product: NewsletterProduct }) {
  /* Ad iki satır: ürün + ayrıntı ("Silver Wirework / Tulle Headpiece"). */
  const words = p.name.split(/\s+/).filter(Boolean);
  const cut = Math.ceil(words.length / 2);
  return (
    <div className="px-1">
      {p.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.image_url} alt={p.name} className="block aspect-[4/5] w-full bg-[#f1f1f1] object-cover" loading="lazy" />
      ) : (
        <div className="aspect-[4/5] bg-[#f1f1f1]" />
      )}
      <div className={cn(SERIF, "px-1 pb-0.5 pt-[18px] text-center text-[16px] leading-[1.35]")}>{words.slice(0, cut).join(" ")}</div>
      <div className={cn(SANS, "px-1 pb-7 text-center text-[12px] leading-[1.5]")}>{words.slice(cut).join(" ")}</div>
    </div>
  );
}

function MailFooter() {
  const menu = ["COLLECTIONS", "NEW IN", "STORIES", "ABOUT", "CONTACT"];
  return (
    <div className={cn(SANS, "bg-black px-4 pb-10 pt-[52px] text-center sm:px-7")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brands/af-mark.png" alt="Aslı Filinta" className="mx-auto mb-[30px] h-auto w-[120px] max-w-[28%]" />
      <div className="mb-[14px] space-y-[18px]">
        {menu.map((m) => <p key={m} className="text-[12px] leading-none tracking-[2.5px] text-white">{m}</p>)}
      </div>
      <div className="mt-[30px] border-t border-[#2a2a2a] pt-[26px] text-[11px] leading-[1.8] text-[#a6a6a6]">
        <p>You received this email because you are an Aslı Filinta email subscriber.<br />
          To be removed from our email list, please click here: <span className="text-[#d9d9d9] underline">unsubscribe</span></p>
        <p className="pt-4">© 2026 ASLI FILINTA · İstanbul, Türkiye</p>
      </div>
    </div>
  );
}
