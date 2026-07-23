-- Proof Video System v1.0
-- Stack: GitHub + Supabase + Vercel
-- Jalankan seluruh file ini satu kali melalui Supabase Dashboard -> SQL Editor.
-- File aman dijalankan ulang karena memakai IF NOT EXISTS, CREATE OR REPLACE, DROP POLICY, dan UPSERT.

begin;

create extension if not exists pgcrypto;

-- =============================================================================
-- ENUM
-- =============================================================================
do $$
begin
  create type public.user_role as enum ('admin', 'operator');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.packing_session_status as enum ('recording', 'completed', 'interrupted', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.video_upload_status as enum ('queued', 'uploading', 'completed', 'failed', 'deleted');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.video_processing_status as enum ('ready', 'failed', 'deleted');
exception when duplicate_object then null;
end $$;

-- =============================================================================
-- TABLE
-- =============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null check (char_length(full_name) between 2 and 120),
  role public.user_role not null default 'operator',
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.packing_sessions (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.profiles(id) on delete restrict,
  operator_name text not null,
  status public.packing_session_status not null default 'recording',
  started_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  ended_at timestamptz,
  camera_label text,
  user_agent text,
  segment_count integer not null default 0 check (segment_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint packing_sessions_end_after_start check (ended_at is null or ended_at >= started_at)
);

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique,
  session_id uuid not null references public.packing_sessions(id) on delete restrict,
  operator_id uuid not null references public.profiles(id) on delete restrict,
  operator_name text not null,
  order_number text not null check (char_length(order_number) between 1 and 120),
  barcode text not null check (char_length(barcode) between 1 and 160),
  sequence_no integer not null check (sequence_no > 0),
  start_time timestamptz not null,
  end_time timestamptz not null,
  duration_ms bigint not null check (duration_ms >= 0),
  filename text not null check (char_length(filename) between 1 and 255),
  mime_type text not null check (char_length(mime_type) between 1 and 120),
  filesize bigint not null check (filesize > 0),
  storage_bucket text not null default 'proof-videos',
  storage_path text not null unique,
  upload_status public.video_upload_status not null default 'queued',
  processing_status public.video_processing_status not null default 'ready',
  upload_progress smallint not null default 0 check (upload_progress between 0 and 100),
  retry_count integer not null default 0 check (retry_count >= 0),
  last_error text,
  uploaded_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint videos_end_after_start check (end_time >= start_time),
  constraint videos_session_sequence_unique unique (session_id, sequence_no)
);

create table if not exists public.app_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  description text,
  is_public boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null default 'System',
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.system_state (
  state_key text primary key,
  initial_setup_status text not null default 'pending'
    check (initial_setup_status in ('pending', 'claimed', 'completed')),
  setup_claim_token uuid,
  setup_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint system_state_claim_consistency check (
    (initial_setup_status = 'claimed' and setup_claim_token is not null and setup_claimed_at is not null)
    or (initial_setup_status <> 'claimed' and setup_claim_token is null and setup_claimed_at is null)
  )
);

insert into public.system_state(state_key)
values ('proof-video-system')
on conflict (state_key) do nothing;

-- =============================================================================
-- INDEX
-- =============================================================================
create unique index if not exists packing_sessions_one_active_per_operator
  on public.packing_sessions(operator_id)
  where status = 'recording';
create index if not exists packing_sessions_started_at_idx on public.packing_sessions(started_at desc);
create index if not exists packing_sessions_operator_idx on public.packing_sessions(operator_id, started_at desc);
create index if not exists packing_sessions_heartbeat_idx on public.packing_sessions(status, heartbeat_at)
  where status = 'recording';
create index if not exists videos_started_at_idx on public.videos(start_time desc) where deleted_at is null;
create index if not exists videos_operator_idx on public.videos(operator_id, start_time desc) where deleted_at is null;
create index if not exists videos_order_number_idx on public.videos(order_number) where deleted_at is null;
create index if not exists videos_barcode_idx on public.videos(barcode) where deleted_at is null;
create index if not exists videos_upload_status_idx on public.videos(upload_status, start_time desc) where deleted_at is null;
create index if not exists videos_storage_path_idx on public.videos(storage_path);
create index if not exists activity_logs_created_at_idx on public.activity_logs(created_at desc);
create index if not exists activity_logs_actor_idx on public.activity_logs(actor_id, created_at desc);

-- =============================================================================
-- TRIGGER UPDATED_AT
-- =============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists packing_sessions_set_updated_at on public.packing_sessions;
create trigger packing_sessions_set_updated_at before update on public.packing_sessions
for each row execute function public.set_updated_at();

drop trigger if exists videos_set_updated_at on public.videos;
create trigger videos_set_updated_at before update on public.videos
for each row execute function public.set_updated_at();

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at before update on public.app_settings
for each row execute function public.set_updated_at();

drop trigger if exists system_state_set_updated_at on public.system_state;
create trigger system_state_set_updated_at before update on public.system_state
for each row execute function public.set_updated_at();

-- =============================================================================
-- INITIAL SETUP LOCK
-- Hanya dapat dipanggil oleh Vercel Function dengan Supabase secret key.
-- =============================================================================
create or replace function public.claim_initial_setup()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
  v_status text;
  v_claimed_at timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('proof-video-system:initial-setup'));

  if exists (select 1 from public.profiles) then
    update public.system_state
    set initial_setup_status = 'completed',
        setup_claim_token = null,
        setup_claimed_at = null
    where state_key = 'proof-video-system';
    raise exception 'Setup sudah pernah diselesaikan.';
  end if;

  select initial_setup_status, setup_claimed_at
  into v_status, v_claimed_at
  from public.system_state
  where state_key = 'proof-video-system'
  for update;

  if v_status = 'completed' then
    raise exception 'Setup sudah pernah diselesaikan.';
  end if;

  if v_status = 'claimed' and v_claimed_at >= now() - interval '10 minutes' then
    raise exception 'Setup sedang diproses oleh permintaan lain.';
  end if;

  v_token := gen_random_uuid();
  update public.system_state
  set initial_setup_status = 'claimed',
      setup_claim_token = v_token,
      setup_claimed_at = now()
  where state_key = 'proof-video-system';

  return v_token;
