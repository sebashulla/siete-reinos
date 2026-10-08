import { requireSupabase } from './supabase';
import { AFFINITIES, PALETTES, type Affinity, type Appearance, type Character, type Campaign } from '../data/types';
const LOCAL_KEY = 'siete-reinos:local:v1';
export class ConsentRequired extends Error {constructor(readonly version:number){super('Acepta individualmente las reglas hardcore antes de entrar.');}}
export class PersistenceService {
  async load(campaignId?:string): Promise<Character | null> {
    const client = requireSupabase();
    const { data: auth, error: authError } = await client.auth.getUser();
    if(authError)throw authError;
    if (!auth.user) return null;
    let query=client.from('characters').select('*').eq('user_id',auth.user.id).eq('life_status','active');
    query=campaignId?query.eq('campaign_id',campaignId):query.is('campaign_id',null);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data as Character | null;
  }
  async create(name: string, affinity: Affinity, appearance: Appearance,campaignId:string): Promise<Character> {
    const { data, error } = await requireSupabase().rpc('create_campaign_character', {p_campaign:campaignId,p_name:name.trim(),p_affinity:affinity,p_appearance:appearance});
    if (error) throw error;
    return data as Character;
  }
  async customize(appearance: Appearance,characterId:string): Promise<Character> {
    const { data, error } = await requireSupabase().rpc('customize_campaign_character', {p_character:characterId,p_appearance:appearance});
    if (error) throw error;
    return data as Character;
  }
  async campaigns():Promise<Campaign[]>{const {data,error}=await requireSupabase().from('campaigns').select('*').order('created_at');if(error)throw error;return data as Campaign[];}
  async createCampaign(name:string,mode:Campaign['mode']='casual',consent?:number):Promise<Campaign>{const {data,error}=await requireSupabase().rpc('create_campaign',{p_name:name,p_mode:mode,p_consent:consent??null});if(error)throw error;return data;}
  async joinCampaign(code:string,consent?:number):Promise<Campaign>{const {data,error}=await requireSupabase().rpc('join_campaign',{p_code:code,p_consent:consent??null});if(error)throw error;if(data.consent_required)throw new ConsentRequired(data.rules_version);if(data.error)throw new Error(data.error);return data;}
  async claim(id:string,campaignId:string):Promise<Character>{const {data,error}=await requireSupabase().rpc('claim_legacy_character',{p_character:id,p_campaign:campaignId});if(error)throw error;return data;}
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
