-- ---------------------------------------------------------------------------
-- BÜLTEN PLANI — postanın kendi düzeninden gelen dört alan (08.11.2026)
--
-- Sıraç (ekran görüntüsüyle): "Tasarım çok çok kötü ve bizim newsletter'a
-- benzemiyor" — format AF-Bulten-No01.html. Planlama ekranı artık bültenin
-- kendisi gibi çiziliyor; taslakta olup tabloda olmayan dört şey:
--   products_link    → ürünlerin altındaki VIEW ALL PIECES düğmesi (koleksiyon)
--   story_image_url  → story bölümünün fotoğrafı (4:3)
--   story_text       → story metni (Gül Hanım'ın yazısının ilk 2–3 cümlesi)
--   social_platform  → haftanın sosyal medyası: Instagram → YouTube →
--                      LinkedIn → X (platform adı yalnız düğmede geçer)
-- Hepsi ekleme; mevcut satıra dokunmaz.
-- ---------------------------------------------------------------------------

alter table public.newsletter_weeks add column if not exists products_link   text not null default '';
alter table public.newsletter_weeks add column if not exists story_image_url text not null default '';
alter table public.newsletter_weeks add column if not exists story_text      text not null default '';
alter table public.newsletter_weeks add column if not exists social_platform text not null default 'instagram';

alter table public.newsletter_weeks drop constraint if exists newsletter_weeks_social_platform_check;
alter table public.newsletter_weeks add constraint newsletter_weeks_social_platform_check
  check (social_platform in ('instagram','youtube','linkedin','x'));
