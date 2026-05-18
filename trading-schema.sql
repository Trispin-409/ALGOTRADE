-- First, drop the tables and constraints to get a clean slate if they exist.
-- (This removes the bad constraints you were seeing)
DROP TABLE IF EXISTS public.algo_sessions CASCADE;
DROP TABLE IF EXISTS public.ea_deployments CASCADE;
DROP TABLE IF EXISTS public.ea_leases CASCADE;

-- 1. Create ea_leases table
-- (Using uuid for account_id for consistency since MetaApi account IDs are UUID strings)
CREATE TABLE public.ea_leases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  account_id uuid not null, -- Consistent type
  ea_name text not null,
  region text not null,
  status text not null default 'DEPLOYED',
  last_heartbeat timestamptz default now(),
  created_at timestamptz default now()
);

-- Optionally, make (user_id, account_id) unique if a user is only allowed 1 lease per account
ALTER TABLE public.ea_leases ADD CONSTRAINT unique_user_account_lease UNIQUE (user_id, account_id);

-- 2. Create ea_deployments table
CREATE TABLE public.ea_deployments (
  user_id uuid not null references auth.users(id),
  account_id uuid primary key, -- Consistent type and used for upsert via onConflict: 'account_id'
  deployed boolean not null default false,
  status text,
  deployed_at timestamptz,
  created_at timestamptz default now()
);

-- 3. Create algo_sessions table
CREATE TABLE public.algo_sessions (
  user_id uuid not null references auth.users(id),
  account_id uuid primary key, -- Consistent type and used for upsert via onConflict: 'account_id'
  running boolean not null default false,
  created_at timestamptz default now(),
  last_updated timestamptz default now()
);

-- Enable RLS (Optional depending on your needs, but good practice)
ALTER TABLE public.ea_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ea_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.algo_sessions ENABLE ROW LEVEL SECURITY;

-- Basic Policies (so your admin client can still write, and users can read their own data)
CREATE POLICY "Users can view their own leases" ON public.ea_leases FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view their own deployments" ON public.ea_deployments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view their own sessions" ON public.algo_sessions FOR SELECT USING (auth.uid() = user_id);
