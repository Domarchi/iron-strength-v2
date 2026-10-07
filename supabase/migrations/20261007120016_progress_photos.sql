-- T16 · Fotos de progreso (RF-40 a RF-43, DC-18). El archivo vive en Storage; aquí solo los metadatos.

create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  taken_on date not null,
  tag text check (tag is null or tag in ('frente', 'lado', 'espalda')),
  storage_path text not null unique,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 1048576),
  created_at timestamptz not null default now(),
  -- La ruta debe empezar por la carpeta del dueño: la política de Storage se apoya en esto.
  constraint progress_photos_path_in_owner_folder check (storage_path like student_id::text || '/%')
);
create index progress_photos_student_idx on public.progress_photos (student_id, taken_on desc);

alter table public.progress_photos enable row level security;

create function public.progress_photos_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    select count(*) from public.progress_photos
    where student_id = new.student_id and taken_on = new.taken_on
  ) >= 3 then
    raise exception 'Máximo 3 fotos por fecha' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger progress_photos_guard
  before insert on public.progress_photos
  for each row execute function public.progress_photos_guard();
