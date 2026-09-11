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
  -- load_value is always the total lifted, however many hands carry it.
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
-- No longer written (2026-09-07). Per-exercise entry.notes replaced both: feel
-- restated the session, mu_note restated whichever lift was that day's muscle-up
-- touch. Kept, and still rendered on /sessions, because 53 of them were written
-- before the change and two carry standing directives.
alter table session add column if not exists feel     text;
alter table session add column if not exists mu_note  text;

-- Groups movement variants (e.g. "Row", "Push-up") so the PR board can visually
-- cluster them; null means the exercise doesn't share a variant family.
alter table exercise add column if not exists family text;

-- Logged-in-app additions (2026-09-02): the /log form records how many sets were
-- done and whether a prescribed exercise was deliberately skipped. A skipped row
-- is kept (adherence signal) but must never reach PR/progression maths — see the
-- v_prs redefinition below and the `skipped = false` guards in src/lib/progress.ts.
alter table entry add column if not exists sets    smallint;
alter table entry add column if not exists skipped boolean not null default false;

-- Structured prescription for the /log form. `body` remains the authoritative
-- text block the generator's rotation/variety checks read back via get_recent_plans;
-- `items` is additive and carries what `body` deliberately drops (load, tempo).
alter table plan add column if not exists items jsonb;

-- Rate-limit ledger for the passcode gate on /log.
create table if not exists auth_attempt (
  id         serial primary key,
  ip         text not null,
  ok         boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists auth_attempt_ip_time on auth_attempt (ip, created_at desc);

-- Which day(s) an exercise belongs on. 'core' shows up on both Upper and Lower
-- days; the /log dropdown filters to the current day's region plus 'core'.
alter table exercise add column if not exists region text check (region in ('U','L','core'));

-- Accessory/filler movements (e.g. plyometrics used as warmup power work) that
-- clutter the /log dropdown without being something to deliberately pick and
-- track there. History and PRs are untouched — this only hides the option from
-- the picker; an already-selected card still shows its own value.
alter table exercise add column if not exists accessory boolean not null default false;

-- Redefined after `skipped` exists: a skipped exercise is not a zero-rep result.
create or replace view v_prs as
select
  e.exercise_id,
  x.canonical_name,
  -- load_value is always the total lifted, however many hands carry it.
  max(e.load_value)  filter (where e.load_type in ('added','external')) as max_added_load,
  max(e.load_value)  filter (where e.load_type = 'assisted')           as min_assist_load,
  max(e.metric_value)                                                   as max_metric
from entry e
join exercise x on x.id = e.exercise_id
where e.skipped = false
group by e.exercise_id, x.canonical_name;
