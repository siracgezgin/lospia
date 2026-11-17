-- ---------------------------------------------------------------------------
-- STOK — dış kaynak kimliği (17.11.2026)
--
-- Eski stok programındaki (Dynamics) 2.461 hareket panele aktarılacak.
-- Aktarım YENİDEN ÇALIŞTIRILABİLİR olmalı: yarıda kesilirse ya da ikinci kez
-- çalıştırılırsa aynı hareket iki kez yazılmasın, stok ikiye katlanmasın.
-- `source_ref` aktarılan hareketin eski sistemdeki kimliğini taşır
-- ("dyn:<id>"); çalışma alanında tekildir. Panelde girilen hareketlerde boştur.
-- Yalnız ekleme.
-- ---------------------------------------------------------------------------
alter table public.stock_movements add column if not exists source_ref text;

-- Kısmi (WHERE … is not null) DEĞİL: aktarım `on conflict (workspace_id,
-- source_ref)` kullanır ve kısmi indeks o hedefle eşleşmez. Postgres tekil
-- indekste NULL'ları zaten birbirinden farklı sayar; panelde girilen
-- (source_ref'i boş) hareketler birbirine takılmaz.
create unique index if not exists stock_movements_source_ref_uidx
  on public.stock_movements (workspace_id, source_ref);
