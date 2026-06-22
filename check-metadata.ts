import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const { data: users } = await supabase.auth.admin.listUsers();
  for (const u of users.users) {
    const meta = u.user_metadata;
    const str = JSON.stringify(meta);
    console.log(`User ${u.email} metadata size: ${str.length} bytes`);
  }
}
check();