end;
$$;

create or replace function public.complete_initial_setup(p_claim_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.system_state
  set initial_setup_status = 'completed',
      setup_claim_token = null,
      setup_claimed_at = null
  where state_key = 'proof-video-system'
    and initial_setup_status = 'claimed'
    and setup_claim_token = p_claim_token;

  if not found then
    raise exception 'Claim setup tidak valid atau sudah berakhir.';
  end if;
end;
$$;

create or replace function public.release_initial_setup(p_claim_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.system_state
  set initial_setup_status = 'pending',
      setup_claim_token = null,
      setup_claimed_at = null
  where state_key = 'proof-video-system'
    and initial_setup_status = 'claimed'
    and setup_claim_token = p_claim_token
    and not exists (select 1 from public.profiles);
end;
$$;

-- =============================================================================
-- AUTH USER -> PROFILE
-- Semua user baru menjadi Operator. Admin pertama hanya dipromosikan oleh
-- Vercel Function /api/setup menggunakan Supabase secret key.
-- =============================================================================
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_name text;
begin
  v_name := trim(coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, 'User'), '@', 1)));
  if char_length(v_name) < 2 then
    v_name := 'User';
  end if;

  insert into public.profiles(id, email, full_name, role, is_active)
  values (
    new.id,
    lower(coalesce(new.email, new.id::text || '@local.invalid')),
    left(v_name, 120),
    'operator',
    true
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.prevent_last_active_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_count integer;
begin
  if old.role = 'admin' and old.is_active and (new.role <> 'admin' or not new.is_active) then
    select count(*) into v_admin_count
    from public.profiles
    where role = 'admin' and is_active and id <> old.id;

    if v_admin_count = 0 then
      raise exception 'Minimal satu Admin aktif harus tetap tersedia.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_last_admin on public.profiles;
create trigger profiles_prevent_last_admin
before update of role, is_active on public.profiles
for each row execute function public.prevent_last_active_admin();

-- =============================================================================
-- HELPER AUTHORIZATION
-- =============================================================================
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active and role = 'admin'
  );
$$;

