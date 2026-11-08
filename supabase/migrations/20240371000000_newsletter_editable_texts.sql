-- ---------------------------------------------------------------------------
-- BÜLTEN PLANI — sabit duran yazılar haftalık düzenlenebilir (08.11.2026)
--
-- Sıraç: welcome başlığı "Welcome to the World of Aslı Filinta" sabit
-- kalmasın, her hafta değiştirilebilsin. Aynı şey postadaki öteki sabit
-- yazılar için de: imza ve üç düğme. Footer'ın yasal metni sabit kalır.
--
--   welcome_heading  → welcome bölümünün başlığı
--   welcome_signoff  → welcome'ın altındaki imza
--   account_button   → CREATE AN ACCOUNT düğmesi
--   products_button  → VIEW ALL PIECES düğmesi
--   social_button    → sosyal medya düğmesi; BOŞSA platformun kendi yazısı
--                      (FOLLOW US ON INSTAGRAM…) — platform değişince düğme
--                      de kendiliğinden değişsin diye varsayılan boş.
--
-- `add column … default` mevcut satırlara da varsayılanı yazar. Hepsi ekleme.
-- ---------------------------------------------------------------------------

alter table public.newsletter_weeks add column if not exists welcome_heading text not null default 'Welcome to the World of Aslı Filinta';
alter table public.newsletter_weeks add column if not exists welcome_signoff text not null default E'With love from Anatolia,\nAslı Filinta';
alter table public.newsletter_weeks add column if not exists account_button  text not null default 'CREATE AN ACCOUNT';
alter table public.newsletter_weeks add column if not exists products_button text not null default 'VIEW ALL PIECES';
alter table public.newsletter_weeks add column if not exists social_button   text not null default '';
