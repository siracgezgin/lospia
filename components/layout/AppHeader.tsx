"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { ChevronDown, LogOut, Mail, Shield, Settings, UserRound, Bell } from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { getPersonDisplayName } from "@/lib/utils/person-display";
import { ROLE_LABELS, personTitle } from "@/lib/utils/roles";
import { canManageSettings } from "@/lib/auth/permissions";
import { signOut } from "@/lib/actions/auth";
import type { Workspace, Notification, WorkspaceRole } from "@/types";

interface Props {
  workspace: Pick<Workspace, "id" | "name"> | null;
  unreadCount: number;
  userId: string;
  userName?: string | null;
  userEmail?: string | null;
  /** profiles.avatar_url — kişinin kendi fotoğrafı. */
  userAvatarUrl?: string | null;
  /** workspace_members.job_title — rol yerine bunu yazarız (bkz. personTitle). */
  userJobTitle?: string | null;
  notifications?: Notification[];
  deadTaskIds?: string[];
  userRole?: WorkspaceRole;
}

// Page-context titles. Header shows WHERE you are; the sidebar owns brand/workspace.
// Adlar sidebar etiketleriyle BİREBİR aynı olmalı (tek terminoloji kuralı).
const PAGE_TITLES: { match: (p: string) => boolean; title: string }[] = [
  { match: (p) => p.startsWith("/home"), title: "Home Page" },
  { match: (p) => p.startsWith("/admin-board"), title: "Admin Board" },
  { match: (p) => p.startsWith("/board"), title: "Board" },
  { match: (p) => p.startsWith("/planning"), title: "Calendar" },
  { match: (p) => p.startsWith("/list"), title: "List" },
  /* Raporlar List yüzeyinin son SEKMESİDİR ama kendi adı vardır: dizinde
     (MODULE_DIRECTORY) ve sayfanın metadata.title'ında "Reports" yazıyor.
     Başlık "List" derken kart "Reports" diyordu — kullanıcı "Reports"a
     tıklayıp "List" yazan bir ekrana düşüyordu (tek terminoloji kuralı).
     Menüde yine List satırı yanar (bkz. lib/nav/app-nav → ROUTE_OWNER):
     yüzey aynı, ekranın adı kendi adı. */
  { match: (p) => p.startsWith("/dashboard"), title: "Reports" },
  /* Kişi bazlı tek sayfa rapor — /reports/[id]. Eşleşme yoktu ve başlık
     çubuğu bomboş çiziliyordu. */
  { match: (p) => p.startsWith("/reports"), title: "Person Report" },
  // "/collection/maliyet" kendi adını taşır — sıra önemli (startsWith).
  { match: (p) => p.startsWith("/collection/maliyet"), title: "Cost" },
  { match: (p) => p.startsWith("/collection/veri"), title: "Product Data" },
  { match: (p) => p.startsWith("/collection/odeme"), title: "Payment Table" },
  { match: (p) => p.startsWith("/collection"), title: "Collection" },
  { match: (p) => p.startsWith("/production"), title: "Production Sheet" },
  { match: (p) => p.startsWith("/finance"), title: "Finance" },
  { match: (p) => p.startsWith("/modules"), title: "Operation Modules" },
  { match: (p) => p.startsWith("/documents"), title: "AF Teamwork" },
  { match: (p) => p.startsWith("/sheets"), title: "AF Teamwork" },
  { match: (p) => p.startsWith("/crm"), title: "CRM" },
  { match: (p) => p.startsWith("/activity"), title: "Activity Log" },
  { match: (p) => p.startsWith("/profile"), title: "Profile" },
  { match: (p) => p.startsWith("/rules"), title: "Rules" },
  { match: (p) => p.startsWith("/archive"), title: "Archive" },
  { match: (p) => p.startsWith("/trash"), title: "Trash" },
  { match: (p) => p.startsWith("/settings"), title: "Settings" },
  { match: (p) => p.startsWith("/tasks/"), title: "Task" },
];

