import { createClient } from '@supabase/supabase-js';

const supabaseUrl: string = (import.meta as any).env.VITE_SUPABASE_URL;
const supabaseAnonKey: string = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables in .env file!');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);