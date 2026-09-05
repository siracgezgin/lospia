import { redirect, notFound } from "next/navigation";
import { redirectToSignIn } from "@/lib/auth/session-redirect";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { BackLink } from "@/components/modules/BackLink";
import { DocEditor } from "@/components/documents/DocEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "AF Teamwork" };

/**
 * Yazı sayfası — AF Teamwork'ün Word'ü (20240325).
 *
 * Aslı Hanım (2026-08-28): "Bize sunum yaparken biz buradan açalım, Alev'in
 * mailini okuyalım, revize verelim ve o bir format olarak hazırlansın."
 *
 * Düzenleme izni Doküman Merkezi'nin kuralıyla aynı: yönetici her yazıyı,
 * üye kendi taslağını düzenler; gerisi salt okunur.
 */
export default async function TeamworkDocPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirectToSignIn();
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;

  const { id } = await params;
  const { data, error } = await supabase
    .from("operation_documents")
    .select("id, title, body, status, created_by, document_type, folder_id")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error || !data) notFound();

  const row = data as {
    id: string; title: string; body: string | null; status: string;
    created_by: string | null; document_type: string;
  };
  // Bu rota YALNIZ yazılar içindir; dosya/bağlantı kayıtları listede yaşar.
  if (row.document_type !== "doc") notFound();

  /* Sayfa izni ile server action izni AYNI cümle olmalı (RLS 20240334):
     yönetici her yazıyı, ekleyen kendi yazısını — durumdan bağımsız. */
  const canEdit = isAdmin || row.created_by === user.id;

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      {/* Başlık uygulama çubuğunda; "Geri" editörün başlık satırında. */}
      <h1 className="sr-only">AF Teamwork</h1>
      <DocEditor
        backSlot={<BackLink href="/documents" />}
        docId={row.id}
        initialTitle={row.title}
        initialBody={row.body ?? ""}
        readOnly={!canEdit}
      />
    </div>
  );
}
