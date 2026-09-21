-- RENK/KUMAŞ VARYANTLARI + ÜRETİCİ FİHRİSTİ (21.09.2026 toplantısı).
--
-- ── 1 · Varyantlar ─────────────────────────────────────────────────────────
-- Aslı Hanım: "Bizim bir elbise kalıbı için çalıştığımız farklı kumaşlarımız
-- oluyor: beyaz, denim, pembe, yeşil gibi. Onların farklı fiyatları, farklı
-- içerikleri oluyor… Hem renk olarak ayrı olması gerekiyor. Renk, fiyat,
-- içerik." Ayrıca "kumaşa göre asgari sipariş adedi de değişiyor".
--
-- Föyde zaten bir "Renk Varyantları" bölümü vardı ama o BAŞKA bir şey: aynı
-- modelin her rengini AYRI FÖY olarak kopyalıyordu. İstenen bu değil — tek
-- föyün içinde, kalıbı aynı olan birkaç kumaş. Ayrı föy yapılsaydı ölçü,
-- talimat ve beden dağılımı her renk için yeniden yazılacaktı.
--
-- Satır şekli:
--   { id, color, fabric, price, currency, composition, moq, note }
--
-- ── 2 · Fihrist ────────────────────────────────────────────────────────────
-- Aslı Hanım: "Bizim üretici için bize ayrı bir fihrist, yani fihrist derken
-- outsource dediğimiz… nakışçı bilgileri, üretici bilgileri, cep telefonları,
-- adresleri, iletişim bilgileri, e-mailleri girmesi gerekiyor." Ve üründe:
-- "Bu mesela üretici bilgisi Sabri Bey olacak. Ama bunun nakışçısı da var,
-- kalıpçısı da var… oradan üretici, kalıpçı, nakışçı seçmemiz gerekiyor."
--
-- `workspace_manufacturers` zaten ad, şehir, kontak, telefon, e-posta ve not
-- taşıyordu; eksik olan ROL'dü. Yeni tablo açmak yerine aynı deftere rol
-- eklendi: kalıpçı da nakışçı da aynı bilgileri taşıyor, ayrı tablo aynı
-- alanları ikinci kez tanımlamak olurdu.
--
-- Adres alanı da burada: fihristte "adresleri" isteniyor, tabloda şehir/ülke
-- vardı ama açık adres yoktu.

alter table public.production_sheets
  add column if not exists color_variants jsonb not null default '[]'::jsonb,
  -- Üründe ayrı ayrı seçilen roller. `manufacturer_id` (üretici) zaten vardı.
  add column if not exists pattern_maker_id uuid references public.workspace_manufacturers(id) on delete set null,
  add column if not exists embroiderer_id   uuid references public.workspace_manufacturers(id) on delete set null;

comment on column public.production_sheets.color_variants is
  'Aynı kalıbın renk/kumaş varyantları: renk, kumaş, fiyat, içerik, asgari sipariş adedi (Aslı Hanım, 21.09.2026).';

alter table public.workspace_manufacturers
  add column if not exists role    text not null default 'uretici'
    check (role in ('uretici','kalipci','nakisci','diger')),
  add column if not exists address text;

comment on column public.workspace_manufacturers.role is
  'Fihristteki rolü: üretici / kalıpçı / nakışçı. Ürün föyünde her rol ayrı seçilir.';

create index if not exists workspace_manufacturers_role_idx
  on public.workspace_manufacturers (workspace_id, role);
