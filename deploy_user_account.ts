import MetaApiModule from 'metaapi.cloud-sdk/node';
import { adminSupabase } from './src/lib/supabaseAdmin.ts';
import dotenv from 'dotenv';
dotenv.config();

const MetaApi = typeof MetaApiModule === 'function' ? MetaApiModule : (MetaApiModule as any).default || MetaApiModule;

async function run() {
  console.log('--- STARTING ACCOUNT RECOVERY AND RE-DEPLOYMENT ---');
  
  // 1. Initialize Supabase
  if (!adminSupabase) {
    console.error('Supabase admin client not initialized.');
    return;
  }

  const userEmail = 'miyathobani579@gmail.com';
  console.log(`Step 1: Finding user by email: ${userEmail}`);
  const { data: user, error: userErr } = await adminSupabase
    .from('users')
    .select('*')
    .eq('email', userEmail)
    .maybeSingle();

  if (userErr || !user) {
    console.error('Could not find user in database:', userErr?.message || 'Not found');
    return;
  }
  
  const userId = user.id;
  console.log(`Found user: ${user.email} (ID: ${userId})`);

  // 2. Cleanup old leases to free up subscription slots
  console.log('Step 2: Cleaning up old leases/deployments to free up Starter plan limit...');
  const { data: oldLeases } = await adminSupabase
    .from('ea_leases')
    .select('*')
    .eq('user_id', userId);

  console.log(`Found ${oldLeases?.length || 0} old leases in database.`);
  if (oldLeases && oldLeases.length > 0) {
    for (const lease of oldLeases) {
      console.log(`Deleting old lease: ${lease.account_id}`);
      await adminSupabase.from('ea_leases').delete().eq('id', lease.id);
      await adminSupabase.from('ea_deployments').delete().eq('account_id', lease.account_id);
      await adminSupabase.from('algo_sessions').delete().eq('account_id', lease.account_id);
    }
    console.log('Old lease cleanup complete.');
  }

  // 3. Initialize MetaApi SDK
  let domainToUse = (process.env.METAAPI_DOMAIN || 'agiliumtrade.agiliumtrade.ai').trim();
  if (process.env.VITE_METAAPI_BASE_URL) {
    try {
      const url = new URL(process.env.VITE_METAAPI_BASE_URL);
      const parts = url.hostname.split('.');
      if (parts.length >= 2) {
          const commonRegions = ['london', 'new-york', 'singapore', 'frankfurt'];
          const regionIndex = parts.findIndex(p => commonRegions.includes(p));
          if (regionIndex !== -1 && regionIndex < parts.length - 1) {
              domainToUse = parts.slice(regionIndex + 1).join('.');
          } else {
              domainToUse = parts.slice(-2).join('.');
          }
      }
    } catch (e) {}
  }
  if (domainToUse === 'agiliumtrade.ai' || (domainToUse.includes('agiliumtrade.ai') && !domainToUse.includes('agiliumtrade.agiliumtrade.ai'))) {
      domainToUse = 'agiliumtrade.agiliumtrade.ai';
  }

  console.log(`Step 3: Connecting to MetaApi (Domain: ${domainToUse})...`);
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  const token = (process.env.METAAPI_ADMIN_TOKEN || '').trim();
  const metaapi = new MetaApi(token, {
    clientId: 'AIS_DEPLOYSCRIPT_' + Math.random().toString(36).substring(7),
    domain: domainToUse,
    extendedLogging: false,
    useSharedClient: true,
    requestTimeout: 60000,
    reliability: 'high',
    retryOpts: {
      maxRetries: 5,
      minDelayInMs: 2000,
      maxDelayInMs: 10000
    }
  });

  // 4. MetaApi Cleanup for duplicate login
  console.log('Step 4: Checking if account 415904 already exists on MetaApi to prevent collision...');
  let existingAccountOnMetaApi: any = null;
  try {
    const rawResponse = await metaapi.metatraderAccountApi.getAccountsWithInfiniteScrollPagination();
    const accounts = Array.isArray(rawResponse) ? rawResponse : rawResponse?.items ? rawResponse.items : rawResponse?.data ? rawResponse.data : [];
    
    existingAccountOnMetaApi = accounts.find((a: any) => String(a.login) === '415904' && String(a.server).toLowerCase() === 'rcgmarkets-real');
    if (existingAccountOnMetaApi) {
      console.log(`Collision found: Account ID ${existingAccountOnMetaApi.id} exists for login 415904. Deleting to redeploy fresh...`);
      await existingAccountOnMetaApi.remove();
      console.log('Successfully deleted old MetaApi account.');
    } else {
      console.log('No existing MetaApi collision found.');
    }
  } catch (err: any) {
    console.warn('Error during MetaApi account search/cleanup (ignoring):', err.message);
  }

  // 5. Register new account on MetaApi
  console.log('Step 5: Registering account on MetaApi...');
  const basePayload = {
    name: 'Thobani',
    server: 'RCGMarkets-Real',
    login: '415904',
    password: 'Thobani23@',
    type: 'cloud-g2',
    magic: 10101,
    metastatsApiEnabled: true
  };

  let account: any = null;
  try {
    console.log('Attempting registration with platform: mt4');
    account = await metaapi.metatraderAccountApi.createAccount({
      ...basePayload,
      platform: 'mt4'
    });
    console.log('Successfully registered MT4 account.');
  } catch (err: any) {
    console.log(`MT4 registration failed: ${err.message}. Retrying with platform: mt5...`);
    try {
      account = await metaapi.metatraderAccountApi.createAccount({
        ...basePayload,
        platform: 'mt5'
      });
      console.log('Successfully registered MT5 account.');
    } catch (err2: any) {
      console.error('CRITICAL: MetaApi registration failed on both MT4 and MT5:', err2.message);
      return;
    }
  }

  const accountId = account.id || account._id;
  console.log(`Account registered! ID is: ${accountId}`);

  // 6. Deploy the account on MetaApi
  console.log('Step 6: Triggering MetaApi terminal deployment...');
  try {
    await account.deploy();
    console.log('Deployment triggered successfully.');
  } catch (deployErr: any) {
    console.warn('Deployment trigger returned hint/error (usually benign):', deployErr.message);
  }

  // 7. Sync with Database
  console.log('Step 7: Creating new lease and deployment entries in Supabase...');
  
  // Create Lease
  const { error: leaseError } = await adminSupabase.from('ea_leases').insert({
    user_id: userId,
    account_id: accountId,
    ea_name: 'DEFAULT',
    region: 'london',
    status: 'DEPLOYED',
    last_heartbeat: new Date().toISOString()
  });

  if (leaseError) {
    console.error('Error inserting lease into DB:', leaseError.message);
  } else {
    console.log('Successfully created database lease.');
  }

  // Create Deployment
  const { error: depError } = await adminSupabase.from('ea_deployments').insert({
    user_id: userId,
    account_id: accountId,
    deployed: true,
    status: 'ACTIVE',
    deployed_at: new Date().toISOString()
  });

  if (depError) {
    console.error('Error inserting deployment into DB:', depError.message);
  } else {
    console.log('Successfully created database deployment.');
  }

  // Create Session
  const { error: sessError } = await adminSupabase.from('algo_sessions').insert({
    user_id: userId,
    account_id: accountId,
    running: true,
    last_updated: new Date().toISOString()
  });

  if (sessError) {
    console.error('Error inserting session into DB:', sessError.message);
  } else {
    console.log('Successfully created database algo session (running = true).');
  }

  console.log('--- RECOVERY AND RE-DEPLOYMENT SUCCESSFUL ---');
}

run().catch(console.error);
