// Crafting recipes. station: null = by hand (backpack), otherwise must be near
// that station (or inside the van for 'van'). unlock: research tech id.
export const STATIONS = {
  hand: { name: 'By Hand' },
  workbench: { name: 'Workbench' },
  campfire: { name: 'Campfire' },
  cooking_pot: { name: 'Cooking Pot' },
  kiln: { name: 'Clay Kiln' },
  forge: { name: 'Forge' },
  smoker: { name: 'Smoker' },
  research_table: { name: 'Research Table' },
  van: { name: 'Van Workshop' },
};

const R = [];
const r = (id, out, n, inputs, opt = {}) => R.push({ id, out, n, in: inputs, station: opt.station ?? 'hand', time: opt.time ?? 1.2, unlock: opt.unlock ?? null, cat: opt.cat ?? 'basics', hidden: opt.hidden });

// ---- by hand
r('thatch', 'thatch', 1, { fiber: 3 }, { time: 0.8 });
r('rope', 'rope', 1, { fiber: 4 }, { time: 1 });
r('stone_hatchet', 'stone_hatchet', 1, { stick: 2, stone: 3, fiber: 3 }, { cat: 'tools', time: 1.6 });
r('stone_pick', 'stone_pick', 1, { stick: 2, stone: 4, fiber: 3 }, { cat: 'tools', time: 1.6 });
r('club', 'club', 1, { stick: 3, fiber: 2 }, { cat: 'tools', time: 1.2 });
r('torch', 'torch', 1, { stick: 1, fiber: 2, resin: 1 }, { cat: 'tools', time: 1 });
r('torch_cheap', 'torch', 1, { stick: 1, fiber: 4 }, { cat: 'tools', time: 1 });
r('campfire', 'campfire', 1, { stick: 4, stone: 5 }, { cat: 'camp', time: 1.5 });
r('hammer', 'hammer', 1, { stick: 2, stone: 2, fiber: 2 }, { cat: 'tools', time: 1.4 });
r('bedroll', 'bedroll', 1, { fiber: 15, thatch: 4 }, { cat: 'camp', time: 2 });
r('bandage', 'bandage', 1, { fiber: 4, herb: 1 }, { cat: 'medical', time: 1.2 });
r('bola', 'bola', 1, { rope: 2, stone: 3 }, { cat: 'tools', time: 1.5, unlock: 'tame_basics' });
r('workbench', 'workbench', 1, { log: 4, stone: 6, rope: 2 }, { cat: 'camp', time: 2.5 });
r('canteen_hand', 'canteen', 1, { hide: 1, rope: 1, resin: 1 }, { cat: 'tools', time: 1.5 });

