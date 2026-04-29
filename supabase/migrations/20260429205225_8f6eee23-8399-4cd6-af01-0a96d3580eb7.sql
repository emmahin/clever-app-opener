-- Subscriptions table
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  paddle_subscription_id text not null unique,
  paddle_customer_id text not null,
  product_id text not null,
  price_id text not null,
  status text not null default 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  environment text not null default 'sandbox',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_subscriptions_user_id on public.subscriptions(user_id);
create index idx_subscriptions_paddle_id on public.subscriptions(paddle_subscription_id);

alter table public.subscriptions enable row level security;

create policy "Users view own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

create policy "Service role manages subscriptions"
  on public.subscriptions for all
  using (auth.role() = 'service_role');

create policy "Admins view all subscriptions"
  on public.subscriptions for select
  using (public.has_role(auth.uid(), 'admin'));

-- Map a price_id (pack or sub) to credit amount
create or replace function public.paddle_credits_for_price(_price_id text)
returns integer language sql immutable as $$
  select case _price_id
    when 'pack_decouverte_100'  then 100
    when 'pack_starter_500'     then 500
    when 'pack_pro_2000'        then 2000
    when 'pack_ultra_10000'     then 10000
    when 'sub_starter_monthly'  then 500
    when 'sub_pro_monthly'      then 2000
    when 'sub_ultra_monthly'    then 10000
    else 0
  end;
$$;

-- Map a price_id (sub) to tier
create or replace function public.paddle_tier_for_price(_price_id text)
returns text language sql immutable as $$
  select case _price_id
    when 'sub_starter_monthly' then 'starter'
    when 'sub_pro_monthly'     then 'pro'
    when 'sub_ultra_monthly'   then 'ultra'
    else 'free'
  end;
$$;

-- One-time pack purchase: add to permanent purchased_credits
create or replace function public.apply_purchase_credits(_user_id uuid, _price_id text, _paddle_txn text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  _amount integer := public.paddle_credits_for_price(_price_id);
begin
  if _amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'unknown_price', 'price_id', _price_id);
  end if;
  return public.add_credits(
    _user_id := _user_id,
    _amount  := _amount,
    _kind    := 'purchase',
    _bucket  := 'purchased',
    _metadata:= jsonb_build_object('price_id', _price_id, 'paddle_txn', _paddle_txn)
  );
end;
$$;

-- Subscription renewal / activation: RESET subscription_credits to plan amount
create or replace function public.apply_subscription_credits(
  _user_id uuid, _price_id text, _renews_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  _amount integer := public.paddle_credits_for_price(_price_id);
  _tier   text    := public.paddle_tier_for_price(_price_id);
  _row    public.user_credits%rowtype;
begin
  if _amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'unknown_price', 'price_id', _price_id);
  end if;

  insert into public.user_credits (user_id, subscription_tier, subscription_credits, subscription_renews_at)
  values (_user_id, _tier, _amount, _renews_at)
  on conflict (user_id) do update
    set subscription_tier      = _tier,
        subscription_credits   = _amount,            -- reset (use it or lose it)
        subscription_renews_at = _renews_at,
        updated_at             = now()
  returning * into _row;

  insert into public.credit_transactions(user_id, kind, amount, balance_after, metadata)
  values (_user_id, 'subscription_grant', _amount,
          _row.subscription_credits + _row.purchased_credits,
          jsonb_build_object('price_id', _price_id, 'tier', _tier));

  return jsonb_build_object('ok', true, 'tier', _tier, 'credits', _amount);
end;
$$;

-- Subscription ended (period end after cancel): downgrade to free
create or replace function public.clear_subscription_credits(_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  update public.user_credits
    set subscription_tier      = 'free',
        subscription_credits   = 0,
        subscription_renews_at = null,
        updated_at             = now()
    where user_id = _user_id;

  insert into public.credit_transactions(user_id, kind, amount, balance_after, metadata)
  select _user_id, 'subscription_end', 0, subscription_credits + purchased_credits,
         '{"reason":"period_ended_or_canceled"}'::jsonb
    from public.user_credits where user_id = _user_id;

  return jsonb_build_object('ok', true);
end;
$$;