import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function fix() {
  console.log("Fetching all users...");
  const { data: users, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error("Error fetching users:", error);
    return;
  }
  let count = 0;
  for (const u of users.users) {
    const meta = u.user_metadata;
    if (meta?.chart_settings?.bgImageUrl && meta.chart_settings.bgImageUrl.length > 500) {
      console.log(`Fixing user ${u.email}...`);
      meta.chart_settings.bgImageUrl = '';
      await supabase.auth.admin.updateUserById(u.id, { user_metadata: meta });
      count++;
    }
  }
  console.log(`Fixed ${count} users.`);
}
fix();
