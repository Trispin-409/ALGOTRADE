import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const adminSupabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkSchema() {
  const { data, error } = await adminSupabase.from("users").select("*").limit(1);
  console.log("Data users:", data);
  console.log("Error users:", error);
}

checkSchema();
