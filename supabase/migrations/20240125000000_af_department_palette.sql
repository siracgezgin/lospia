-- AF Operasyon department palette — make every top-level department visually
-- distinct at a glance (idempotent, data-only). Supersedes the partial fix in
-- 20240124000000 by setting color_key for ALL six top-level departments.
--
-- color_key → pastel family (see lib/design/semantics.ts DEPT_COLOR_TO_FAMILY):
--   purple → violet      orange → burnt orange   blue → royal blue
--   pink   → fuchsia      brown  → olive          red  → crimson (critical)
--
-- The app also overrides these by canonical name at render time
-- (lib/utils/departments.ts), so this only keeps the stored data consistent.
-- Child departments inherit their parent's colour, so only top-level rows change.
-- Safe to re-run: rewrites color_key on the named departments only; touches no
-- tasks or member assignments.

update public.workspace_departments set color_key = 'purple'
 where parent_id is null and lower(name) = lower('Tasarım & Yaratıcı Yön');

update public.workspace_departments set color_key = 'orange'
 where parent_id is null and lower(name) = lower('Üretim & Tedarik Zinciri');

update public.workspace_departments set color_key = 'blue'
 where parent_id is null and lower(name) = lower('Satış & Ticaret');

update public.workspace_departments set color_key = 'pink'
 where parent_id is null and lower(name) = lower('Pazarlama & İletişim');

update public.workspace_departments set color_key = 'brown'
 where parent_id is null and lower(name) = lower('Finans & Operasyon');

update public.workspace_departments set color_key = 'red'
 where parent_id is null and lower(name) = lower('Marka Yönetimi / CEO Katmanı');
