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
  supabaseUrl: required('https://saeqilrxknmbfiyuxpos.supabase.co'),
  secretKey: required('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhZXFpbHJ4a25tYmZpeXV4cG9zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3OTc5NDIsImV4cCI6MjEwMDM3Mzk0Mn0.tToB5oBmjRtYCZL0k7YJci5pOlOX7DUSplXW_vqTniQ'),
  setupSecret: required('4d8f2c8f8d6b4d5aa7c1f0e9b6e4d2c1'),
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