/**
 * PROFİL MENÜSÜ — kimlik + kişinin kendi sayfalarına giden kapı.
 *
 * Sıraç (2026-08-29): "En basitinden webde sağ üstte profil kartına tıklayınca
 * bir anlam ifade etmiyor ama aslında anlam ifade etmeli. Sitede işlevsiz,
 * gereksiz şeyler olmamalı."
 *
 * Haklı iki eksik vardı:
 *  • Menüde /profile'a giden bağlantı YOKTU. Üye için menü yalnız adını
 *    tekrar edip "Çıkış yap" sunuyordu — yani hiçbir işe yaramıyordu.
 *  • Uygulamada fotoğraf yükleyici var (Ayarlar → Kimlik) ama başlıktaki
 *    rozet baş harf çiziyordu; kişi kendi fotoğrafını yükleyip hiçbir yerde
 *    göremiyordu. Artık her yerdeki ile aynı `PersonAvatar`.
 */
function ProfileMenu({
  displayName,
  email,
  role,
  photoUrl,
  jobTitle,
}: {
  displayName: string;
  email: string | null;
  role: WorkspaceRole;
  photoUrl: string | null;
  jobTitle: string | null;
}) {
  /* Rol bir YETKİ bilgisidir. Ünvan yazılmışsa o görünür; yazılmamışsa rol
     yalnız yöneticiye çıkar (bkz. lib/utils/roles.ts → personTitle). */
  const viewerIsAdmin = canManageSettings(role);
  const subtitle = personTitle({ jobTitle, role, viewerIsAdmin });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      /* Esc menüyü kapatır ve odağı AÇAN düğmeye geri verir. Geri vermeyince
         klavye kullanıcısı sayfanın en başına düşüyordu. */
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-2 rounded-control py-1 pl-2 pr-1.5 transition-colors duration-150 hover:bg-surface-muted active:bg-surface-sunken"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Hesap menüsü — ${displayName}`}
        title={subtitle ? `${displayName} · ${subtitle}` : displayName}
      >
        <PersonAvatar name={displayName} photoUrl={photoUrl} size="sm" />
        <div className="hidden flex-col text-left leading-tight sm:flex">
          <span className="max-w-[160px] truncate text-[13px] font-medium text-ink">{displayName}</span>
          {subtitle && <span className="max-w-[160px] truncate text-[12px] text-subtle">{subtitle}</span>}
        </div>
        <ChevronDown
          size={13}
          className={`text-subtle transition-transform duration-200 ease-standard ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="anim-fade-down absolute right-0 top-full z-50 mt-1.5 w-64 origin-top-right overflow-hidden rounded-card border border-line bg-surface shadow-pop"
        >
          {/* Kimlik — ad + e-posta. Rol aşağıda BİR kez yazar. */}
          <div className="flex items-center gap-3 border-b border-line bg-surface-muted/60 px-4 py-3.5">
            <PersonAvatar name={displayName} photoUrl={photoUrl} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{displayName}</p>
              <p className="flex items-center gap-1.5 truncate text-[12px] text-subtle">
                <Mail size={11} className="shrink-0" />
                <span className={email ? "truncate" : "truncate italic text-subtle/80"}>
                  {email ?? "E-posta eklenmedi"}
                </span>
              </p>
            </div>
          </div>

          {/* Rol satırı YALNIZ yöneticide. Üye kendi ünvanını Profil'den yazar
              ve her yerde onunla görünür. */}
          {viewerIsAdmin && (
            <div className="border-b border-line px-4 py-2.5">
              <div className="flex items-center gap-2 text-[12.5px] text-muted">
                <Shield size={13} className="shrink-0 text-subtle" />
                <span>{ROLE_LABELS[role]}</span>
              </div>
            </div>
          )}

          <div className="py-1">
            <MenuLink href="/profile" icon={UserRound} label="Profilim" onGo={() => setOpen(false)} />
            {/* Hareket kaydı VERİ DÜZEYİNDE yönetici-only (RLS). Bağlantı herkese
                çiziliyordu: üye tıklıyor ve "bu alan yalnızca yöneticilere açık"
                ekranına düşüyordu (Sıraç, 2026-08-29: "bu da gereksiz bilgi").
                Çıkmaza götüren kapıyı hiç açmamak, çıkmazı açıklamaktan iyidir. */}
            {canManageSettings(role) && (
              <>
                <MenuLink href="/activity" icon={Bell} label="Hareketlerim" onGo={() => setOpen(false)} />
                <MenuLink href="/settings" icon={Settings} label="Ayarlar" onGo={() => setOpen(false)} />
              </>
            )}
          </div>

          <form action={signOut} className="border-t border-line">
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-muted transition-colors duration-150 hover:bg-danger/10 hover:text-danger"
            >
              <LogOut size={15} className="shrink-0" />
              Çıkış yap
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/** Menü satırı — hepsi aynı yükseklikte, aynı ikon boyunda. */
function MenuLink({
  href, icon: Icon, label, onGo,
}: { href: string; icon: typeof Settings; label: string; onGo: () => void }) {
  return (
    <Link
      href={href}
      onClick={onGo}
      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
    >
      <Icon size={15} className="shrink-0 text-subtle" />
      {label}
    </Link>
  );
}

export function AppHeader({
  unreadCount, userId, userName, userEmail, userAvatarUrl = null, userJobTitle = null, notifications = [], deadTaskIds = [], userRole = "member",
}: Props) {
  const pathname = usePathname();
  const title = PAGE_TITLES.find((t) => t.match(pathname))?.title ?? "";
  const displayName = getPersonDisplayName(userName ?? userEmail ?? null);

  /* Telefonda profil kartı ÇİZİLMEZ: kimlik satırları (Profilim · Çıkış yap)
     artık mobil menü çekmecesinin altında duruyor. İkisini birden göstermek,
     aynı işi iki ayrı yerden yaptıran o "her şey her yerde" hissini üretiyordu
     (2026-08-29). Masaüstünde sol menüde kimlik yok, orada tek kapı bu. */

  return (
    /* KATMAN SIRASI (tek yerde tanımlı):
         z-50  modal / çekmece / açılır liste (portal)
         z-40  uygulama kabuğu — bu başlık + mobil alt gezinme
         z-20  sayfa içi yapışkan başlıklar (ızgara satırı, görev aksiyon çubuğu)
         z-10  kart içi yapışkanlar
       Başlık eskiden z-30'daydı; Planlama ızgarasının yapışkan satırı da
       z-30'daydı ve DOM'da sonra geldiği için profil menüsünün ÜSTÜNE
       çiziliyordu — menü kırpılmış görünüyordu (2026-08-20 geri bildirimi). */
    <header className="relative z-40 flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface px-4 sm:px-5">
      <div className="flex min-w-0 items-center gap-2.5">
        {/* key={pathname} — rota değişince başlık yumuşakça belirir.
            Eşleşme yoksa BOŞ bir <h1> çizilmez: ekran okuyucuya adsız başlık
            duyuruluyordu. */}
        {title && (
          <h1
            key={pathname}
            className="anim-fade truncate text-[15px] font-semibold tracking-tight text-ink"
          >
            {title}
          </h1>
        )}
      </div>

      {/* shrink-0: uzun sayfa başlığı çan/profil alanını sıkıştırmasın —
          telefonda başlık uzayınca çan düğmesi eziliyordu. */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <NotificationBell unreadCount={unreadCount} userId={userId} notifications={notifications} deadTaskIds={deadTaskIds} />
        <div className="hidden md:block">
          <ProfileMenu
            displayName={displayName}
            email={userEmail ?? null}
            role={userRole}
            photoUrl={userAvatarUrl}
            jobTitle={userJobTitle}
          />
        </div>
      </div>
    </header>
  );
}
