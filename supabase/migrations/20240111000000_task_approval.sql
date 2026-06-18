-- Approval & waiting-on fields for tasks.
-- approval_status values: 'none' | 'pending' | 'approved' | 'rejected'

alter table public.tasks
  add column if not exists approval_required    boolean not null default false,
  add column if not exists approval_status      text not null default 'none'
    check (approval_status in ('none', 'pending', 'approved', 'rejected')),
  add column if not exists waiting_on_member_id uuid references auth.users(id) on delete set null,
  add column if not exists waiting_on_contact_id uuid references public.workspace_contacts(id) on delete set null,
  add column if not exists waiting_reason       text;

create index if not exists tasks_approval_required_idx
  on public.tasks(workspace_id, approval_required)
  where approval_required = true;
