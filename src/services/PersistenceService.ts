import { requireSupabase } from './supabase';
import { AFFINITIES, PALETTES, type Affinity, type Appearance, type Character } from '../data/types';
const LOCAL_KEY = 'siete-reinos:local:v1';
export class PersistenceService {
  async load(): Promise<Character | null> {
    const client = requireSupabase();
    const { data: auth, error: authError } = await client.auth.getUser();
    if(authError)throw authError;
    if (!auth.user) return null;
    const { data, error } = await client.from('characters').select('*').eq('user_id', auth.user.id).maybeSingle();
    if (error) throw error;
    return data as Character | null;
  }
  async create(name: string, affinity: Affinity, appearance: Appearance): Promise<Character> {
    const { data, error } = await requireSupabase().rpc('create_character', { p_name: name.trim(), p_affinity: affinity, p_appearance: appearance });
    if (error) throw error;
    return data as Character;
  }
  async customize(appearance: Appearance): Promise<Character> {
    const { data, error } = await requireSupabase().rpc('customize_character', { p_appearance: appearance });
    if (error) throw error;
    return data as Character;
  }
  // Online progression has no client mutation API. Only a future trusted server can award it.
  loadLocal(): Character | null {
    try {
      const c = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null') as Character | null;
      if (!c || c.user_id !== 'local' || !AFFINITIES.includes(c.affinity) || !PALETTES.includes(c.appearance?.palette)
        || !['warm', 'deep', 'light'].includes(c.appearance?.skin) || !Number.isInteger(c.level) || c.level < 1 || c.level > 100
        || !Number.isFinite(c.xp) || !c.inventory || !c.equipment || !Array.isArray(c.skills)) return null;
      return c;
    } catch { return null; }
  }
  saveLocal(character: Character): void {
    character.updated_at = new Date().toISOString();
    localStorage.setItem(LOCAL_KEY, JSON.stringify(character));
  }
}
