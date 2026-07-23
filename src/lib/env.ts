const required = (value: string | undefined, name: string): string => {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`Environment variable ${name} belum diisi.`);
  }
  return normalized;
};

export const env = {
  supabaseUrl: required(import.meta.env.VITE_SUPABASE_URL, 'VITE_SUPABASE_URL'),
  supabasePublishableKey: required(
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    'VITE_SUPABASE_PUBLISHABLE_KEY',
  ),
};

export const getSupabaseProjectRef = (): string => {
  const hostname = new URL(env.supabaseUrl).hostname;
  const projectRef = hostname.split('.')[0];
  if (!projectRef) {
    throw new Error('VITE_SUPABASE_URL tidak valid.');
  }
  return projectRef;
};
