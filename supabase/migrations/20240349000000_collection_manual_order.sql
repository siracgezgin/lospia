-- KOLEKSİYONDA ELLE SIRALAMA — sürükle bırak.
--
-- Sıraç (2026-09-17): "Bu sayfadakileri de sürükle bırakla yer
-- değiştirebilir miyiz? Bu sıraya göre değil, bizim istediğimiz şekilde
-- olsun."
--
-- Katalog şimdiye kadar `updated_at` azalan sıradaydı: föye dokunan onu
-- listenin başına taşıyordu. Koleksiyon bir vitrin — hangi ürünün önce
-- geldiği bir TASARIM kararı, son düzenleme saatinin yan etkisi değil.
--
-- NEDEN `double precision`: iki komşunun ortası tek işlemle bulunuyor
-- ((prev+next)/2), tablonun geri kalanına dokunmadan. Tamsayı olsaydı araya
-- girmek için aradaki bütün satırları yeniden numaralamak gerekirdi; 170
-- föyde bu her sürüklemede 170 yazma demekti.
--
-- Görevlerdeki `fractional_index` deseni BURADA KULLANILMADI: o metin tabanlı
-- anahtarı SQL'de üretmek mümkün değil, mevcut 170 föyü tek `update` ile
-- sıralayamazdık ve yarısı anahtarsız kalırdı.

alter table public.production_sheets
  add column if not exists sort_order double precision;

comment on column public.production_sheets.sort_order is
  'Koleksiyon ızgarasındaki elle sıra (küçük önce). Boşsa föy, sırası verilmişlerin ardına düşer.';

create index if not exists production_sheets_sort_order_idx
  on public.production_sheets (workspace_id, sort_order);

-- MEVCUT SIRA KORUNUR. Kullanıcı ekranda ne görüyorsa (son güncellenen önce)
-- başlangıç sırası o olur; sürükleyene kadar hiçbir şey yerinden oynamaz.
-- 1024 aralık: araya ~10 kez bölme yapılabilir, sonra da float hassasiyeti
-- sürer.
with ranked as (
  select id, row_number() over (
           partition by workspace_id
           order by updated_at desc, created_at desc, id
         ) as n
    from public.production_sheets
   where sort_order is null
)
update public.production_sheets s
   set sort_order = ranked.n * 1024
  from ranked
 where s.id = ranked.id;
