-- ============================================================================
-- Üretim Föyü — eksiksizlik ve konfirmasyon
-- ----------------------------------------------------------------------------
-- Aslı Hanım (2026-08-21 ses kaydı):
--   "Bu üretim föyleri beni delirtti. Üç kere oturtturdum, üç kere başlarına
--    üretimden yıllarca tecrübeli insanları koydum… Bu da kalktı kendi kafasına
--    göre formatı değiştirdi."
--   "Bir ürünün üretilmesi için üreticiye gidecek olan dosyanın EKSİKSİZ bir
--    şekilde sendeki föye girmesini istiyorum."
--   "Onlar föyü hazırladıktan sonra NİSA'YLA BERABER KONFİRME EDEREK bana
--    göstermenizi istiyorum. Bir tane daha üretim föyü revizesi vermek
--    istemiyorum çünkü."
--
-- Yani sorun formatın kendisi değil, DİSİPLİN: föy eksik gidiyor ve doğrudan
-- Aslı Hanım'a ulaşıyor. Bu migration o akışı veriye geçirir:
--   hazırla → (eksiksiz mi?) → Nisa konfirme → Aslı'ya göster
--
-- confirmed_at BİLEREK "sarsılabilir" bir damgadır: föy her güncellendiğinde
-- trigger onu temizler. Konfirme edilmiş bir föy sessizce değiştirilip
-- "konfirme" görünmeye devam edemez — Aslı Hanım'ın şikâyeti tam olarak buydu.
--
-- İdempotent: add column if not exists / drop trigger if exists + create.
-- ============================================================================

alter table public.production_sheets
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid references public.profiles(id) on delete set null;

comment on column public.production_sheets.confirmed_at is
  'Föy konfirme edildiği an. Föy güncellenince trigger ile SIFIRLANIR.';
comment on column public.production_sheets.confirmed_by is
  'Konfirme eden kişi (Aslı Hanım''ın akışında Nisa).';

create index if not exists production_sheets_confirmed_idx
  on public.production_sheets(workspace_id, confirmed_at);

-- ---------------------------------------------------------------------------
-- İçerik değişince konfirmasyon düşer.
--
-- Yalnız konfirmasyon alanlarının kendisi değiştiğinde tetiklenmez — yoksa
-- "konfirme et" işleminin kendisi damgayı anında siler. updated_at ve
-- updated_by da hariç: her yazmada değişirler, tek başlarına içerik değişimi
-- anlamına gelmezler.
-- ---------------------------------------------------------------------------
create or replace function public.production_sheet_reset_confirmation()
returns trigger
language plpgsql
as $$
begin
  -- Bu güncelleme SADECE konfirmasyonu mu değiştiriyor? Öyleyse dokunma.
  if (new.confirmed_at is distinct from old.confirmed_at
      or new.confirmed_by is distinct from old.confirmed_by)
     and to_jsonb(new) - 'confirmed_at' - 'confirmed_by' - 'updated_at' - 'updated_by'
       = to_jsonb(old) - 'confirmed_at' - 'confirmed_by' - 'updated_at' - 'updated_by'
  then
    return new;
  end if;

  -- İçerikte gerçek bir değişiklik var → konfirmasyon geçersiz.
  if to_jsonb(new) - 'confirmed_at' - 'confirmed_by' - 'updated_at' - 'updated_by'
     is distinct from
     to_jsonb(old) - 'confirmed_at' - 'confirmed_by' - 'updated_at' - 'updated_by'
  then
    new.confirmed_at := null;
    new.confirmed_by := null;
  end if;

  return new;
end;
$$;

drop trigger if exists production_sheets_reset_confirmation on public.production_sheets;
create trigger production_sheets_reset_confirmation
  before update on public.production_sheets
  for each row execute function public.production_sheet_reset_confirmation();

grant select, insert, update, delete on public.production_sheets to authenticated;
grant all on public.production_sheets to service_role;