// ---- workbench
const WB = { station: 'workbench' };
r('plank', 'plank', 3, { log: 1 }, { ...WB, time: 1.2 });
r('storage_box', 'storage_box', 1, { plank: 10, rope: 2 }, { ...WB, cat: 'camp', time: 2.5 });
r('spear', 'spear', 1, { stick: 3, flint: 2, rope: 1 }, { ...WB, cat: 'tools', time: 2 });
r('slingshot', 'slingshot', 1, { stick: 3, hide: 1, rope: 1 }, { ...WB, cat: 'tools', time: 2, unlock: 'tame_basics' });
r('shovel', 'shovel', 1, { stick: 2, plank: 2, scrap: 2 }, { ...WB, cat: 'tools', time: 2 });
r('sickle', 'sickle', 1, { stick: 1, flint: 3, fiber: 2 }, { ...WB, cat: 'tools', time: 1.6 });
r('net', 'net', 1, { stick: 2, rope: 4 }, { ...WB, cat: 'tools', time: 2, unlock: 'tame_basics' });
r('blowgun', 'blowgun', 1, { stick: 4, resin: 2, fiber: 4 }, { ...WB, cat: 'tools', time: 2.5, unlock: 'tranquilizers' });
r('tranq_dart', 'tranq_dart', 3, { stick: 1, flint: 1, snoozeberry: 4, feather: 1 }, { ...WB, cat: 'tools', time: 2, unlock: 'tranquilizers' });
r('cooking_pot', 'cooking_pot', 1, { clay: 6, stone: 6, stick: 3 }, { ...WB, cat: 'camp', time: 2.5, unlock: 'cooking' });
r('crop_plot', 'crop_plot', 1, { plank: 4, dung: 2, fiber: 6 }, { ...WB, cat: 'farm', time: 2, unlock: 'farming' });
r('water_collector', 'water_collector', 1, { plank: 6, hide: 2, resin: 2 }, { ...WB, cat: 'camp', time: 2.5, unlock: 'farming' });
r('torch_stand', 'torch_stand', 1, { stick: 3, fiber: 3, resin: 1 }, { ...WB, cat: 'camp', time: 1.2 });
r('feed_trough', 'feed_trough', 1, { plank: 8, rope: 2 }, { ...WB, cat: 'dinos', time: 2.5, unlock: 'tame_basics' });
r('kiln', 'kiln', 1, { clay: 12, stone: 10 }, { ...WB, cat: 'camp', time: 3, unlock: 'pottery' });
r('smoker', 'smoker', 1, { plank: 6, stone: 8, clay: 4 }, { ...WB, cat: 'camp', time: 3, unlock: 'cooking' });
r('saddle_small', 'saddle_small', 1, { hide: 4, rope: 3, plank: 2 }, { ...WB, cat: 'dinos', time: 3, unlock: 'saddles' });
r('saddle_big', 'saddle_big', 1, { hide: 8, rope: 6, plank: 6, ingot_iron: 1 }, { ...WB, cat: 'dinos', time: 4, unlock: 'saddles' });
r('bed', 'bed', 1, { plank: 8, hide: 3, fiber: 20 }, { ...WB, cat: 'camp', time: 3, unlock: 'comfort' });
r('spike_wall', 'spike_wall', 1, { log: 2, stick: 6, rope: 1 }, { ...WB, cat: 'defense', time: 2, unlock: 'defense' });
r('splint', 'splint', 1, { stick: 2, fiber: 3 }, { ...WB, cat: 'medical', time: 1.4 });
r('fishing_rod', 'fishing_rod', 1, { stick: 3, rope: 2, bone: 1 }, { ...WB, cat: 'tools', time: 2 });
r('incubator', 'incubator', 1, { plank: 6, clay: 6, scrap: 4, glass: 1 }, { ...WB, cat: 'dinos', time: 3, unlock: 'eggs' });
r('dino_bed', 'dino_bed', 1, { fiber: 20, stick: 10, feather: 4 }, { ...WB, cat: 'dinos', time: 2, unlock: 'tame_basics' });
r('flag', 'flag', 1, { stick: 3, hide: 1, fiber: 4 }, { ...WB, cat: 'camp', time: 1.5 });
r('lantern', 'lantern', 1, { glass: 1, scrap: 1, resin: 1 }, { ...WB, cat: 'tools', time: 1.5, unlock: 'pottery' });
r('whistle', 'whistle', 1, { bone: 1, resin: 1 }, { ...WB, cat: 'dinos', time: 1, unlock: 'tame_basics' });
r('fridge', 'fridge', 1, { plank: 6, scrap: 6, salt: 4 }, { ...WB, cat: 'camp', time: 2.5, unlock: 'cooking' });
r('specimen_shelf', 'specimen_shelf', 1, { plank: 8 }, { ...WB, cat: 'camp', time: 2 });
r('table', 'table', 1, { plank: 6 }, { ...WB, cat: 'decor', time: 2 });
r('chair', 'chair', 1, { plank: 3, fiber: 4 }, { ...WB, cat: 'decor', time: 1.5 });
r('rug', 'rug', 1, { fiber: 20, hide: 1 }, { ...WB, cat: 'decor', time: 2 });
r('planter', 'planter', 1, { clay: 4, fiber: 2, seed_fern: 1 }, { ...WB, cat: 'decor', time: 1.5 });
r('hammock', 'hammock', 1, { rope: 6, log: 2, hide: 1 }, { ...WB, cat: 'decor', time: 2.5 });
r('skull_trophy', 'skull_trophy', 1, { bone: 6, stick: 2 }, { ...WB, cat: 'decor', time: 2 });
r('research_table', 'research_table', 1, { plank: 8, glass: 2, scrap: 4, circuit: 1 }, { ...WB, cat: 'science', time: 3, unlock: 'lab' });

