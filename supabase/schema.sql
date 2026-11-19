-- AulSabaq AI: схема базы (Supabase, Postgres 17).
--
-- Как устроен доступ. Таблицы закрыты (RLS включён, политик нет): напрямую их не читает и не пишет никто,
-- кроме владельца базы. Сервер приложения ходит в базу только через функции ниже (RPC). Каждая функция сама
-- проверяет, что ей можно: изменить урок или посмотреть учеников можно только с ключом учителя (в базе
-- хранится его SHA-256, сам ключ знает только браузер учителя), ученик меняет только свою сессию.
-- Поэтому даже если ключ API базы утечёт, через него нельзя прочитать чужие уроки списком или стереть данные.
--
-- Персональных данных учеников нет: только имя или номер в списке, без почты и телефона.

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  join_code text not null unique check (join_code ~ '^[0-9]{6}$'),
  teacher_token_hash text not null check (char_length(teacher_token_hash) = 64),
  plan jsonb not null,
  language text not null check (language in ('kk', 'ru')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_sessions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  group_id text not null check (char_length(group_id) between 1 and 10),
  display_name text not null check (char_length(display_name) between 1 and 40),
  -- Прогресс по карточкам: { "g1-c1": { "status": "correct", "attempts": 1, "hints": 0, ... } }.
  progress jsonb not null default '{}'::jsonb,
  current_card text,
  hints_used int not null default 0,
  needs_help boolean not null default false,
  help_card text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists student_sessions_lesson_idx on public.student_sessions (lesson_id, created_at);

-- Общий лимит запросов для всех экземпляров сервера (счётчик в памяти сбрасывался при каждом деплое).
create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count int not null
);

alter table public.lessons enable row level security;
alter table public.student_sessions enable row level security;
alter table public.rate_limits enable row level security;
revoke all on public.lessons, public.student_sessions, public.rate_limits from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Учитель

create or replace function public.create_lesson(p_plan jsonb, p_language text, p_token_hash text, p_demo boolean)
returns table (id uuid, join_code text)
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_id uuid;
begin
  for attempt in 1..20 loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    begin
      insert into lessons (join_code, teacher_token_hash, plan, language, is_demo)
        values (v_code, p_token_hash, p_plan, p_language, p_demo)
        returning lessons.id into v_id;
      id := v_id;
      join_code := v_code;
      return next;
      return;
    exception when unique_violation then
      -- код занят другим уроком: пробуем следующий
      null;
    end;
  end loop;
  raise exception 'no free join code';
end $$;