-- =============================================================================
-- RPC: ACTIVITY LOG
-- =============================================================================
create or replace function public.log_activity(
  p_action text,
  p_entity_type text,
  p_entity_id text default null,
  p_details jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text;
  v_id bigint;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'Unauthorized';
  end if;

  select full_name into v_actor_name from public.profiles where id = auth.uid();
  insert into public.activity_logs(actor_id, actor_name, action, entity_type, entity_id, details)
  values (auth.uid(), coalesce(v_actor_name, 'User'), left(p_action, 120), left(p_entity_type, 120), p_entity_id, coalesce(p_details, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

-- =============================================================================
-- RPC: SESSION
-- =============================================================================
create or replace function public.start_packing_session(
  p_camera_label text default null,
  p_user_agent text default null
)
returns setof public.packing_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_session public.packing_sessions%rowtype;
begin
  select * into v_profile from public.profiles where id = auth.uid() and is_active;
  if not found then raise exception 'Akun tidak aktif.'; end if;

  update public.packing_sessions
  set status = 'interrupted', ended_at = now()
  where operator_id = auth.uid() and status = 'recording';

  insert into public.packing_sessions(operator_id, operator_name, camera_label, user_agent)
  values (auth.uid(), v_profile.full_name, nullif(left(p_camera_label, 255), ''), left(p_user_agent, 1000))
  returning * into v_session;

  insert into public.activity_logs(actor_id, actor_name, action, entity_type, entity_id, details)
  values (auth.uid(), v_profile.full_name, 'session_started', 'packing_session', v_session.id::text, jsonb_build_object('camera_label', p_camera_label));

  return next v_session;
end;
$$;

create or replace function public.heartbeat_packing_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.packing_sessions
  set heartbeat_at = now()
  where id = p_session_id and operator_id = auth.uid() and status = 'recording';
  if not found then raise exception 'Sesi aktif tidak ditemukan.'; end if;
end;
$$;

create or replace function public.finish_packing_session(
  p_session_id uuid,
  p_status public.packing_session_status default 'completed'
)
returns setof public.packing_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.packing_sessions%rowtype;
begin
  if p_status = 'recording' then raise exception 'Status akhir tidak boleh recording.'; end if;

  update public.packing_sessions
  set status = p_status, ended_at = now(), heartbeat_at = now()
  where id = p_session_id and operator_id = auth.uid() and status = 'recording'
  returning * into v_session;

  if not found then raise exception 'Sesi aktif tidak ditemukan.'; end if;

  insert into public.activity_logs(actor_id, actor_name, action, entity_type, entity_id, details)
  values (auth.uid(), v_session.operator_name, 'session_finished', 'packing_session', v_session.id::text, jsonb_build_object('status', p_status));

  return next v_session;
end;
$$;

-- =============================================================================
-- RPC: VIDEO METADATA + UPLOAD
-- =============================================================================
create or replace function public.register_video_segment(
  p_client_id uuid,
  p_session_id uuid,
  p_order_number text,
  p_barcode text,
  p_sequence_no integer,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_duration_ms bigint,
  p_filename text,
  p_mime_type text,
  p_filesize bigint,
  p_storage_path text
)
returns setof public.videos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_existing_owner uuid;
  v_existing_path text;
  v_video public.videos%rowtype;
begin
  select * into v_profile from public.profiles where id = auth.uid() and is_active;
  if not found then raise exception 'Akun tidak aktif.'; end if;

  if not exists (
    select 1 from public.packing_sessions
    where id = p_session_id and operator_id = auth.uid()
  ) then
    raise exception 'Sesi bukan milik pengguna.';
  end if;

  if p_storage_path not like (auth.uid()::text || '/%') then
    raise exception 'Path Storage harus diawali ID pengguna.';
  end if;

  select operator_id, storage_path
  into v_existing_owner, v_existing_path
  from public.videos
  where client_id = p_client_id;

  if found then
    if v_existing_owner <> auth.uid() then
      raise exception 'Client ID sudah digunakan pengguna lain.';
    end if;
    if v_existing_path <> p_storage_path then
      raise exception 'Storage path untuk Client ID ini tidak boleh berubah.';
    end if;
  end if;

  insert into public.videos(
    client_id, session_id, operator_id, operator_name, order_number, barcode,
    sequence_no, start_time, end_time, duration_ms, filename, mime_type,
    filesize, storage_bucket, storage_path, upload_status, processing_status
  ) values (
    p_client_id,
    p_session_id,
    auth.uid(),
    v_profile.full_name,
    left(trim(p_order_number), 120),
    left(trim(p_barcode), 160),
    p_sequence_no,
    p_start_time,
    p_end_time,
    greatest(p_duration_ms, 0),
    left(trim(p_filename), 255),
    left(trim(p_mime_type), 120),
    greatest(p_filesize, 1),
    'proof-videos',
    p_storage_path,
    'queued',
    'ready'
  )
  on conflict (client_id) do update set
    end_time = excluded.end_time,
    duration_ms = excluded.duration_ms,
    filesize = excluded.filesize,
    mime_type = excluded.mime_type,
    filename = excluded.filename,
    updated_at = now()
  where public.videos.operator_id = auth.uid()
  returning * into v_video;

  if not found then
    raise exception 'Video tidak dapat diregistrasikan untuk pengguna ini.';
  end if;

  update public.packing_sessions
  set segment_count = greatest(segment_count, p_sequence_no)
  where id = p_session_id and operator_id = auth.uid();

  return next v_video;
end;
$$;

create or replace function public.mark_video_uploading(
  p_client_id uuid,
  p_progress integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.videos
  set upload_status = 'uploading',
      upload_progress = least(100, greatest(0, p_progress)),
      last_error = null
  where client_id = p_client_id and operator_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'Video tidak ditemukan.'; end if;
end;
$$;

create or replace function public.complete_video_upload(
  p_client_id uuid,
  p_filesize bigint,
  p_mime_type text
)
returns setof public.videos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_video public.videos%rowtype;
begin
  select * into v_video
  from public.videos
  where client_id = p_client_id
    and operator_id = auth.uid()
    and deleted_at is null;

  if not found then
    raise exception 'Video tidak ditemukan.';
  end if;

  if not exists (
    select 1
    from storage.objects
    where bucket_id = v_video.storage_bucket
      and name = v_video.storage_path
  ) then
    raise exception 'Object video belum tersedia di Supabase Storage.';
  end if;

  update public.videos
  set upload_status = 'completed',
      processing_status = 'ready',
      upload_progress = 100,
      filesize = greatest(p_filesize, 1),
      mime_type = left(p_mime_type, 120),
      uploaded_at = now(),
      last_error = null
  where client_id = p_client_id and operator_id = auth.uid() and deleted_at is null
  returning * into v_video;
  if not found then raise exception 'Video tidak ditemukan.'; end if;

  insert into public.activity_logs(actor_id, actor_name, action, entity_type, entity_id, details)
  values (auth.uid(), v_video.operator_name, 'video_uploaded', 'video', v_video.id::text, jsonb_build_object('order_number', v_video.order_number, 'storage_path', v_video.storage_path));

  return next v_video;
end;
$$;

create or replace function public.fail_video_upload(
  p_client_id uuid,
  p_error text,
  p_retry_count integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.videos
  set upload_status = 'failed',
      processing_status = 'failed',
      retry_count = greatest(p_retry_count, 0),
      last_error = left(p_error, 2000)
  where client_id = p_client_id and operator_id = auth.uid() and deleted_at is null;
end;
$$;

create or replace function public.cancel_video_segment(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_video public.videos%rowtype;
begin
  update public.videos
  set upload_status = 'deleted', processing_status = 'deleted', deleted_at = now()
  where client_id = p_client_id
    and operator_id = auth.uid()
    and upload_status <> 'completed'
    and deleted_at is null
  returning * into v_video;

  if found then
    insert into public.activity_logs(actor_id, actor_name, action, entity_type, entity_id, details)
    values (
      auth.uid(),
      v_video.operator_name,
      'local_upload_cancelled',
      'video',
      v_video.id::text,
      jsonb_build_object('order_number', v_video.order_number, 'client_id', p_client_id)
    );
  end if;
end;
$$;

-- =============================================================================
-- RPC: DASHBOARD + SETTINGS
-- =============================================================================
create or replace function public.get_dashboard_stats()
returns table (
  total_videos_today bigint,
  total_orders_today bigint,
  total_duration_ms_today bigint,
  uploads_completed_today bigint,
  uploads_failed bigint,
  active_operators bigint,
  storage_bytes_total bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day_start timestamptz;
begin
  if not public.is_admin() then raise exception 'Akses hanya untuk Admin.'; end if;

  update public.packing_sessions
  set status = 'interrupted',
      ended_at = coalesce(ended_at, heartbeat_at)
  where status = 'recording'
    and heartbeat_at < now() - interval '2 minutes';

  v_day_start := date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta';

  return query
  select
    count(*) filter (where v.created_at >= v_day_start and v.deleted_at is null)::bigint,
    count(distinct v.order_number) filter (where v.created_at >= v_day_start and v.deleted_at is null)::bigint,
    coalesce(sum(v.duration_ms) filter (where v.created_at >= v_day_start and v.deleted_at is null), 0)::bigint,
    count(*) filter (where v.uploaded_at >= v_day_start and v.upload_status = 'completed' and v.deleted_at is null)::bigint,
    count(*) filter (where v.upload_status = 'failed' and v.deleted_at is null)::bigint,
    (select count(distinct s.operator_id) from public.packing_sessions s where s.status = 'recording' and s.heartbeat_at >= now() - interval '2 minutes')::bigint,
    coalesce(sum(v.filesize) filter (where v.upload_status = 'completed' and v.deleted_at is null), 0)::bigint
  from public.videos v;
end;
$$;

create or replace function public.save_app_settings(p_settings jsonb)
returns setof public.app_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_value jsonb;
  v_merged jsonb;
  v_pattern text;
begin
  if not public.is_admin() then raise exception 'Akses hanya untuk Admin.'; end if;
  if jsonb_typeof(p_settings) <> 'object' then raise exception 'Pengaturan harus berupa object JSON.'; end if;

  if exists (
    select 1
    from jsonb_object_keys(p_settings) as incoming(setting_key)
    where not exists (
      select 1 from public.app_settings existing
      where existing.setting_key = incoming.setting_key
    )
  ) then
    raise exception 'Terdapat setting yang tidak dikenal.';
  end if;

  select coalesce(jsonb_object_agg(setting_key, setting_value), '{}'::jsonb) || p_settings
  into v_merged
  from public.app_settings;

  if (v_merged ->> 'barcode_min_length')::integer not between 1 and 160 then
    raise exception 'Panjang minimum barcode harus 1-160.';
  end if;
  if (v_merged ->> 'barcode_max_length')::integer not between 1 and 160 then
    raise exception 'Panjang maksimum barcode harus 1-160.';
  end if;
  if (v_merged ->> 'barcode_min_length')::integer > (v_merged ->> 'barcode_max_length')::integer then
    raise exception 'Panjang minimum barcode tidak boleh melebihi maksimum.';
  end if;
  if jsonb_typeof(v_merged -> 'barcode_uppercase') <> 'boolean' then
    raise exception 'barcode_uppercase harus boolean.';
  end if;
  if (v_merged ->> 'barcode_confirmation_count')::integer not between 1 and 10 then
    raise exception 'Jumlah konfirmasi barcode harus 1-10.';
  end if;
  if (v_merged ->> 'barcode_confirmation_window_ms')::integer not between 200 and 10000 then
    raise exception 'Jendela konfirmasi barcode harus 200-10000 ms.';
  end if;
  if (v_merged ->> 'barcode_cooldown_ms')::integer not between 500 and 60000 then
    raise exception 'Cooldown barcode harus 500-60000 ms.';
  end if;

  v_pattern := v_merged ->> 'barcode_pattern';
  if v_pattern is null or char_length(v_pattern) = 0 or char_length(v_pattern) > 500 then
    raise exception 'Pola barcode wajib diisi dan maksimal 500 karakter.';
  end if;
  begin
    perform '' ~ v_pattern;
  exception when invalid_regular_expression then
    raise exception 'Pola RegExp barcode tidak valid.';
  end;

  if (v_merged ->> 'recording_width')::integer not between 320 and 3840 then
    raise exception 'Lebar rekaman harus 320-3840.';
  end if;
  if (v_merged ->> 'recording_height')::integer not between 240 and 2160 then
    raise exception 'Tinggi rekaman harus 240-2160.';
  end if;
  if (v_merged ->> 'recording_frame_rate')::integer not between 10 and 60 then
    raise exception 'Frame rate harus 10-60.';
  end if;
  if (v_merged ->> 'recording_video_bitrate')::integer not between 250000 and 20000000 then
    raise exception 'Video bitrate harus 250000-20000000 bps.';
  end if;
  if (v_merged ->> 'recording_audio_bitrate')::integer not between 16000 and 320000 then
    raise exception 'Audio bitrate harus 16000-320000 bps.';
  end if;
  if jsonb_typeof(v_merged -> 'recording_include_audio') <> 'boolean' then
    raise exception 'recording_include_audio harus boolean.';
  end if;
  if (v_merged ->> 'upload_max_retries')::integer not between 1 and 20 then
    raise exception 'Maksimum retry upload harus 1-20.';
  end if;
  if (v_merged ->> 'session_heartbeat_seconds')::integer not between 10 and 300 then
    raise exception 'Heartbeat sesi harus 10-300 detik.';
  end if;

  for v_key, v_value in select * from jsonb_each(p_settings)
  loop
    update public.app_settings
    set setting_value = v_value, updated_by = auth.uid()
    where setting_key = v_key;
  end loop;

  insert into public.activity_logs(actor_id, actor_name, action, entity_type, details)
  select auth.uid(), full_name, 'settings_updated', 'app_settings', p_settings
  from public.profiles where id = auth.uid();

  return query select * from public.app_settings order by setting_key;
end;
$$;

-- =============================================================================
-- DEFAULT SETTINGS
-- =============================================================================
insert into public.app_settings(setting_key, setting_value, description, is_public)
values
  ('barcode_min_length', '3'::jsonb, 'Panjang minimum barcode.', true),
  ('barcode_max_length', '160'::jsonb, 'Panjang maksimum barcode.', true),
  ('barcode_pattern', '"^[A-Za-z0-9._:/-]+$"'::jsonb, 'RegExp validasi barcode.', true),
  ('barcode_uppercase', 'false'::jsonb, 'Ubah barcode menjadi huruf besar.', true),
  ('barcode_confirmation_count', '2'::jsonb, 'Jumlah pembacaan sama sebelum diterima.', true),
  ('barcode_confirmation_window_ms', '1500'::jsonb, 'Jendela konfirmasi pembacaan barcode.', true),
  ('barcode_cooldown_ms', '5000'::jsonb, 'Cooldown barcode sama.', true),
  ('recording_width', '1280'::jsonb, 'Lebar video.', true),
  ('recording_height', '720'::jsonb, 'Tinggi video.', true),
  ('recording_frame_rate', '24'::jsonb, 'Frame rate video. Nilai 24 menghemat ukuran file untuk paket Supabase Free.', true),
  ('recording_video_bitrate', '1200000'::jsonb, 'Bitrate video. Nilai 1,2 Mbps seimbang untuk bukti 720p dan batas ukuran file.', true),
  ('recording_audio_bitrate', '64000'::jsonb, 'Bitrate audio.', true),
  ('recording_include_audio', 'true'::jsonb, 'Aktifkan rekaman audio.', true),
  ('upload_max_retries', '5'::jsonb, 'Maksimum retry upload.', true),
  ('session_heartbeat_seconds', '20'::jsonb, 'Interval heartbeat sesi.', true)
on conflict (setting_key) do update set
  description = excluded.description,
  is_public = excluded.is_public;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table public.profiles enable row level security;
alter table public.packing_sessions enable row level security;
alter table public.videos enable row level security;
alter table public.app_settings enable row level security;
alter table public.activity_logs enable row level security;
alter table public.system_state enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.packing_sessions from anon, authenticated;
revoke all on table public.videos from anon, authenticated;
revoke all on table public.app_settings from anon, authenticated;
revoke all on table public.activity_logs from anon, authenticated;
revoke all on table public.system_state from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update(last_seen_at) on table public.profiles to authenticated;
grant select on table public.packing_sessions to authenticated;
grant select on table public.videos to authenticated;
grant select on table public.app_settings to authenticated;
grant select on table public.activity_logs to authenticated;

drop policy if exists profiles_select_policy on public.profiles;
create policy profiles_select_policy on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_last_seen_policy on public.profiles;
create policy profiles_last_seen_policy on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists sessions_select_policy on public.packing_sessions;
create policy sessions_select_policy on public.packing_sessions
for select to authenticated
using (public.is_admin() or (public.is_active_user() and operator_id = auth.uid()));

drop policy if exists videos_select_policy on public.videos;
create policy videos_select_policy on public.videos
for select to authenticated
using (public.is_admin() or (public.is_active_user() and operator_id = auth.uid()));

drop policy if exists settings_select_policy on public.app_settings;
create policy settings_select_policy on public.app_settings
for select to authenticated
using (public.is_active_user() and (is_public or public.is_admin()));

drop policy if exists logs_select_policy on public.activity_logs;
create policy logs_select_policy on public.activity_logs
for select to authenticated
using (public.is_admin());

-- =============================================================================
-- SUPABASE STORAGE BUCKET + RLS
-- =============================================================================
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'proof-videos',
  'proof-videos',
  false,
  null,
  array['video/webm', 'video/mp4', 'video/x-matroska', 'application/octet-stream']
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists proof_videos_insert_own on storage.objects;
create policy proof_videos_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id = 'proof-videos'
  and public.is_active_user()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists proof_videos_select_own_or_admin on storage.objects;
create policy proof_videos_select_own_or_admin on storage.objects
for select to authenticated
using (
  bucket_id = 'proof-videos'
  and (
    public.is_admin()
    or (public.is_active_user() and (storage.foldername(name))[1] = auth.uid()::text)
  )
);

drop policy if exists proof_videos_update_own_or_admin on storage.objects;
-- Object bukti bersifat immutable dari browser. Upload memakai path baru dan
-- tidak menggunakan x-upsert, sehingga pengguna tidak dapat menimpa bukti lama.

drop policy if exists proof_videos_delete_admin on storage.objects;
-- Tidak ada policy DELETE untuk client. Penghapusan permanen dilakukan oleh
-- Vercel Function /api/videos/delete menggunakan Supabase secret key.

-- =============================================================================
-- FUNCTION GRANTS
-- =============================================================================
revoke all on function public.claim_initial_setup() from public;
revoke all on function public.complete_initial_setup(uuid) from public;
revoke all on function public.release_initial_setup(uuid) from public;
revoke all on function public.is_active_user() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.log_activity(text, text, text, jsonb) from public;
revoke all on function public.start_packing_session(text, text) from public;
revoke all on function public.heartbeat_packing_session(uuid) from public;
revoke all on function public.finish_packing_session(uuid, public.packing_session_status) from public;
revoke all on function public.register_video_segment(uuid, uuid, text, text, integer, timestamptz, timestamptz, bigint, text, text, bigint, text) from public;
revoke all on function public.mark_video_uploading(uuid, integer) from public;
revoke all on function public.complete_video_upload(uuid, bigint, text) from public;
revoke all on function public.fail_video_upload(uuid, text, integer) from public;
revoke all on function public.cancel_video_segment(uuid) from public;
revoke all on function public.get_dashboard_stats() from public;
revoke all on function public.save_app_settings(jsonb) from public;

grant execute on function public.claim_initial_setup() to service_role;
grant execute on function public.complete_initial_setup(uuid) to service_role;
grant execute on function public.release_initial_setup(uuid) to service_role;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.log_activity(text, text, text, jsonb) to authenticated;
grant execute on function public.start_packing_session(text, text) to authenticated;
grant execute on function public.heartbeat_packing_session(uuid) to authenticated;
grant execute on function public.finish_packing_session(uuid, public.packing_session_status) to authenticated;
grant execute on function public.register_video_segment(uuid, uuid, text, text, integer, timestamptz, timestamptz, bigint, text, text, bigint, text) to authenticated;
grant execute on function public.mark_video_uploading(uuid, integer) to authenticated;
grant execute on function public.complete_video_upload(uuid, bigint, text) to authenticated;
grant execute on function public.fail_video_upload(uuid, text, integer) to authenticated;
grant execute on function public.cancel_video_segment(uuid) to authenticated;
grant execute on function public.get_dashboard_stats() to authenticated;
grant execute on function public.save_app_settings(jsonb) to authenticated;

commit;

select
  'READY' as status,
  'Proof Video System v1.0' as application,
  (select count(*) from public.app_settings) as default_settings,
  (select count(*) from storage.buckets where id = 'proof-videos') as storage_bucket_ready;
