import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AtSign, LogOut, Shield, Home, ListChecks, CalendarDays, Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { AvatarUploader } from "@/components/settings/AvatarUploader";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { Button } from "@/components/ui/Button";
import { assignPersonTones } from "@/lib/design/person-colors";
import { getPersonDisplayName } from "@/lib/utils/person-display";
import { roleLabel, personTitle } from "@/lib/utils/roles";
import { isPlaceholderEmail } from "@/lib/utils/notification-email";
import { canManageSettings } from "@/lib/auth/permissions";
import { signOut } from "@/lib/actions/auth";
import type { WorkspaceRole } from "@/types";

export const metadata = { title: "Profile" };

/**
 * PROFİL — kişinin kendi sayfası.
 *
 * Sıraç (2026-08-29): "Profilimde sadece [fotoğraf] ekleme var. Bu kısım daha
 * iyileştirilebilir olmalı ya da diğer kısımlarla birleştirilip yapılabilir.
 * Bir de bu şu an admin, üyede nasıl olacak?"
 *
 * Eski hali SALT OKUNURDU: fotoğraf dışında hiçbir şey değiştirilemiyordu, ad
 * ve ünvan yalnız yöneticinin Ayarlar ekranından yazılabiliyordu — yani bir
 * tasarımcı kendi ünvanını yazamıyordu. Üstelik `max-w-2xl` yüzünden sayfanın
 * sağ yarısı bomboş duruyordu.
 *
 * ÜYE / YÖNETİCİ FARKI: sayfa ikisi için de AYNIDIR. Ad, ünvan, fotoğraf ve
 * bildirim adresi herkesin kendi verisidir. Rol yalnız YAZILIR, seçilemez —
 * rol değiştirmek Ayarlar'ın (yönetici) işidir. Tek fark yan sütundaki
 * "Ayarlar" kısayolunun yalnız yöneticide görünmesi.
 */
