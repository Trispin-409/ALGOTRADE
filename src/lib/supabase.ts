import { createClient } from '@supabase/supabase-js';

// Accessing via import.meta.env for Vite
const vUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
const vKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let supabase: any = null;

if (vUrl && vKey) {
  supabase = createClient(vUrl, vKey);
} else {
  console.error('Supabase configuration missing in import.meta.env', import.meta.env);
  // Return dummy client to prevent runtime crash
  supabase = { auth: { getSession: () => Promise.resolve({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) } };
}

export { supabase };
