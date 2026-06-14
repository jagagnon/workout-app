create table if not exists exercise (
  id              serial primary key,
  canonical_name  text not null unique,
  aliases         text[] not null default '{}',
  primary_metric  text not null default 'reps'
                    check (primary_metric in ('reps','seconds','meters')),
  default_load_type text not null default 'bodyweight'
                    check (default_load_type in ('added','assisted','external','bodyweight')),
  is_key          boolean not null default false,
  created_at      timestamptz not null default now()
);

create table if not exists session (
  id         serial primary key,
  date       date not null,
  region     text check (region in ('U','L')),
  type       text check (type in ('Strength','Hypertrophy','Volume')),
  notes      text,
  created_at timestamptz not null default now(),
  unique (date, region)
);

create table if not exists entry (
  id           serial primary key,
  session_id   integer not null references session(id) on delete cascade,
  exercise_id  integer not null references exercise(id),
  metric_type  text not null default 'reps'
                 check (metric_type in ('reps','seconds','meters')),
  metric_value numeric not null,
  load_type    text not null
                 check (load_type in ('added','assisted','external','bodyweight')),
  load_value   numeric,
  load_unit    text not null default 'kg',
  per_side     boolean not null default false,
  notes        text,
  created_at   timestamptz not null default now(),
  unique (session_id, exercise_id)
);

create index if not exists entry_exercise_created on entry (exercise_id, created_at);
create index if not exists session_date on session (date);

-- PRs derived live: best load and best metric per exercise.
create or replace view v_prs as
select
  e.exercise_id,
  x.canonical_name,
  max(e.load_value)  filter (where e.load_type in ('added','external')) as max_added_load,
  min(e.load_value)  filter (where e.load_type = 'assisted')           as min_assist_load,
  max(e.metric_value)                                                   as max_metric
from entry e
join exercise x on x.id = e.exercise_id
group by e.exercise_id, x.canonical_name;
