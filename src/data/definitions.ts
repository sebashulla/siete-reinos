import type { Affinity, Character, Stats } from './types';
export const SPECIALIZATIONS: Record<Affinity, { name: string; description: string; stats: Stats; weapon: string }> = {
  swordsman: { name: 'Espadachín', description: 'Acero certero. Armadura ligera y una espada para abrir camino.', stats: { health: 120, mana: 60, physical: 26, magical: 15, speed: 135 }, weapon: 'espada' },
  mage: { name: 'Mago', description: 'Magia ancestral. Túnica, bastón y el poder de la auralita.', stats: { health: 85, mana: 110, physical: 15, magical: 34, speed: 130 }, weapon: 'baston' },
};
export const ITEMS: Record<string, { name: string; description: string; icon: string }> = {
  feron: { name: 'Feron', description: 'Mineral para fortalecer el acero.', icon: '◆' },
  auralita: { name: 'Auralita', description: 'Cristal de afinidad mágica.', icon: '✧' },
  pocion: { name: 'Poción', description: 'Restaura 45 puntos de salud.', icon: '♜' },
  espada: { name: 'Espada de viajero', description: 'Una hoja de acero bien equilibrada.', icon: '†' },
  baston: { name: 'Bastón de avellano', description: 'Canaliza la magia de Valdoria.', icon: '⚚' },
  cuero: { name: 'Armadura ligera', description: 'Cuero y acero para explorar.', icon: '♜' },
  tunica: { name: 'Túnica de aprendiz', description: 'Tejida con hilo arcano.', icon: '♜' },
};
export const SKILLS = [
  { id: 'sword', name: 'Corte de acero', key: 'ESPACIO', description: 'Golpea frente a ti. Disponible para ambas afinidades.' },
  { id: 'magic', name: 'Chispa arcana', key: 'Q', description: 'Proyectil mágico. Consume 12 de maná.' },
  { id: 'hybrid', name: 'Hoja encantada', key: 'ESPACIO', description: 'Nivel 3: añade daño mágico al golpe de espada.' },
];
export function statsFor(character: Character): Stats {
  const base = SPECIALIZATIONS[character.affinity].stats;
  return { ...base, health: base.health + (character.level - 1) * 12,
    mana: base.mana + (character.level - 1) * 6,
    physical: base.physical + (character.level - 1) * 3,
    magical: base.magical + (character.level - 1) * 4 };
}
export const WORLD = { width: 1920, height: 1440, tile: 32, spawn: { x: 960, y: 800 } };
