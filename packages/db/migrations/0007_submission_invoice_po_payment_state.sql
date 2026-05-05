-- Slice 6: submission, invoice shell, PO/no-PO, and manual payment state.

create table if not exists application_submissions (
  id uuid primary key,
  application_id uuid not null references applications(id),
  assessment_episode_id uuid not null references assessment_episodes(id),
  submitted_by_actor_id uuid not null references internal_users(id),
  application_version integer not null,
  document_state text not null check (document_state in ('management_plan_uploaded', 'management_plan_missing')),
  status text not null check (status in ('SUBMITTED', 'SUBMITTED_WITH_MISSING_PLAN')),
  submitted_at timestamptz not null default now(),
  unique (application_id)
);

create table if not exists invoices (
  id uuid primary key,
  application_id uuid not null references applications(id),
  assessment_episode_id uuid not null references assessment_episodes(id),
  status text not null check (status in ('PENDING', 'PAID', 'OVERDUE_BLOCKED', 'WAIVED')),
  amount_marker text not null default 'external_value_unavailable',
  due_at timestamptz not null,
  available_in_portal boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id)
);

create table if not exists payment_states (
  invoice_id uuid primary key references invoices(id) on delete cascade,
  purchase_order_number text,
  no_purchase_order_declared boolean not null default false,
  manually_marked_paid boolean not null default false,
  manual_paid_by_actor_id uuid references internal_users(id),
  manual_paid_reason text,
  manual_paid_at timestamptz,
  override_applied boolean not null default false,
  override_by_actor_id uuid references internal_users(id),
  override_reason text,
  override_at timestamptz,
  blocked_for_allocation boolean not null default false,
  updated_at timestamptz not null default now(),
  check ((purchase_order_number is not null) <> no_purchase_order_declared)
);

create table if not exists payment_notification_intents (
  id uuid primary key,
  invoice_id uuid not null references invoices(id) on delete cascade,
  intent_type text not null check (intent_type in ('application_submitted_email', 'invoice_available_email', 'payment_overdue_email')),
  created_at timestamptz not null default now(),
  unique (invoice_id, intent_type)
);

-- migrate:down

drop table if exists payment_notification_intents;
drop table if exists payment_states;
drop table if exists invoices;
drop table if exists application_submissions;