// ---- campfire (cooking)
const CF = { station: 'campfire', cat: 'food' };
r('cook_meat', 'meat_cooked', 1, { meat_raw: 1 }, { ...CF, time: 6 });
r('cook_prime', 'steak', 1, { meat_prime: 1 }, { ...CF, time: 8 });
r('cook_fish', 'fish_cooked', 1, { fish_raw: 1 }, { ...CF, time: 5 });
r('cook_egg', 'egg_cooked', 1, { egg_small: 1 }, { ...CF, time: 4 });
r('roast_ginkgo', 'ginkgo_roast', 1, { ginkgo_nut: 2 }, { ...CF, time: 4 });
r('roast_cycad', 'cycad_roast', 1, { cycadcone: 1 }, { ...CF, time: 6 });
r('kebab', 'kebab', 1, { stick: 1, starchroot: 1, mushroom_brown: 1, fiddlehead: 1 }, { ...CF, time: 5 });
r('boil_water_fire', 'water_clean', 1, { water_dirty: 1 }, { ...CF, time: 6, unlock: 'cooking' });

// ---- cooking pot
const CP = { station: 'cooking_pot', cat: 'food' };
r('stew', 'stew', 1, { meat_cooked: 1, starchroot: 1, mushroom_brown: 1, water_clean: 1 }, { ...CP, time: 10 });
r('veg_stew', 'stew', 1, { starchroot: 2, fiddlehead: 2, water_clean: 1 }, { ...CP, time: 10 });
r('boil_water', 'water_clean', 2, { water_dirty: 2 }, { ...CP, time: 6 });
r('antidote', 'antidote', 1, { herb: 3, mushroom_brown: 1, water_clean: 1 }, { ...CP, cat: 'medical', time: 8 });
r('medkit', 'medkit', 1, { herb: 4, bandage: 2, honey: 1 }, { ...CP, cat: 'medical', time: 10, unlock: 'medicine' });
r('snooze_brew', 'tranq_dart', 6, { snoozeberry: 12, stick: 3, flint: 3 }, { ...CP, cat: 'tools', time: 8, unlock: 'tranquilizers' });

// ---- smoker
r('jerky', 'jerky', 3, { meat_cooked: 2, salt: 1 }, { station: 'smoker', cat: 'food', time: 12 });

// ---- kiln
const K = { station: 'kiln', cat: 'materials' };
r('brick', 'brick', 2, { clay: 2 }, { ...K, time: 5 });
r('glass', 'glass', 1, { sand: 4 }, { ...K, time: 6 });
r('charcoal', 'charcoal', 2, { log: 1 }, { ...K, time: 6 });
r('forge', 'forge', 1, { brick: 16, stone: 10 }, { station: 'workbench', cat: 'camp', time: 3, unlock: 'metallurgy' });

// ---- forge
const FG = { station: 'forge', cat: 'materials' };
r('ingot_iron', 'ingot_iron', 1, { iron: 2, charcoal: 1 }, { ...FG, time: 8 });
r('ingot_copper', 'ingot_copper', 1, { copper: 2, charcoal: 1 }, { ...FG, time: 8 });
r('wire', 'wire', 4, { ingot_copper: 1 }, { ...FG, time: 5 });
r('metal_hatchet', 'metal_hatchet', 1, { ingot_iron: 2, plank: 1, hide: 1 }, { ...FG, cat: 'tools', time: 6, unlock: 'metallurgy' });
r('metal_pick', 'metal_pick', 1, { ingot_iron: 2, plank: 1, hide: 1 }, { ...FG, cat: 'tools', time: 6, unlock: 'metallurgy' });
r('saddle_rex', 'saddle_rex', 1, { ingot_iron: 6, hide: 16, rope: 10 }, { station: 'workbench', cat: 'dinos', time: 5, unlock: 'big_game' });

