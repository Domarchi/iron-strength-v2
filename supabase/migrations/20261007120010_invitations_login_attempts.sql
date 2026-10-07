-- T10 · Invitaciones (RF-1 a RF-3, DC-2) y control de intentos de login (RF-6).
-- El token jamás se guarda en claro: solo su hash.

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Una invitación abierta por correo. Las vencidas se limpian al crear la nueva (acción del coach).
create unique index invitations_one_open_per_email on public.invitations (email)
  where used_at is null;
create index invitations_coach_id_idx on public.invitations (coach_id);

alter table public.invitations enable row level security;

create table public.login_attempts (
  email_hash text primary key,
  failed_count integer not null default 0 check (failed_count >= 0),
  window_started_at timestamptz not null default now(),
  locked_until timestamptz
);

-- Sin políticas: solo accesible con service role.
alter table public.login_attempts enable row level security;
