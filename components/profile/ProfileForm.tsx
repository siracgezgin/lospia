"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check } from "lucide-react";
import { updateMyProfile } from "@/lib/actions/profile";
import { setMemberNotificationEmail } from "@/lib/actions/workspace";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";

/**
 * Kendi kimliğini düzenleme formu — ad, ünvan ve bildirim adresi.
 *
 * Üçü de KİŞİNİN KENDİ verisidir; yönetici olmak gerekmez. Rol buradan
 * değiştirilemez (o Ayarlar'ın işi) — sayfa rolü yalnız YAZAR. Böylece üye ile
 * yönetici aynı ekranı görür; fark yalnız yan sütundaki "Ayarlar" kısayolu.
 *
 * TEK KOLON: üç alan birbirinin yanında durmayı hak etmiyor (ad ile ünvan
 * "başlangıç · bitiş" gibi bir çift değil); yan yana koymak formu bir tabloya
 * çeviriyordu. Kaydet sayfanın tek primary'si.
 */
export function ProfileForm({
  memberId,
  fullName,
  jobTitle,
  notificationEmail,
}: {
  /** workspace_members.id — bildirim adresi bu satıra yazılır. */
  memberId: string | null;
  fullName: string;
  jobTitle: string | null;
  notificationEmail: string | null;
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState(fullName);
  const [title, setTitle] = useState(jobTitle ?? "");
  const [mail, setMail] = useState(notificationEmail ?? "");

  const dirty =
    name !== fullName || title !== (jobTitle ?? "") || mail !== (notificationEmail ?? "");

  function save() {
    setError(null);
    setSaved(false);
    start(async () => {
      const res = await updateMyProfile({ fullName: name, jobTitle: title });
      if ("error" in res) return setError(res.error);

      // Bildirim adresi ayrı bir kayıtta (workspace_members) ve ayrı doğrulama
      // kuralları var (@lospia.local gibi yer tutucular reddedilir).
      if (memberId && mail !== (notificationEmail ?? "")) {
        const mailRes = await setMemberNotificationEmail({
          memberId,
          notificationEmail: mail.trim() || null,
        });
        if ("error" in mailRes) return setError(mailRes.error);
      }

      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form
      className="max-w-xl space-y-4"
      onSubmit={(e) => { e.preventDefault(); if (dirty && !isPending) save(); }}
    >
      <Field label="Ad soyad" required>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Aslı Filinta" autoComplete="name" />
      </Field>
      <Field label="Ünvan" hint="Kartlarda adınızın altında yazar. Boş bırakırsanız rolünüz yazar.">
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tasarımcı" />
      </Field>

      {memberId && (
        <Field
          label="Bildirim e-postası"
          hint="Sistem maillerinin gittiği gerçek adres. Giriş adresinizden farklı olabilir."
        >
          <TextInput
            type="email"
            value={mail}
            onChange={(e) => setMail(e.target.value)}
            placeholder="ad@aslifilinta.com"
            autoComplete="email"
          />
        </Field>
      )}

      {error && (
        <div role="alert" className="anim-fade-down flex items-start gap-2 rounded-control border border-danger/25 bg-danger/8 px-3 py-2.5 text-[12.5px] leading-relaxed text-danger">
          <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-hairline pt-4">
        <Button type="submit" loading={isPending} disabled={!dirty}>
          Kaydet
        </Button>
        {saved && !dirty && (
          <span className="anim-fade inline-flex items-center gap-1.5 text-[12.5px] font-medium text-success">
            <Check size={14} aria-hidden /> Kaydedildi.
          </span>
        )}
      </div>
    </form>
  );
}
