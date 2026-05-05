-- Slice 5: documents and management plan upload/link/versioning.
-- Stores metadata and upload session state only. File bytes live in object storage.

create table if not exists document_assets (
  id uuid primary key,
  application_id uuid not null references applications(id),
  assessment_episode_id uuid not null references assessment_episodes(id),
  park_id uuid not null references parks(id),
  document_type text not null check (document_type in ('management_plan', 'supporting_document')),
  filename text not null,
  content_type text not null,
  byte_size integer not null check (byte_size > 0 and byte_size <= 52428800),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  storage_provider text not null default 'lower_env_stub',
  storage_key text not null,
  status text not null check (status in ('UPLOADED_PENDING_SCAN', 'AVAILABLE', 'REJECTED', 'ARCHIVED')),
  visibility text not null check (visibility in ('APPLICANT_PRIVATE', 'APPLICANT_AND_ADMIN', 'ASSIGNED_JUDGES', 'ADMIN_ONLY', 'PUBLIC_AFTER_RELEASE', 'MYSTERY_RESTRICTED')),
  version integer not null check (version > 0),
  is_current boolean not null default true,
  replaces_document_id uuid references document_assets(id),
  replaced_by_document_id uuid references document_assets(id),
  uploaded_by_actor_id uuid not null references internal_users(id),
  scan_status text not null check (scan_status in ('not_scanned_stub', 'pending_stub', 'clean_stub', 'rejected_stub')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists document_assets_one_current_per_type
  on document_assets(application_id, document_type)
  where is_current;

create unique index if not exists document_assets_application_sha256_unique
  on document_assets(application_id, sha256);

create table if not exists document_upload_sessions (
  id uuid primary key,
  application_id uuid not null references applications(id),
  document_type text not null check (document_type in ('management_plan', 'supporting_document')),
  filename text not null,
  content_type text not null,
  byte_size integer not null check (byte_size > 0 and byte_size <= 52428800),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  total_chunks integer not null check (total_chunks > 0),
  status text not null check (status in ('CREATED', 'IN_PROGRESS', 'READY_TO_COMPLETE', 'COMPLETED', 'EXPIRED', 'FAILED')),
  idempotency_key text,
  expires_at timestamptz not null,
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists document_upload_chunks (
  upload_session_id uuid not null references document_upload_sessions(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  chunk_size integer not null check (chunk_size > 0),
  chunk_checksum text not null,
  accepted_at timestamptz not null default now(),
  primary key (upload_session_id, chunk_index)
);

-- migrate:down

drop table if exists document_upload_chunks;
drop table if exists document_upload_sessions;
drop index if exists document_assets_application_sha256_unique;
drop index if exists document_assets_one_current_per_type;
drop table if exists document_assets;
