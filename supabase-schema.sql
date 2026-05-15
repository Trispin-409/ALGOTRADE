-- User Roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id uuid references auth.users primary key,
  role text not null default 'user' CHECK (role IN ('user', 'admin', 'developer'))
);

-- Access Keys Table (For Device Binding)
CREATE TABLE IF NOT EXISTS public.access_keys (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  plan_type text not null,
  status text not null default 'pending', -- 'pending', 'used', 'revoked'
  user_id uuid references auth.users, -- bound user
  device_fingerprint text, -- bound device
  created_by uuid references auth.users,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

-- Subscriptions Table
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  plan_type text not null, -- 'Starter', 'Pro', 'Elite'
  start_date timestamptz not null default now(),
  expiry_date timestamptz not null,
  status text not null default 'pending', -- 'pending', 'active', 'expired', 'cancelled'
  metaapi_account_limit integer not null,
  access_key_id uuid references public.access_keys
);

-- Payment Logs
CREATE TABLE IF NOT EXISTS public.payment_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  reference text,
  amount numeric(10,2) not null,
  status text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users,
  action text not null,
  target_user_id uuid references auth.users,
  details jsonb,
  created_at timestamptz not null default now()
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Access Keys Policies
CREATE POLICY "Users can view their own keys" ON public.access_keys
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all keys" ON public.access_keys
  FOR ALL USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid()) IN ('admin', 'developer')
  );

-- User Roles Policies
-- Users can read their own role
CREATE POLICY "Users can view their own role" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- Admins/Developers can view all roles
CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid()) IN ('admin', 'developer')
  );

-- Subscriptions Policies
-- Users can view their own subscriptions
CREATE POLICY "Users can view their own subscriptions" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Admins can manage all subscriptions
CREATE POLICY "Admins can manage all subscriptions" ON public.subscriptions
  FOR ALL USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid()) IN ('admin', 'developer')
  );

-- Payment Logs Policies
-- Users can view their own payments
CREATE POLICY "Users can view their own payments" ON public.payment_logs
  FOR SELECT USING (auth.uid() = user_id);

-- Admins can view all payments
CREATE POLICY "Admins can view all payments" ON public.payment_logs
  FOR SELECT USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid()) IN ('admin', 'developer')
  );

-- Audit Logs Policies
-- Only Admins/Developers can view audit logs
CREATE POLICY "Admins can view audit logs" ON public.audit_logs
  FOR SELECT USING (
    (SELECT role FROM public.user_roles WHERE admin_id = auth.uid()) IN ('admin', 'developer')
  );
