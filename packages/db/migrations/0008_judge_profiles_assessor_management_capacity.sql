-- Slice 8: judge/assessor profiles, preferences, availability, and capacity.

create table if not exists assessor_profiles (
  id uuid primary key,
  internal_user_id uuid not null references internal_users(id),
  display_name text not null,
  email text,
  profile_status text not null check (profile_status in ('ACTIVE', 'INACTIVE', 'PENDING_PROFILE_COMPLETION')),
  accreditation_status text not null check (accreditation_status in ('CURRENT_LOWER_ENV', 'EXPIRED', 'PENDING_VERIFICATION', 'EXTERNAL_VALUE_UNAVAILABLE')),
  accreditation_provider text not null default 'external_value_unavailable',
  primary_region text,
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (internal_user_id)
);

create table if not exists assessor_preferences (
  assessor_profile_id uuid primary key references assessor_profiles(id) on delete cascade,
  preferred_regions text[] not null default '{}',
  preferred_award_track_codes text[] not null default '{}',
  unavailable_notes text,
  accepts_mystery_shop boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists assessor_availability_windows (
  id uuid primary key,
  assessor_profile_id uuid not null references assessor_profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  availability_type text not null check (availability_type in ('available', 'unavailable')),
  notes text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists assessor_capacity_declarations (
  id uuid primary key,
  assessor_profile_id uuid not null references assessor_profiles(id) on delete cascade,
  cycle_year integer not null,
  max_assignments integer not null check (max_assignments >= 0 and max_assignments <= 100),
  current_assigned_count integer not null default 0 check (current_assigned_count >= 0),
  capacity_status text not null check (capacity_status in ('available', 'at_capacity', 'unavailable')),
  updated_at timestamptz not null default now(),
  unique (assessor_profile_id, cycle_year)
);

-- migrate:down

drop table if exists assessor_capacity_declarations;
drop table if exists assessor_availability_windows;
drop table if exists assessor_preferences;
drop table if exists assessor_profiles;
