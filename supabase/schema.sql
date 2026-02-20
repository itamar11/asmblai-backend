-- ═══════════════════════════════════════════════════════
-- Assembly.AI — Full Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════

-- ─── ENABLE UUID EXTENSION ──────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── COMPANIES ──────────────────────────────────────────
-- One row per company (IKEA, West Elm, etc.)
create table companies (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  industry      text,
  size          text,
  website       text,
  billing_address text,
  plan          text not null default 'trial',  -- trial | starter | growth | scale
  sku_limit     integer not null default 2,      -- 2 for trial, 10/25/unlimited
  stripe_customer_id  text unique,
  stripe_subscription_id text unique,
  plan_status   text default 'active',           -- active | paused | cancelled
  created_at    timestamptz default now()
);

-- ─── USERS ──────────────────────────────────────────────
-- People who log in (linked to a company)
create table users (
  id            uuid primary key default uuid_generate_v4(),
  company_id    uuid references companies(id) on delete cascade,
  email         text unique not null,
  password_hash text not null,
  first_name    text,
  last_name     text,
  job_title     text,
  role          text default 'admin',            -- admin | member
  created_at    timestamptz default now(),
  last_login    timestamptz
);

-- ─── SKUS ───────────────────────────────────────────────
-- One row per product SKU
create table skus (
  id            uuid primary key default uuid_generate_v4(),
  company_id    uuid references companies(id) on delete cascade,
  sku_code      text not null,                   -- e.g. KALLAX-4X2-BLK
  product_name  text not null,
  category      text,
  status        text default 'processing',       -- processing | live | error
  file_url      text,                            -- uploaded instruction file
  video_url     text,                            -- generated video URL
  qr_code_url   text,                            -- generated QR image URL
  qr_target_url text,                            -- URL the QR points to
  step_count    integer,
  video_duration integer,                        -- seconds
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique(company_id, sku_code)
);

-- ─── SCANS ──────────────────────────────────────────────
-- One row per QR code scan event
create table scans (
  id            uuid primary key default uuid_generate_v4(),
  sku_id        uuid references skus(id) on delete cascade,
  company_id    uuid references companies(id) on delete cascade,
  session_id    text,                            -- anonymous session identifier
  ip_country    text,
  ip_region     text,
  user_agent    text,
  hour_of_day   integer,                         -- 0-23
  completed     boolean default false,
  completion_step integer,                       -- which step they reached
  rating        integer,                         -- 1-5 stars (null if not rated)
  scanned_at    timestamptz default now()
);

-- ─── QUESTIONS ──────────────────────────────────────────
-- Questions customers ask during assembly
create table questions (
  id            uuid primary key default uuid_generate_v4(),
  sku_id        uuid references skus(id) on delete cascade,
  company_id    uuid references companies(id) on delete cascade,
  session_id    text,
  question_text text not null,
  step_number   integer,
  asked_at      timestamptz default now()
);

-- ─── NOTIFICATIONS ──────────────────────────────────────
-- Per-user notification preferences
create table notification_preferences (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid references users(id) on delete cascade unique,
  qr_ready              boolean default true,
  weekly_digest         boolean default true,
  dropoff_alerts        boolean default false,
  question_spikes       boolean default true,
  billing               boolean default true,
  product_updates       boolean default false
);

-- ─── ROW LEVEL SECURITY ─────────────────────────────────
-- Companies can only see their own data
alter table companies enable row level security;
alter table users enable row level security;
alter table skus enable row level security;
alter table scans enable row level security;
alter table questions enable row level security;

-- ─── ANALYTICS VIEWS ────────────────────────────────────
-- Pre-built views to make analytics queries fast

-- Scans per day per company
create or replace view daily_scans as
  select
    company_id,
    sku_id,
    date_trunc('day', scanned_at) as scan_date,
    count(*) as scan_count,
    count(*) filter (where completed = true) as completed_count,
    avg(rating) filter (where rating is not null) as avg_rating
  from scans
  group by company_id, sku_id, date_trunc('day', scanned_at);

-- SKU performance summary
create or replace view sku_performance as
  select
    s.id,
    s.company_id,
    s.sku_code,
    s.product_name,
    s.category,
    s.status,
    s.step_count,
    s.qr_code_url,
    s.qr_target_url,
    s.created_at,
    count(sc.id) as total_scans,
    count(sc.id) filter (where sc.completed = true) as completed_scans,
    round(
      count(sc.id) filter (where sc.completed = true)::numeric /
      nullif(count(sc.id), 0) * 100, 1
    ) as completion_rate,
    round(avg(sc.rating) filter (where sc.rating is not null), 1) as avg_rating,
    count(sc.id) filter (
      where sc.session_id in (
        select session_id from scans sc2
        where sc2.sku_id = s.id
        group by session_id having count(*) > 1
      )
    ) as repeat_scans
  from skus s
  left join scans sc on sc.sku_id = s.id
  group by s.id;

-- Top questions per company
create or replace view top_questions as
  select
    company_id,
    sku_id,
    question_text,
    step_number,
    count(*) as frequency
  from questions
  group by company_id, sku_id, question_text, step_number
  order by frequency desc;

-- ─── INDEXES ────────────────────────────────────────────
create index idx_scans_company on scans(company_id);
create index idx_scans_sku on scans(sku_id);
create index idx_scans_date on scans(scanned_at);
create index idx_skus_company on skus(company_id);
create index idx_questions_sku on questions(sku_id);
create index idx_users_email on users(email);
