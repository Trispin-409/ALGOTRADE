import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''; 

let adminSupabase: any = null;

if (supabaseUrl && supabaseServiceKey) {
  adminSupabase = createClient(supabaseUrl, supabaseServiceKey);
} else {
  console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing, Supabase backend disabled.');
}

export { adminSupabase };