// ---- van workshop (electronics & time-machine parts)
const VN = { station: 'van', cat: 'tech' };
r('crank_dynamo', 'crank_dynamo', 1, { scrap: 4, wire: 2, stick: 2 }, { ...VN, time: 3 });
r('wiring_harness', 'wiring_harness', 1, { wire: 6, resin: 2, fiber: 4 }, { ...VN, time: 3, unlock: 'electrics' });
r('crt_part', 'crt_part', 1, { circuit: 2, glass: 1, wire: 2 }, { ...VN, time: 3, unlock: 'electrics' });
r('battery', 'battery', 1, { scrap: 2, ingot_copper: 1, sulfur: 2 }, { ...VN, time: 3, unlock: 'electrics' });
r('flashlight', 'flashlight', 1, { scrap: 2, battery: 1, glass: 1 }, { ...VN, cat: 'tools', time: 2 });
r('walkie', 'walkie', 1, { circuit: 1, battery: 1, scrap: 2 }, { ...VN, cat: 'tools', time: 3, unlock: 'radio' });
r('binoculars', 'binoculars', 1, { glass: 2, scrap: 2 }, { ...VN, cat: 'tools', time: 2 });
r('solar_panel', 'solar_panel', 1, { glass: 4, circuit: 2, wire: 4, scrap: 4 }, { ...VN, cat: 'power', time: 4, unlock: 'solar' });
r('generator', 'generator', 1, { scrap: 10, ingot_iron: 4, wire: 6, circuit: 1 }, { ...VN, cat: 'power', time: 5, unlock: 'biofuel' });
r('biofuel', 'biofuel', 1, { dung: 6, tar: 2, resin: 2 }, { ...VN, cat: 'power', time: 4, unlock: 'biofuel' });
r('lamp', 'lamp', 1, { glass: 1, wire: 2, scrap: 1 }, { ...VN, cat: 'power', time: 2, unlock: 'electrics' });
r('sprinkler', 'sprinkler', 1, { scrap: 4, wire: 2, resin: 2 }, { ...VN, cat: 'farm', time: 3, unlock: 'automation' });
r('dino_wheel', 'dino_wheel', 1, { plank: 20, ingot_iron: 4, wire: 8, circuit: 2 }, { ...VN, cat: 'power', time: 6, unlock: 'dino_power' });
r('auto_harvester', 'auto_harvester', 1, { scrap: 12, ingot_iron: 4, circuit: 3, wire: 8 }, { ...VN, cat: 'farm', time: 6, unlock: 'automation' });
r('radio_tower', 'radio_tower', 1, { ingot_iron: 6, wire: 10, circuit: 3, scrap: 6 }, { ...VN, cat: 'power', time: 6, unlock: 'radio' });
r('coffee_machine', 'coffee_machine', 1, { scrap: 4, glass: 1, wire: 2, circuit: 1 }, { ...VN, cat: 'camp', time: 3, unlock: 'comfort' });
r('tranq_rifle', 'tranq_rifle', 1, { ingot_iron: 6, scrap: 8, plank: 3, circuit: 1 }, { ...VN, cat: 'tools', time: 6, unlock: 'big_game' });
r('tranq_bullet', 'tranq_bullet', 4, { tranq_dart: 4, ingot_copper: 1, sulfur: 1 }, { ...VN, cat: 'tools', time: 3, unlock: 'big_game' });
r('saddle_flyer', 'saddle_flyer', 1, { hide: 10, rope: 8, ingot_iron: 2, feather: 10 }, { ...VN, cat: 'dinos', time: 5, unlock: 'flight' });
r('saddle_platform', 'saddle_platform', 1, { plank: 40, rope: 20, ingot_iron: 10, hide: 20 }, { ...VN, cat: 'dinos', time: 8, unlock: 'sauropod' });
r('lightning_rod', 'lightning_rod', 1, { ingot_iron: 8, ingot_copper: 6, wire: 12 }, { ...VN, cat: 'power', time: 6, unlock: 'lightning' });
r('capacitor', 'capacitor', 1, { battery: 6, wire: 10, circuit: 4, scrap: 8 }, { ...VN, cat: 'power', time: 6, unlock: 'lightning' });
// van repairs & time machine
r('engine_parts', 'engine_parts', 1, { ingot_iron: 4, bone: 6, resin: 3, scrap: 6 }, { ...VN, cat: 'van', time: 5, unlock: 'mechanics' });
r('spare_tire', 'spare_tire', 1, { resin: 6, hide: 4, tar: 4 }, { ...VN, cat: 'van', time: 4, unlock: 'mechanics' });
r('axle', 'axle', 1, { ingot_iron: 6, log: 2 }, { ...VN, cat: 'van', time: 5, unlock: 'mechanics' });
r('temporal_coil', 'temporal_coil', 1, { wire: 20, amber: 4, ingot_copper: 4 }, { ...VN, cat: 'van', time: 8, unlock: 'temporal_theory' });
r('flux_crystal', 'flux_crystal', 1, { crystal: 3, circuit: 2, obsidian: 4 }, { ...VN, cat: 'van', time: 8, unlock: 'crystal_resonance' });
r('stabilizer', 'stabilizer', 1, { ingot_iron: 6, amber_bug: 1, circuit: 4, mineral: 4 }, { ...VN, cat: 'van', time: 8, unlock: 'timeline_math' });

export const RECIPES = R;
export const recipeById = Object.fromEntries(R.map((x) => [x.id, x]));
