"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BackLink } from "@/components/modules/BackLink";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { DocumentFormModal } from "./DocumentFormModal";
import {
  DriveBrowser, type DocFolder, type DocFile, type DocItem, type SheetItem, type LinkItem,
} from "./DriveBrowser";
import type { OperationDocument, WorkspaceDepartment } from "@/types";

interface Props {
  documents: OperationDocument[];
  /** Klasör ağacı + yüklenmiş dosyalar (20240312). */
  folders?: DocFolder[];
  files?: DocFile[];
  docs?: DocItem[];
  sheets?: SheetItem[];
  /** Klasör tablosu migrate edilmemişse tarayıcı çizilmez. */
  filesAvailable?: boolean;
  departments: Pick<WorkspaceDepartment, "id" | "name">[];
  tasks: { id: string; title: string }[];
  contacts: { id: string; name: string }[];
  memberNames: Record<string, string>;
  memberAvatars?: Record<string, string | null>;
  currentUserId: string;
  isAdmin: boolean;
}

/**
 * AF Teamwork — TEK DRIVE.
 *
 * Bu ekran bir süre üç parçaydı: üstte "Sheets / Library" bölüm kartları,
 * ortada klasör tarayıcısı, altta dokuz sütunluk bir "Bağlantılar" tablosu ve
 * başlıkta ayrı bir "Yeni doküman ekle" düğmesi. Sıraç (2026-08-29):
 *   "Bu ayrıma neden gerek duyduk, biz zaten her şeyi burada verelim dedik."
 *   "Şu bağlantılar kısmı çok boş kalmış, kötü duruyor."
 *   "Yeni doküman ekle ile Yeni arasındaki fark ne? Çok karmaşık geliyor."
 * Üçü de aynı sebebin belirtisiydi: İÇERİK iki ayrı yerde, ÜRETİM iki ayrı
 * düğmedeydi.
 *
 * Artık tek ızgara ve tek "+ Yeni" menüsü var. Bağlantı da klasörün içinde bir
 * öğedir; Kütüphane bir bölüm değil, açılacak bir KLASÖRdür.
 *
 * Bu bileşenin tek işi kaldı: Drive'ı çizmek ve bağlantı formunu yönetmek.
 *
 * NOT: /documents bir KÖK sayfadır — BackLink orada kendini çizmez
 * (lib/nav/parent-path.ts). Klasöre girildiğinde gezinmeyi kırıntı yolu
 * üstlenir.
 */
export function DocumentsView({
  documents, departments, tasks, contacts, memberNames, memberAvatars = {}, currentUserId, isAdmin,
  folders = [], files = [], docs = [], sheets = [], filesAvailable = false,
}: Props) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<OperationDocument | null>(null);
  /** Yeni bağlantının açılacağı klasör — Drive'daki kırıntı yolundan gelir. */
  const [linkFolder, setLinkFolder] = useState<string | null>(null);

  /* Bağlantılar = dosya ve yazı DIŞINDAKİ kayıtlar (Drive, Canva, Figma…).
     Arşivlenmiş olan ızgarada görünmez; kayıt silinmez, yalnız gözden kalkar.

     `created_by` ve `visibility` TAŞINIR (2026-09-05). Taşınmadığı sürece
     Drive tarafında bağlantının sahibi bilinmiyordu: üye kendi eklediği
     bağlantıyı düzenleyemiyor, silemiyordu (⋯ menüsü boş çıkıyordu) ve
     "Sahibi" sütunu hep "—" yazıyordu. `visibility` kolonu üretilen tipte
     yok — satır Supabase'den `select("*")` ile geldiği için değer elde var,
     yalnız okunması gerekiyor. */
  const links: LinkItem[] = useMemo(
    () =>
      documents
        .filter((d) => d.document_type !== "file" && d.document_type !== "doc")
        .filter((d) => d.status !== "archived")
        .map((d) => ({
          id: d.id,
          title: d.title,
          folder_id: d.folder_id ?? null,
          url: d.url,
          document_type: d.document_type,
          updated_at: d.updated_at,
          created_by: d.created_by ?? null,
          visibility:
            ((d as unknown as { visibility?: string | null }).visibility ?? "all") === "admin"
              ? ("admin" as const)
              : ("all" as const),
        })),
    [documents],
  );

  /* Kural RLS (20240334) ve server action'larla BİREBİR aynı: yönetici her
     kaydı, ekleyen kendi kaydını düzenler — DURUMDAN bağımsız. Durum şartı
     burada kalınca üye yayımlanan kendi kaydını silebiliyor ama
     düzeltemiyordu; ekran salt-okunur açılırken action izin veriyordu.
     Durum YÜKSELTME koruması ayrı: üyeye approve/archive seçeneği çıkmıyor. */
  function canMutate(d: OperationDocument) {
    return isAdmin || d.created_by === currentUserId;
  }

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      {/* Başlık uygulama çubuğunda; burada yalnız ekran okuyucu için. "Geri"
          ayrı bir satır açmasın diye Drive'ın araç çubuğuna gömülüyor. */}
      <h1 className="sr-only">AF Teamwork</h1>

      {filesAvailable ? (
        <DriveBrowser
          folders={folders}
          files={files}
          docs={docs}
          sheets={sheets}
          links={links}
          memberNames={memberNames}
          memberAvatars={memberAvatars}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          rootLabel="AF Teamwork"
          leading={<BackLink />}
          onNewLink={(folderId) => { setEditing(null); setLinkFolder(folderId); setModalOpen(true); }}
          onEditLink={(id) => {
            const d = documents.find((x) => x.id === id) ?? null;
            setEditing(d); setLinkFolder(null); setModalOpen(true);
          }}
        />
      ) : (
        <SetupRequiredNotice
          variant="block"
          title="AF Teamwork klasörleri henüz oluşturulmadı"
          message="Klasör tablosu için veritabanı güncellemesi bekleniyor (20240312)."
        />
      )}

      {modalOpen && (
        <DocumentFormModal
          departments={departments}
          tasks={tasks}
          contacts={contacts}
          document={editing}
          folderId={linkFolder}
          isAdmin={isAdmin}
          readOnly={editing ? !canMutate(editing) : false}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); router.refresh(); }}
        />
      )}
    </div>
  );
}
