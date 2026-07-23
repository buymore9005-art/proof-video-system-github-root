import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Environment variable ${name} belum diisi di Vercel.`);
  }
  return value;
}

export const serverEnv = {
  supabaseUrl: required('VITE_SUPABASE_URL'),
  secretKey: required('SUPABASE_SECRET_KEY'),
  setupSecret: required('SETUP_SECRET'),
};

export function createServiceClient() {
  return createClient<Database>(serverEnv.supabaseUrl, serverEnv.secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
