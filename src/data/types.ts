export const AFFINITIES = ['swordsman', 'mage'] as const;
export type Affinity = typeof AFFINITIES[number];
export const DIRECTIONS = ['down', 'left', 'right', 'up'] as const;
export type Direction = typeof DIRECTIONS[number];
export type ActorAction = 'idle' | 'walk' | 'attack' | 'hurt' | 'death';
export const PALETTES = ['forest', 'ember', 'violet'] as const;
export type Palette = typeof PALETTES[number];
export interface Appearance { palette: Palette; skin: 'warm' | 'deep' | 'light' }
export interface Character {
  campaign_id?: string | null; life_status?: 'active' | 'executed';
  id: string; user_id: string; name: string; affinity: Affinity; appearance: Appearance;
  level: number; xp: number; coins: number;
  inventory: Record<string, number>; equipment: { weapon: string; armor: string };
  skills: string[]; updated_at: string;
}
export interface Campaign { id:string; name:string; invite_code:string; owner_id:string; mode:'casual'|'hardcore'; rules_version:number; created_at:string }
export interface CampaignMembership { campaign_id:string; user_id:string; role:'owner'|'member'; consent_version:number|null }
export interface Member {
  user_id: string; character_id: string; name: string; affinity: Affinity; appearance: Appearance;
}
export interface Room { id: string; code: string; mode: 'adventure' | 'conquest'; owner_id: string }
export interface Position { x: number; y: number; direction: Direction; moving: boolean; seq: number }
export interface Interaction { action: 'sword' | 'magic' | 'dodge' | 'mine'; x: number; y: number; direction: Direction; seq: number }
export interface WorldSnapshot { seq:number; enemies:{id:string;x:number;y:number;health:number}[] }
export interface Stats { health: number; mana: number; physical: number; magical: number; speed: number }
