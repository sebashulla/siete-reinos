import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
export const configured = Boolean(url?.startsWith('https://') && key?.startsWith('sb_publishable_') && !key.includes('replace_me'));
export const supabase = configured ? createClient(url!, key!, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null;
export function requireSupabase() {
  if (!supabase) throw new Error('Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY para jugar en línea.');
  return supabase;
}
export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : (error as { message?: string })?.message ?? 'No se pudo completar la operación.';
  if (/PGRST|schema cache|function public|relation .* does not exist/i.test(message)) return 'Falta instalar la migración SQL en Supabase. Consulta el README y supabase/migrations.';
  if (/Email not confirmed/i.test(message)) return 'Confirma tu correo antes de iniciar sesión.';
  if (/Invalid login credentials/i.test(message)) return 'Correo o contraseña incorrectos.';
  if (/rate limit/i.test(message)) return 'Supabase ha limitado los intentos. Espera unos minutos antes de volver a intentar.';
  if (/Failed to fetch|NetworkError|503|project.*paused|temporarily unavailable/i.test(message)) return 'Supabase no está disponible. Puede estar pausado; el propietario puede reanudarlo desde el panel. Tu progreso se conserva.';
  return message;
}
