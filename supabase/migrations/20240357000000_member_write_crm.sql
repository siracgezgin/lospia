-- ÜYE DE YAZAR: CRM (Sıraç, 26.09.2026: "onu da aç").
--
-- ÖNCE BİR DÜZELTME — BU MIGRATION YETKİ GENİŞLETMİYOR, DARALTIYOR.
--
-- 26.09.2026 denetiminde çıktı: `workspace_contacts` üzerindeki RLS ZATEN
-- üyeye tamamen açıktı. 20240104 tabloyu kurarken dört politikayı da "çalışma
-- alanının herhangi bir üyesi" seviyesinde yazdı (select/insert/update/delete)
-- ve sonraki hiçbir migration bunları daraltmadı. CRM'i yöneticiye kilitleyen
-- tek şey `lib/actions/crm.ts` içindeki `requireContactAdmin`'di — yani bir
-- ARAYÜZ kilidiydi. Ekranda "Salt görüntüleme" yazan üye, doğrudan PostgREST
-- çağrısıyla bugün de yazıp silebiliyordu.
--
-- Dolayısıyla "CRM'i üyeye açalım" işi, veritabanı tarafında tam tersini
-- gerektiriyor: fazla olan yetkiyi budamak. Bu notu ileride "biz bunu
-- kapatmıştık" yanılgısına düşmemek için bırakıyorum.
--
-- ── ÇİZGİ NEREDE ──────────────────────────────────────────────────────────
-- 20240356'da föy/fihrist için kurulan kuralın aynısı:
--   · CRM kaydı (kind='external') → üye AÇAR ve DÜZENLER.
--   · Ekip kaydı (kind='team')    → yalnız yönetici. Bunlar Pano'da atanabilir
--     kişiler; `workspace_contacts` iki iş birden yapıyor (20240322) ve CRM
--     listesi yalnız 'external' çekiyor. Yazmayı türe bağlamazsak bir üye,
--     listede hiç görünmeyen bir ekip kaydının id'siyle Selen'in kaydını
--     değiştirebilirdi.
--   · SİLME → yöneticide. Bir CRM kişisi silinince
--     `tasks.responsible_contact_id` `on delete set null` ile SESSİZCE boşalır
--     (20240105000000): başkasının panosundaki sorumlu, hata vermeden düşer.
--     Kayıt tek föyün verisi değil, çalışma alanının ortak sözlüğü.
--
-- `is_workspace_member` yeterli: `workspace_role` enum'unda yalnız
-- owner/admin/member var (20240101:86), yani "üye" zaten "yazar" demek.
-- İleride bir 'viewer' rolü eklenirse daraltılacak tek yer burasıdır.
--
-- İdempotent ve EKLEYİCİ: hiçbir satıra dokunmuyor, yalnız politika değiştiriyor.

-- ── INSERT ────────────────────────────────────────────────────────────────
-- Üye yalnız CRM kaydı açabilir; yönetici her türü açabilir. İki politika
-- permissive olduğu için OR'lanır.
drop policy if exists "workspace members can insert contacts" on public.workspace_contacts;
drop policy if exists "workspace_contacts: members insert external" on public.workspace_contacts;
create policy "workspace_contacts: members insert external"
  on public.workspace_contacts for insert
  with check (is_workspace_member(workspace_id) and kind = 'external');

drop policy if exists "workspace_contacts: admin insert any" on public.workspace_contacts;
create policy "workspace_contacts: admin insert any"
  on public.workspace_contacts for insert
  with check (is_workspace_admin(workspace_id));

-- ── UPDATE ────────────────────────────────────────────────────────────────
-- USING eski satıra, WITH CHECK yeni satıra bakar. İkisinde de kind='external'
-- arandığı için üye ne bir ekip kaydını düzenleyebilir ne de bir CRM kaydını
-- 'team'e çevirip Pano'nun atanabilir listesine sokabilir.
drop policy if exists "workspace members can update contacts" on public.workspace_contacts;
drop policy if exists "workspace_contacts: members update external" on public.workspace_contacts;
create policy "workspace_contacts: members update external"
  on public.workspace_contacts for update
  using (is_workspace_member(workspace_id) and kind = 'external')
  with check (is_workspace_member(workspace_id) and kind = 'external');

drop policy if exists "workspace_contacts: admin update any" on public.workspace_contacts;
create policy "workspace_contacts: admin update any"
  on public.workspace_contacts for update
  using (is_workspace_admin(workspace_id))
  with check (is_workspace_admin(workspace_id));

-- ── DELETE ────────────────────────────────────────────────────────────────
-- Bugün ÜYEDE olan silme yetkisi yöneticiye alınıyor (yukarıdaki gerekçe).
drop policy if exists "workspace members can delete contacts" on public.workspace_contacts;
drop policy if exists "workspace_contacts: admin delete" on public.workspace_contacts;
create policy "workspace_contacts: admin delete"
  on public.workspace_contacts for delete
  using (is_workspace_admin(workspace_id));

-- SELECT olduğu gibi kalıyor: herkes görür (20240104).

comment on column public.workspace_contacts.kind is
  'external = CRM ilişkisi (üye de yazar) · team = Pano''da atanabilir ekip (yalnız yönetici). RLS bu ayrıma dayanır — bkz. 20240357.';
