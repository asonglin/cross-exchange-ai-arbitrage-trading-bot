import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://icdqhsxbceugjeasunom.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljZHFoc3hiY2V1Z2plYXN1bm9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMzg3OTYsImV4cCI6MjA4NzcxNDc5Nn0.pqgUr7js-DlvweLQ3J5jNlYh_lcKJuLEbNqnZKMFKUU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
