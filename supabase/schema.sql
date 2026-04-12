-- LangLearn — Supabase schema
-- Run this in Supabase SQL editor

-- ─────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────

create type rule_type as enum ('rule', 'structure', 'collocation');
create type session_status as enum ('active', 'completed');
create type task_type as enum (
  'mcq', 'fill_blank', 'transform', 'open_write',
  'vocabulary', 'error_find', 'translate'
);

-- ─────────────────────────────────────────
-- Languages
-- ─────────────────────────────────────────

create table languages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  flag_emoji  text,
  created_at  timestamptz not null default now()
);

alter table languages enable row level security;

create policy "Users see own languages"
  on languages for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index on languages(user_id);

-- ─────────────────────────────────────────
-- Rules
-- ─────────────────────────────────────────

create table rules (
  id           uuid primary key default gen_random_uuid(),
  language_id  uuid not null references languages(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  description  text,
  formula      text,
  type         rule_type not null default 'rule',
  ai_context   text,
  difficulty   int not null default 3 check (difficulty between 1 and 5),
  examples     jsonb default '[]'::jsonb,
  created_at   timestamptz not null default now()
);

alter table rules enable row level security;

create policy "Users see own rules"
  on rules for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index on rules(user_id);
create index on rules(language_id);

-- ─────────────────────────────────────────
-- Rule stats (EMA scoring — updated by app, not triggers)
-- ─────────────────────────────────────────

create table rule_stats (
  id              uuid primary key default gen_random_uuid(),
  rule_id         uuid not null unique references rules(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  ema_score       real not null default 0.5,
  attempts_total  int not null default 0,
  weak_flag       boolean not null default false,
  updated_at      timestamptz not null default now()
);

alter table rule_stats enable row level security;

create policy "Users see own rule stats"
  on rule_stats for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index on rule_stats(user_id);
create index on rule_stats(rule_id);
create index on rule_stats(ema_score) where ema_score < 0.6;

-- ─────────────────────────────────────────
-- Vocabulary
-- ─────────────────────────────────────────

create table vocabulary (
  id           uuid primary key default gen_random_uuid(),
  language_id  uuid not null references languages(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  word         text not null,
  translation  text not null,
  context      text,
  ease_factor  real not null default 2.5,
  interval     int not null default 1,
  repetitions  int not null default 0,
  next_review  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

alter table vocabulary enable row level security;

create policy "Users see own vocabulary"
  on vocabulary for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index on vocabulary(user_id);
create index on vocabulary(language_id);
create index on vocabulary(next_review);

-- ─────────────────────────────────────────
-- Sessions
-- ─────────────────────────────────────────

create table sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  language_id  uuid not null references languages(id) on delete cascade,
  rule_ids     uuid[] not null default '{}',
  status       session_status not null default 'active',
  total_tasks  int not null default 0,
  completed    int not null default 0,
  avg_score    real,
  settings     jsonb,
  created_at   timestamptz not null default now()
);

alter table sessions enable row level security;

create policy "Users see own sessions"
  on sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index on sessions(user_id);
create index on sessions(language_id);
create index on sessions(created_at desc);

-- ─────────────────────────────────────────
-- Tasks
-- ─────────────────────────────────────────

create table tasks (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references sessions(id) on delete cascade,
  rule_id          uuid references rules(id) on delete set null,
  type             task_type not null,
  prompt           text not null,
  options          jsonb,
  correct_answer   text,
  ai_check_context text,
  user_answer      text,
  score            int,
  feedback         text,
  is_correct       boolean,
  created_at       timestamptz not null default now()
);

alter table tasks enable row level security;

create policy "Users see own tasks"
  on tasks for all
  using (
    exists (
      select 1 from sessions s
      where s.id = tasks.session_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from sessions s
      where s.id = tasks.session_id
        and s.user_id = auth.uid()
    )
  );

create index on tasks(session_id);
create index on tasks(rule_id);