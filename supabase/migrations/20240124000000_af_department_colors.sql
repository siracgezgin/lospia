-- AF Operasyon department colour corrections (idempotent, data-only).
--
-- Two top-level departments were seeded with colours that needed correcting so
-- the board reads at a glance:
--   * "Marka Yönetimi / CEO Katmanı" is the critical CEO layer → strong RED.
--   * "Finans & Operasyon" was 'green', which collides with the reserved
--     completed-task green → give it its own distinct brown/olive tone.
--
-- Child departments inherit their parent's colour at render time, so only the
-- top-level rows need updating. Safe to re-run: it only rewrites color_key on
-- the two named departments and touches no tasks or member assignments.

update public.workspace_departments
   set color_key = 'red'
 where parent_id is null
   and lower(name) = lower('Marka Yönetimi / CEO Katmanı');

update public.workspace_departments
   set color_key = 'brown'
 where parent_id is null
   and lower(name) = lower('Finans & Operasyon');