create or replace function public.get_lesson(p_id uuid)
returns table (plan jsonb, join_code text, is_demo boolean, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.plan, l.join_code, l.is_demo, l.updated_at from lessons l where l.id = p_id;
$$;

create or replace function public.check_teacher(p_id uuid, p_token_hash text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from lessons l where l.id = p_id and l.teacher_token_hash = p_token_hash);
$$;

create or replace function public.update_lesson(p_id uuid, p_token_hash text, p_plan jsonb)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update lessons set plan = p_plan, updated_at = now() where id = p_id and teacher_token_hash = p_token_hash;
  return found;
end $$;

create or replace function public.lesson_sessions(p_id uuid, p_token_hash text)
returns table (id uuid, group_id text, display_name text, progress jsonb, current_card text,
               hints_used int, needs_help boolean, help_card text, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.group_id, s.display_name, s.progress, s.current_card, s.hints_used, s.needs_help, s.help_card,
         s.created_at, s.updated_at
  from student_sessions s join lessons l on l.id = s.lesson_id
  where l.id = p_id and l.teacher_token_hash = p_token_hash
  order by s.created_at;
$$;

create or replace function public.clear_help(p_id uuid, p_token_hash text, p_session uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update student_sessions s set needs_help = false, help_card = null, updated_at = now()
  from lessons l
  where s.id = p_session and s.lesson_id = l.id and l.id = p_id and l.teacher_token_hash = p_token_hash;
  return found;
end $$;

-- ---------------------------------------------------------------------------
-- Ученик

create or replace function public.find_lesson_by_code(p_code text)
returns table (id uuid, plan jsonb)
language sql stable security definer set search_path = public as $$
  select l.id, l.plan from lessons l where l.join_code = p_code;
$$;

create or replace function public.create_session(p_lesson uuid, p_group text, p_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  -- Не больше 80 учеников на урок: защищает панель учителя от мусора.
  if (select count(*) from student_sessions where lesson_id = p_lesson) >= 80 then
    raise exception 'too many students';
  end if;
  insert into student_sessions (lesson_id, group_id, display_name) values (p_lesson, p_group, p_name)
    returning student_sessions.id into v_id;
  return v_id;
end $$;

create or replace function public.get_session(p_session uuid)
returns table (lesson_id uuid, plan jsonb, group_id text, display_name text, progress jsonb,
               current_card text, needs_help boolean, help_card text)
language sql stable security definer set search_path = public as $$
  select s.lesson_id, l.plan, s.group_id, s.display_name, s.progress, s.current_card, s.needs_help, s.help_card
  from student_sessions s join lessons l on l.id = s.lesson_id
  where s.id = p_session;
$$;

-- Обновляет одну карточку в прогрессе атомарно (две вкладки ученика не затрут друг друга).
-- null в параметре значит «не менять это поле».
create or replace function public.update_session(p_session uuid, p_card text, p_card_state jsonb,
                                                 p_current_card text, p_needs_help boolean, p_help_card text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update student_sessions s set
    progress = case when p_card is null then s.progress else s.progress || jsonb_build_object(p_card, p_card_state) end,
    current_card = coalesce(p_current_card, s.current_card),
    needs_help = coalesce(p_needs_help, s.needs_help),
    help_card = case when p_needs_help is null then s.help_card when p_needs_help then p_help_card else null end,
    updated_at = now()
  where s.id = p_session;
  if not found then return false; end if;
  update student_sessions s set hints_used = coalesce(
    (select sum(coalesce((value ->> 'hints')::int, 0)) from jsonb_each(s.progress)), 0)
  where s.id = p_session;
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Лимит запросов: 0, если можно, иначе через сколько секунд повторить.

create or replace function public.hit_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_row rate_limits%rowtype;
begin
  insert into rate_limits (key, window_start, count) values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case when rate_limits.window_start + make_interval(secs => p_window_seconds) <= now()
                        then now() else rate_limits.window_start end,
    count = case when rate_limits.window_start + make_interval(secs => p_window_seconds) <= now()
                 then 1 else rate_limits.count + 1 end
  returning * into v_row;
  if v_row.count <= p_limit then return 0; end if;
  return greatest(1, ceil(extract(epoch from (v_row.window_start + make_interval(secs => p_window_seconds) - now())))::int);
end $$;

-- ---------------------------------------------------------------------------
-- Кто может вызывать функции: только роль API (anon), а ей доступны только эти функции.

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.create_lesson(jsonb, text, text, boolean),
  public.get_lesson(uuid),
  public.check_teacher(uuid, text),
  public.update_lesson(uuid, text, jsonb),
  public.lesson_sessions(uuid, text),
  public.clear_help(uuid, text, uuid),
  public.find_lesson_by_code(text),
  public.create_session(uuid, text, text),
  public.get_session(uuid),
  public.update_session(uuid, text, jsonb, text, boolean, text),
  public.hit_rate_limit(text, int, int)
to anon, service_role;

-- ---------------------------------------------------------------------------
-- Сборка урока (19 ноября). Урок собирается 2–4 минуты: сервер сразу отвечает номером сборки и собирает урок
-- в фоне, а браузер учителя раз в несколько секунд спрашивает, что готово. Если связь оборвалась, браузер
-- вернётся к той же сборке и получит урок: он уже собран и оплачен, терять его нельзя.
-- Сборку видит и меняет только тот, у кого ключ учителя (в базе его SHA-256, тот же ключ потом у урока).

create table if not exists public.lesson_jobs (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null check (char_length(token_hash) = 64),
  status text not null default 'running' check (status in ('running', 'ready', 'failed')),
  -- Что уже готово: { "stage": "content", "explained": 2, "classes": 2, "cards": 28, ... }.
  progress jsonb not null default '{}'::jsonb,
  lesson_id uuid references public.lessons (id) on delete set null,
  error text check (error is null or char_length(error) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.lesson_jobs enable row level security;
revoke all on public.lesson_jobs from anon, authenticated;

create or replace function public.create_job(p_token_hash text, p_progress jsonb)
returns uuid
language sql security definer set search_path = public as $$
  insert into lesson_jobs (token_hash, progress) values (p_token_hash, p_progress) returning id;
$$;

-- null в p_status, p_lesson_id, p_error значит «не менять».
create or replace function public.update_job(p_id uuid, p_token_hash text, p_status text, p_progress jsonb, p_lesson_id uuid, p_error text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update lesson_jobs set
    status = coalesce(p_status, status),
    progress = coalesce(p_progress, progress),
    lesson_id = coalesce(p_lesson_id, lesson_id),
    error = coalesce(p_error, error),
    updated_at = now()
  where id = p_id and token_hash = p_token_hash;
  return found;
end $$;

create or replace function public.get_job(p_id uuid, p_token_hash text)
returns table (status text, progress jsonb, lesson_id uuid, join_code text, error text, updated_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select j.status, j.progress, j.lesson_id, l.join_code, j.error, j.updated_at, j.created_at
  from lesson_jobs j left join lessons l on l.id = j.lesson_id
  where j.id = p_id and j.token_hash = p_token_hash;
$$;

revoke execute on function public.create_job(text, jsonb), public.update_job(uuid, text, text, jsonb, uuid, text),
  public.get_job(uuid, text) from public, anon, authenticated;
grant execute on function public.create_job(text, jsonb), public.update_job(uuid, text, text, jsonb, uuid, text),
  public.get_job(uuid, text) to anon, service_role;
