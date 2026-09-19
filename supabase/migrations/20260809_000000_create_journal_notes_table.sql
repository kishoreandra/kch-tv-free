-- Create journal_notes table for weekly/monthly review notes
-- id, user_id, period_type (weekly|monthly), period_start, period_end, content, created_at, updated_at
create table if not exists journal_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  period_type text not null,
  period_start date not null,
  period_end date not null,
  content text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists journal_notes_user_period on journal_notes(user_id, period_type, period_start);
