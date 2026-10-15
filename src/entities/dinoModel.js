// Creature models live in creatureModel.js (sculpted skins, eyes, LODs) and
// creatureRig.js (gaits, IK, springs, faces); the systems that spawn
// creatures keep using these names.
import { buildCreature } from './creatureModel.js';
import { CreatureRig } from './creatureRig.js';
import { DESIGNS } from './creatureDesigns.js';

export const sculpted = (sp) => !!(DESIGNS[sp.design ?? sp.id] ?? DESIGNS._fallback);
export const buildDino = buildCreature;
export const DinoRig = CreatureRig;
export function dinoColorCss(sp) { return '#' + sp.look.color.toString(16).padStart(6, '0'); }
