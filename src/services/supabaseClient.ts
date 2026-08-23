import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import type { Database } from "../types/database.js";

const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_ANON_KEY;

export const supabase = createClient<Database>(env.SUPABASE_URL, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export async function pingSupabase(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    const response = await fetch(`${env.SUPABASE_URL}/auth/v1/health`, {
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
      },
    });

    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "unknown",
    };
  }
}
