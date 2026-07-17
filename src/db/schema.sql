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
  max(e.load_value)  filter (where e.load_type = 'assisted')           as min_assist_load,
  max(e.metric_value)                                                   as max_metric
from entry e
join exercise x on x.id = e.exercise_id
group by e.exercise_id, x.canonical_name;

create table if not exists plan (
  id         serial primary key,
  date       date not null,
  region     text check (region in ('U','L')),
  stimulus   text check (stimulus in ('Strength','Hypertrophy','Volume')),
  body       text not null,
  created_at timestamptz not null default now(),
  unique (date, region)
);
create index if not exists plan_region_date on plan (region, date desc);

alter table session add column if not exists rpe      smallint check (rpe between 1 and 10);
alter table session add column if not exists feel     text;
alter table session add column if not exists mu_note  text;

-- Endurance/cardio activities ingested from COROS Training Hub (reverse-engineered
-- teamapi.coros.com API). raw holds the full COROS object so no data is ever lost;
-- the flat columns are best-effort normalizations that can be re-derived from raw.
create table if not exists activity (
  id             serial primary key,
  coros_label_id text not null unique,          -- COROS labelId — dedup / upsert key
  sport_type     integer not null,              -- raw COROS sportType code
  sport          text not null default 'other', -- normalized: run | trail_run | bike | swim | other
  start_time     timestamptz not null,
  name           text,
  distance_m     numeric,                        -- meters
  duration_s     integer,                        -- total time, seconds
  avg_pace_s_km  numeric,                        -- seconds per km (derived)
  avg_hr         integer,
  max_hr         integer,
  calories       numeric,                        -- kcal
  training_load  numeric,
  elevation_m    numeric,                        -- total ascent, meters
  raw            jsonb not null,
  created_at     timestamptz not null default now()
);
create index if not exists activity_sport_start on activity (sport, start_time desc);
create index if not exists activity_start on activity (start_time desc);