export default async function ProfilePage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("id, workspace_id, role, job_title, notification_email")
    .eq("user_id", user.id)
    .limit(1);
  const me = memberRows?.[0] as
    | {
        id: string;
        workspace_id: string;
        role: string;
        job_title?: string | null;
        notification_email?: string | null;
      }
    | undefined;
  const role = (me?.role ?? "member") as WorkspaceRole;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, username, avatar_url, email")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = getPersonDisplayName(profile?.full_name ?? user.email ?? null);

  /* Kişinin kimlik rengi — fotoğraf yoksa baş harflerin arkasındaki renk
     panodakiyle AYNI olsun diye ekip geneli atamadan hesaplanır. */
  const { data: teamRows } = await supabase
    .from("workspace_members")
    .select("user_id, color_key, icon_key")
    .eq("workspace_id", me?.workspace_id ?? "");
  const team = (teamRows ?? []) as { user_id: string; color_key: string | null; icon_key: string | null }[];
  const myTone = assignPersonTones(
    team.map((m) => m.user_id),
    Object.fromEntries(team.map((m) => [m.user_id, { colorKey: m.color_key, iconKey: m.icon_key }])),
  )[user.id];

  const isAdmin = canManageSettings(role);

  /* Yer tutucu (@lospia.local) bir e-posta değil, iç giriş anahtarıdır —
     kişinin adresi diye gösterilmez (bkz. lib/utils/display-identity). */
  const rawLogin = profile?.email ?? user.email ?? null;
  const loginAddress = rawLogin && !isPlaceholderEmail(rawLogin) ? rawLogin : null;

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      {/* Başlık uygulama çubuğunda zaten yazıyor. */}
      <h1 className="sr-only">Profile</h1>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        {/* ── Kimlik + düzenlenebilir alanlar ──────────────────────────── */}
        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card lg:col-span-2">
          {/* TEK SATIR: rozet · ad + ünvan · "Fotoğraf yükle".
              Önce fotoğraf yükleyici solda, isim sağdaydı — karta bakan önce
              bir yükleme düğmesi görüyordu. Sonra isim üste alındı ama bu kez
              fotoğraf alt satıra düştü (2026-08-29: "alt satır değil ya, ikon
              ismin solunda olsun, fotoğraf yükle sağında olsun, tek satırda
              bitir işi"). */}
          <div className="border-b border-hairline px-5 py-4">
            <AvatarUploader
              userId={user.id}
              name={displayName}
              photoUrl={profile?.avatar_url ?? null}
              colorHex={myTone?.hex ?? null}
              nameSlot={
                <>
                  <p className="truncate text-[16px] font-semibold tracking-tight text-ink">{displayName}</p>
                  <p className="truncate text-[12.5px] text-muted">
                    {personTitle({ jobTitle: me?.job_title, role, viewerIsAdmin: isAdmin }) ?? "Ünvan eklenmedi"}
                  </p>
                </>
              }
            />
          </div>

          <div className="px-5 py-5">
            <ProfileForm
              memberId={me?.id ?? null}
              fullName={profile?.full_name ?? ""}
              jobTitle={me?.job_title ?? null}
              notificationEmail={me?.notification_email ?? null}
            />
          </div>
        </section>

        {/* ── Hesap + kısayollar ───────────────────────────────────────── */}
        <div className="space-y-4">
          <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <h2 className="border-b border-hairline px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">
              Hesap
            </h2>
            <dl className="divide-y divide-hairline">
              {/* Rol YALNIZ yöneticide. Üye kendi ünvanını yukarıdan yazar ve
                  her ekranda onunla görünür (2026-08-29). */}
              {isAdmin && <Row icon={Shield} label="Rol" value={roleLabel(role)} />}
              {/* GİRİŞ ADRESİ — yalnız GERÇEK adres yazılır.
                  Yöneticinin açtığı hesaplar `<kullanıcı>@lospia.local` iç
                  yer tutucusuyla giriş yapar; bu bir e-posta değil, sistemin
                  kendi anahtarıdır. Ekranda "alev.elmas@lospia.local" görmek
                  kişiye kendi adresi diye yanlış bir şey söylüyordu
                  (Sıraç, 2026-08-29: "çok saçma olmuş, kişinin kendi maili var
                  zaten"). Yer tutucuysa satır hiç çizilmez — kullanıcı adı
                  satırı zaten hesabı tarif ediyor. */}
              {loginAddress && <Row icon={AtSign} label="Giriş adresi" value={loginAddress} />}
              {profile?.username && <Row icon={AtSign} label="Kullanıcı adı" value={profile.username} />}
            </dl>
          </section>

          <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <h2 className="border-b border-hairline px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">
              Kısayollar
            </h2>
            <div className="divide-y divide-hairline">
              <Shortcut href="/home" icon={Home} label="Ana Sayfa" />
              <Shortcut href="/list?view=mine" icon={ListChecks} label="İşlerim" />
              <Shortcut href="/planning" icon={CalendarDays} label="Calendar" />
              {isAdmin && <Shortcut href="/settings" icon={SettingsIcon} label="Ayarlar" />}
            </div>
          </section>

          {/* Çıkış — yıkıcı değil ama sayfanın Kaydet'iyle yarışmasın:
              çerçeveli ikincil düğme, kırmızı metin. */}
          <form action={signOut}>
            <Button
              type="submit"
              variant="secondary"
              className="w-full text-danger hover:bg-danger/10 hover:text-danger"
            >
              <LogOut size={15} aria-hidden />
              Çıkış yap
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

/** Salt okunur hesap satırı. */
function Row({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-2.5">
      <dt className="flex shrink-0 items-center gap-2 text-[13px] text-muted">
        <Icon size={14} className="shrink-0 text-subtle" aria-hidden />
        {label}
      </dt>
      <dd className="min-w-0 truncate text-[13.5px] font-medium text-ink">{value}</dd>
    </div>
  );
}

/** Kısayol satırı — hepsi aynı yükseklikte, aynı ikon boyunda. */
function Shortcut({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-5 py-2.5 text-[13.5px] text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
    >
      <Icon size={15} className="shrink-0 text-subtle" aria-hidden />
      {label}
    </Link>
  );
}
