import { SPECIALIZATIONS } from './definitions';
import type { Affinity, Appearance, Character } from './types';
export function starterCharacter(name: string, affinity: Affinity, appearance: Appearance): Character {
  return { id: crypto.randomUUID(), user_id: 'local', name, affinity, appearance,
    level: 1, xp: 0, coins: 0, inventory: { pocion: 3, feron: 0, auralita: 0 },
    equipment: { weapon: SPECIALIZATIONS[affinity].weapon, armor: affinity === 'mage' ? 'tunica' : 'cuero' },
    skills: ['sword', 'magic'], updated_at: new Date().toISOString() };
}
