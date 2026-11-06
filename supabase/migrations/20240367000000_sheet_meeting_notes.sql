-- ---------------------------------------------------------------------------
-- FÖYDE "TOPLANTI NOTLARI"  (Aslı Hanım · Nisa Hanım · Sıraç, 06.11.2026)
--
--   "Order review'u bu şeyin içine sokacaksın… beyaz t-shirt'ün içine
--    koyacaksın." · "Toplantı notları olarak çevir." · "Buradan order review
--    kalkıyor, Collection'ın içine giriyor."
--
-- Order Review (20240365) ayrı bir modüldü: bir değerlendirmenin altında ürün
-- satırları. Artık her ürünün değerlendirmesi KENDİ FÖYÜNDE durur. Satırdan
-- föye gelen dört şey (kumaş, renk, adet, fiyat föyün kendi sekmelerinde
-- zaten var — Aslı Hanım tekrar istemiyor):
--
--   meeting_notes        Aslı Hanım'ın notları — [{id, date, text}], her
--                        toplantı kendi tarihiyle, eskisi silinmez.
--   review_critique      "Ürün Kritikleri / Deneme Notları"
--   review_sample_photos İmalatçı numunesi — [{path, url}]
--   review_decision      Değerlendirmede · Onaylandı · Revize · Reddedildi
--
-- Bu sütunlar föyün "Kaydet" düğmesiyle DEĞİL, kendi eylemiyle yazılır
-- (updateSheetMeetingNotes): toplantıda yazılan not, föyde kaydedilmemiş başka
-- bir değişikliği beklemez, açık kalmış eski bir sekmenin kaydı da notu ezmez.
--
-- order_reviews / order_review_items SİLİNMEZ: eski kayıtlar
-- scripts/order-review-to-sheets.ts ile föylere taşınana kadar duruyor.
-- ---------------------------------------------------------------------------

alter table public.production_sheets
  add column if not exists meeting_notes jsonb not null default '[]'::jsonb,
  add column if not exists review_critique text not null default '',
  add column if not exists review_sample_photos jsonb not null default '[]'::jsonb,
  add column if not exists review_decision text;

alter table public.production_sheets drop constraint if exists production_sheets_meeting_notes_array;
alter table public.production_sheets add constraint production_sheets_meeting_notes_array
  check (jsonb_typeof(meeting_notes) = 'array');

alter table public.production_sheets drop constraint if exists production_sheets_review_sample_photos_array;
alter table public.production_sheets add constraint production_sheets_review_sample_photos_array
  check (jsonb_typeof(review_sample_photos) = 'array');

alter table public.production_sheets drop constraint if exists production_sheets_review_critique_len;
alter table public.production_sheets add constraint production_sheets_review_critique_len
  check (char_length(review_critique) <= 8000);

alter table public.production_sheets drop constraint if exists production_sheets_review_decision_check;
alter table public.production_sheets add constraint production_sheets_review_decision_check
  check (review_decision is null or review_decision in ('degerlendirmede','onaylandi','revize','reddedildi'));

comment on column public.production_sheets.meeting_notes is
  'Toplantı notları (Aslı Hanım) — her toplantı kendi tarihiyle; Order Review''dan taşındı (06.11.2026).';
