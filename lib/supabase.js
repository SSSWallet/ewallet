import { createClient } from '@supabase/supabase-js';

// Usiamo l'URL del progetto e la chiave Anon/Public che trovi sulla dashboard di Supabase
const supabaseUrl = 'https://rvsgbsnkurutsburxkwk.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY; // La metteremo tra le variabili di Vercel

export const supabase = createClient(supabaseUrl, supabaseKey);
