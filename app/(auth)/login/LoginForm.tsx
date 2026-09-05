"use client";

import { useRef, useState, useTransition } from "react";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { signIn } from "@/lib/actions/auth";
import { Field, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

/**
 * GİRİŞ FORMU — tek form, iki alan, tek düğme.
 *
 * Kendi kendine gönderim (`<form action={serverAction}>`) DEĞİL, elle
 * kontrol edilen bir gönderim kullanır ve bunun tek bir sebebi var: React,
 * bir form eylemi tamamlandığında kontrolsüz alanları KENDİLİĞİNDEN
 * sıfırlar. Şifre yanlış girildiğinde kullanıcı doğru yazdığı kullanıcı
 * adını da kaybediyor, her denemede baştan yazıyordu. Alanlar artık
 * kontrollü: hata sonrası yazılan her şey yerinde durur, imleç şifreye
 * gider.
 *
 * Public self-signup yok — hesapları yönetici Ayarlar → "Hesap oluştur"
 * ekranından açar. Buradaki tek yol kullanıcı adı (ya da e-posta) + şifre.
 */
export function LoginForm({ initialEmail = "" }: { initialEmail?: string }) {
  const [identifier, setIdentifier] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Hangi alan kırmızı çerçevelenecek? "Şifrenizi yazın." derken kullanıcı
     adını da hatalı işaretlemek yanlış yönlendirir; kimlik doğrulama hatası
     ise (hangisi yanlış söylenmez — hesap sayımı yapılmasın) ikisini birden
     işaretler. */
  const [errorField, setErrorField] = useState<"identifier" | "password" | "both" | null>(null);
  const [pending, startTransition] = useTransition();
  const identifierRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Enter ile gönderim de buradan geçer (native submit), ayrı bir tuş
    // dinleyicisine gerek yok.
    event.preventDefault();
    if (pending) return;
    setError(null);
    setErrorField(null);

    /* Boş alan için sunucuya gitmeye gerek yok. Tarayıcının kendi uyarısı
       (noValidate ile kapalı) tarayıcı diliyle çıkıyordu — mesaj burada
       Türkçe ve alanın odağıyla birlikte verilir. */
    if (identifier.trim() === "") {
      setError("Kullanıcı adınızı veya e-posta adresinizi yazın.");
      setErrorField("identifier");
      identifierRef.current?.focus();
      return;
    }
    if (password === "") {
      setError("Şifrenizi yazın.");
      setErrorField("password");
      passwordRef.current?.focus();
      return;
    }

    const data = new FormData();
    data.set("identifier", identifier);
    data.set("password", password);

    startTransition(async () => {
      try {
        // Başarılıysa sunucu eylemi /home'a yönlendirir ve buradan hiçbir
        // değer dönmez; yalnız hata durumunda bir mesaj gelir.
        const result = await signIn(null, data);
        if (result?.error) {
          setError(result.error);
          setErrorField("both");
          // Yanlış şifre en olası durum: imleci oraya koy, metni seç ki
          // kullanıcı silmeden üzerine yazabilsin.
          passwordRef.current?.focus();
          passwordRef.current?.select();
        }
      } catch (cause) {
        /* Başarılı girişte sunucu eylemi redirect() çağırır. Bu sinyal
           normalde istemciye hata olarak ULAŞMAZ (Next gezinmeyi kendisi
           yapar); ulaşırsa da bir arıza değildir — "bağlantınızı kontrol
           edin" yazmak, giriş tam olurken ekrana yanlış hata basmak olurdu.
           Sinyali tanıyıp olduğu gibi geçiririz. */
        const digest = (cause as { digest?: unknown } | null)?.digest;
        if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
          throw cause;
        }
        setError("Giriş yapılamadı. Bağlantınızı kontrol edip tekrar deneyin.");
        setErrorField("both");
      }
    });
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label="Kullanıcı adı" htmlFor="identifier">
          <TextInput
            ref={identifierRef}
            id="identifier"
            name="identifier"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            required
            /* Gönderim sırasında alanlar KİLİTLENMEZ: `disabled` verilirse
               hata döndüğünde odak o alana taşınamıyor (devre dışı öğe odak
               almaz) ve kullanıcı boş ekranda kalıyordu. Çift gönderimi
               düğmenin `loading` durumu ve baştaki `pending` kontrolü
               engelliyor. */
            aria-invalid={errorField === "identifier" || errorField === "both" || undefined}
            className="h-10"
          />
        </Field>

        <Field label="Şifre" htmlFor="password">
          {/* Göster/gizle düğmesi alanın İÇİNDE duruyor; bu yüzden Field'a
              htmlFor elle verildi (tek çocuk kuralı burada geçerli değil,
              sarmalayıcı bir <div> var). */}
          <div className="relative">
            <TextInput
              ref={passwordRef}
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              required
              aria-invalid={errorField === "password" || errorField === "both" || undefined}
              className="h-10 pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
              aria-pressed={showPassword}
              title={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
              /* Parmak hedefi 40px: alanın tam yüksekliği kadar. */
              className="absolute right-0 top-0 grid h-10 w-10 place-items-center rounded-control text-subtle transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
            >
              {showPassword ? (
                <EyeOff size={16} aria-hidden />
              ) : (
                <Eye size={16} aria-hidden />
              )}
            </button>
          </div>
        </Field>

        {error && (
          <div
            role="alert"
            className="anim-fade-down flex items-start gap-2 rounded-control border border-danger/25 bg-danger/8 px-3 py-2.5 text-[13px] leading-relaxed text-danger"
          >
            <AlertCircle size={14} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        )}

        <Button type="submit" loading={pending} className="h-10 w-full text-[14px]">
          {pending ? "Giriş yapılıyor…" : "Giriş yap"}
        </Button>
      </form>

      <p className="text-center text-[12.5px] text-subtle">
        Hesabınız yoksa yöneticinize başvurun.
      </p>
    </div>
  );
}
