import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyWebhook, EventName, type PaddleEnv } from '../_shared/paddle.ts';

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
  }
  return _supabase;
}

function extractIds(item: any) {
  const priceId = item?.price?.importMeta?.externalId;
  const productId = item?.product?.importMeta?.externalId;
  return { priceId, productId };
}

async function handleSubscriptionCreated(data: any, env: PaddleEnv) {
  const { id, customerId, items, status, currentBillingPeriod, customData } = data;
  const userId = customData?.userId;
  if (!userId) { console.error('No userId in customData'); return; }

  const item = items?.[0];
  const { priceId, productId } = extractIds(item);
  if (!priceId || !productId) {
    console.warn('Skipping subscription: missing importMeta.externalId');
    return;
  }

  const sb = getSupabase();
  await sb.from('subscriptions').upsert({
    user_id: userId,
    paddle_subscription_id: id,
    paddle_customer_id: customerId,
    product_id: productId,
    price_id: priceId,
    status,
    current_period_start: currentBillingPeriod?.startsAt,
    current_period_end: currentBillingPeriod?.endsAt,
    environment: env,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'paddle_subscription_id' });

  // Grant subscription credits immediately
  await sb.rpc('apply_subscription_credits', {
    _user_id: userId,
    _price_id: priceId,
    _renews_at: currentBillingPeriod?.endsAt ?? null,
  });
}

async function handleSubscriptionUpdated(data: any, env: PaddleEnv) {
  const { id, status, currentBillingPeriod, scheduledChange, items, customData } = data;
  const sb = getSupabase();

  const item = items?.[0];
  const { priceId, productId } = extractIds(item);

  // Find existing row to detect plan change
  const { data: existing } = await sb
    .from('subscriptions')
    .select('user_id, price_id, current_period_end')
    .eq('paddle_subscription_id', id)
    .eq('environment', env)
    .maybeSingle();

  await sb.from('subscriptions')
    .update({
      status,
      price_id: priceId ?? existing?.price_id,
      product_id: productId ?? undefined,
      current_period_start: currentBillingPeriod?.startsAt,
      current_period_end: currentBillingPeriod?.endsAt,
      cancel_at_period_end: scheduledChange?.action === 'cancel',
      updated_at: new Date().toISOString(),
    })
    .eq('paddle_subscription_id', id)
    .eq('environment', env);

  const userId = existing?.user_id ?? customData?.userId;
  if (!userId || !priceId) return;

  const planChanged = existing && existing.price_id !== priceId;
  const renewed = existing && existing.current_period_end &&
    currentBillingPeriod?.endsAt &&
    new Date(currentBillingPeriod.endsAt) > new Date(existing.current_period_end);

  // Upgrade (plan change) OR renewal => reset subscription credits to plan amount
  if ((planChanged || renewed) && (status === 'active' || status === 'trialing')) {
    await sb.rpc('apply_subscription_credits', {
      _user_id: userId,
      _price_id: priceId,
      _renews_at: currentBillingPeriod?.endsAt ?? null,
    });
  }
}

async function handleSubscriptionCanceled(data: any, env: PaddleEnv) {
  const sb = getSupabase();
  const { data: existing } = await sb
    .from('subscriptions')
    .select('user_id, current_period_end')
    .eq('paddle_subscription_id', data.id)
    .eq('environment', env)
    .maybeSingle();

  await sb.from('subscriptions')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('paddle_subscription_id', data.id)
    .eq('environment', env);

  // If period already ended, clear credits now. Otherwise keep until period_end.
  if (existing?.user_id && existing.current_period_end &&
      new Date(existing.current_period_end) <= new Date()) {
    await sb.rpc('clear_subscription_credits', { _user_id: existing.user_id });
  }
}

async function handleTransactionCompleted(data: any, env: PaddleEnv) {
  // One-time pack purchases (no subscription_id) -> add permanent credits
  if (data.subscriptionId) return; // subscription transactions handled elsewhere
  const userId = data.customData?.userId;
  if (!userId) { console.warn('Transaction missing userId'); return; }

  const item = data.items?.[0];
  const priceId = item?.price?.importMeta?.externalId;
  if (!priceId) { console.warn('Transaction missing price externalId'); return; }

  const sb = getSupabase();
  await sb.rpc('apply_purchase_credits', {
    _user_id: userId,
    _price_id: priceId,
    _paddle_txn: data.id,
  });
}

async function handleWebhook(req: Request, env: PaddleEnv) {
  const event = await verifyWebhook(req, env);
  switch (event.eventType) {
    case EventName.SubscriptionCreated:
      await handleSubscriptionCreated(event.data, env); break;
    case EventName.SubscriptionUpdated:
      await handleSubscriptionUpdated(event.data, env); break;
    case EventName.SubscriptionCanceled:
      await handleSubscriptionCanceled(event.data, env); break;
    case EventName.TransactionCompleted:
      await handleTransactionCompleted(event.data, env); break;
    default:
      console.log('Unhandled event:', event.eventType);
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const url = new URL(req.url);
  const env = (url.searchParams.get('env') || 'sandbox') as PaddleEnv;
  try {
    await handleWebhook(req, env);
    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Webhook error:', e);
    return new Response('Webhook error', { status: 400 });
  }
});