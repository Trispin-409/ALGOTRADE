import { adminSupabase } from './src/lib/supabaseAdmin.ts';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  console.log('--- STARTING ONLY LEASE CLEANUP ---');
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

  // Cleanup old leases
  console.log('Step 2: Cleaning up leases, deployments, and sessions in database...');
  const { data: oldLeases } = await adminSupabase
    .from('ea_leases')
    .select('*')
    .eq('user_id', userId);

  console.log(`Found ${oldLeases?.length || 0} leases in database.`);
  if (oldLeases && oldLeases.length > 0) {
    for (const lease of oldLeases) {
      console.log(`Deleting lease: ${lease.account_id}`);
      
      const { error: d1 } = await adminSupabase.from('ea_leases').delete().eq('id', lease.id);
      if (d1) console.error('Error deleting from ea_leases:', d1.message);
      
      const { error: d2 } = await adminSupabase.from('ea_deployments').delete().eq('account_id', lease.account_id);
      if (d2) console.error('Error deleting from ea_deployments:', d2.message);
      
      const { error: d3 } = await adminSupabase.from('algo_sessions').delete().eq('account_id', lease.account_id);
      if (d3) console.error('Error deleting from algo_sessions:', d3.message);
    }
  }
  console.log('--- DB CLEANUP COMPLETE ---');
}

run().catch(console.error);
