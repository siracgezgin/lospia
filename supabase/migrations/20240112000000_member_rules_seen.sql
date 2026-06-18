-- Add last_rules_seen_at to workspace_members so we can surface a board alert
-- when new/updated rules exist that the member hasn't seen yet.

alter table public.workspace_members
  add column if not exists last_rules_seen_at timestamptz;

-- Allow each member to update their own last_rules_seen_at.
-- (The existing admin-update policy already covers admin edits; this adds
--  a self-update path so the server action can work without service role.)
create policy "workspace_members: members can update own seen_at"
  on public.workspace_members for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
