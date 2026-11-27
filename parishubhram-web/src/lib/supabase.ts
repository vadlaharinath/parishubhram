import { createClient } from '@supabase/supabase-js';

const envUrl: string | undefined = (import.meta as any).env?.VITE_SUPABASE_URL;
const envKey: string | undefined = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

// Public Supabase URL & publishable key (safe for frontend; protected by PostgreSQL RLS)
const supabaseUrl = (envUrl && envUrl.startsWith('http') ? envUrl : 'https://tcokwfncvcevoyvuklxa.supabase.co').trim();
const supabaseAnonKey = (envKey || 'sb_publishable_KMVwZi7ajgLDbf4VyDvyHQ_17y-y974').trim();

export const supabase = createClient(supabaseUrl, supabaseAnonKey);