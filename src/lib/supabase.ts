import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment variables.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
);

export type Fragment = {
  id: string;
  user_id: string;
  content: string;
  embedding: number[] | null;
  created_at: string;
};

export type Connection = {
  id: string;
  fragment_a_id: string;
  fragment_b_id: string;
  reasoning: string;
  strength: number;
  created_at: string;
};

export type WeeklySummary = {
  id: string;
  user_id: string;
  week_start: string;
  week_end: string;
  summary_text: string;
  tree_data: any;
  created_at: string;
};
