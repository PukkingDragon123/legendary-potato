// Item database. Every item has a procedural model (gfx/itemModels.js) that is
// also rendered into its pixel-art inventory icon.
// cat: resource | food | tool | weapon | ammo | placeable | part | med | special | specimen | equip

const I = {};
const def = (id, name, cat, opt = {}) => { I[id] = { id, name, cat, stack: opt.stack ?? (cat === 'tool' || cat === 'weapon' || cat === 'equip' ? 1 : 50), ...opt }; };

// ------------------------------------------------------------------ resources
def('stick', 'Stick', 'resource', { desc: 'The humble stick. Civilisation starts here.', model: 'stick', fuel: 8 });
def('stone', 'Stone', 'resource', { desc: 'A rock. Throw it, build with it, talk to it.', model: 'stone', ammo: 'sling' });
def('fiber', 'Plant Fiber', 'resource', { desc: 'Stringy plant bits. Weave them into everything.', model: 'fiber', stack: 100, fuel: 3 });
def('log', 'Log', 'resource', { desc: 'Heavy, honest wood.', model: 'log', stack: 20, fuel: 40 });
def('plank', 'Wood Plank', 'resource', { desc: 'Flat wood. Very buildable.', model: 'plank', fuel: 15 });
def('thatch', 'Thatch Bundle', 'resource', { desc: 'Woven fronds. Keeps most of the rain out.', model: 'thatch', fuel: 6 });
def('flint', 'Flint', 'resource', { desc: 'Sharp stone. Makes better edges and nice sparks.', model: 'flint' });
def('resin', 'Sticky Resin', 'resource', { desc: 'Tree goo. Glue, sealant, fire starter.', model: 'resin', fuel: 12 });
def('clay', 'Clay', 'resource', { desc: 'Squishy river mud. Bake it into bricks.', model: 'clay' });
def('brick', 'Clay Brick', 'resource', { desc: 'Fired clay. Stone-age Lego.', model: 'brick' });
def('sand', 'Sand', 'resource', { desc: 'Coarse, rough, gets everywhere. Melts into glass.', model: 'sand' });
def('glass', 'Glass Pane', 'resource', { desc: 'See-through rock. Fancy.', model: 'glass', stack: 20 });
def('rope', 'Rope', 'resource', { desc: 'Twisted fiber. Ties things to other things.', model: 'rope' });
def('scrap', 'Scrap Metal', 'resource', { desc: 'Bits of the van. Please stop crying.', model: 'scrap' });
def('wire', 'Copper Wire', 'resource', { desc: 'Conducts electricity and enthusiasm.', model: 'wire' });
def('circuit', 'Circuit Board', 'resource', { desc: 'Salvaged electronics. Smells faintly of burnt toast.', model: 'circuit', stack: 20 });
def('battery', 'Battery Cell', 'resource', { desc: 'Stores zap.', model: 'battery', stack: 10 });
def('hide', 'Scaly Hide', 'resource', { desc: 'Tough leathery hide.', model: 'hide' });
def('feather', 'Feather', 'resource', { desc: 'Proof that dinosaurs were fluffy.', model: 'feather' });
def('bone', 'Bone', 'resource', { desc: 'Somebody used to need this.', model: 'bone' });
def('amber', 'Amber', 'resource', { desc: 'Fossil resin. Something tiny is stuck inside.', model: 'amber', stack: 20 });
def('iron', 'Meteoric Iron', 'resource', { desc: 'Space metal. Fell from the sky. Seems ominous.', model: 'ore_iron' });
def('copper', 'Copper Nugget', 'resource', { desc: 'Shiny orange metal.', model: 'ore_copper' });
def('ingot_iron', 'Iron Ingot', 'resource', { desc: 'Smelted space metal.', model: 'ingot_iron' });
def('ingot_copper', 'Copper Ingot', 'resource', { desc: 'Smelted copper.', model: 'ingot_copper' });
def('sulfur', 'Sulfur', 'resource', { desc: 'Yellow, stinky, explosive.', model: 'sulfur' });
def('obsidian', 'Obsidian', 'resource', { desc: 'Volcanic glass. Wickedly sharp.', model: 'obsidian' });
def('tar', 'Tar', 'resource', { desc: 'Sticky black goo from the tar pits.', model: 'tar', fuel: 30 });
def('dung', 'Dino Dung', 'resource', { desc: 'Fertiliser. Fuel. Regret.', model: 'dung', fuel: 20 });
def('charcoal', 'Charcoal', 'resource', { desc: 'Burnt wood. Burns hotter.', model: 'charcoal', fuel: 50 });
def('biofuel', 'Dung-o-Diesel', 'resource', { desc: 'Refined dino dung. The van loves it. Nobody else does.', model: 'jerrycan', stack: 10 });
def('crystal', 'Chrono Crystal', 'special', { desc: 'Hums at the frequency of next Tuesday.', model: 'crystal', stack: 5 });
def('salt', 'Salt', 'resource', { desc: 'Preserves food. Seasons regret.', model: 'salt' });
def('honey', 'Wild Honey', 'food', { desc: 'Prehistoric bees were furious about this.', model: 'honey', food: { hunger: 12, thirst: 2, stamina: 25 }, stack: 20 });

// seeds
def('seed_berry', 'Berry Seeds', 'resource', { desc: 'Plant in a crop plot.', model: 'seeds', crop: 'redberry' });
def('seed_fern', 'Fern Spores', 'resource', { desc: 'Grows Fiddleheads, a herbivore favourite.', model: 'seeds', crop: 'fiddlehead' });
def('seed_root', 'Root Cuttings', 'resource', { desc: 'Grows Starch Roots.', model: 'seeds', crop: 'starchroot' });
def('seed_snooze', 'Snoozeberry Seeds', 'resource', { desc: 'Grows a sleepy crop.', model: 'seeds', crop: 'snoozeberry' });

// ------------------------------------------------------------------ food
const F = (id, name, food, opt = {}) => def(id, name, 'food', { food, stack: 30, spoil: opt.spoil ?? 1800, ...opt });
F('redberry', 'Redberries', { hunger: 6, thirst: 2 }, { desc: 'Tart and juicy. Most dinos like them.', model: 'berries', color: 0xd8302a, seed: 'seed_berry', spoil: 2400 });
F('blueberry', 'Blueberries', { hunger: 6, thirst: 3 }, { desc: 'Sweet. Stains your mittens.', model: 'berries', color: 0x3b4fb8, spoil: 2400 });
F('sunberry', 'Sunberries', { hunger: 8, stamina: 15 }, { desc: 'Tingly. Gives a little zip.', model: 'berries', color: 0xf2b630, spoil: 2400 });
F('snoozeberry', 'Snoozeberries', { hunger: 2, sleepy: 25 }, { desc: 'Purple narcotic berries. Keeps knocked-out dinos snoozing. Do not eat before driving.', model: 'berries', color: 0x7a3aa8, seed: 'seed_snooze', spoil: 3600 });
F('mushroom_brown', 'Brown Mushroom', { hunger: 5 }, { desc: 'Earthy. Safe. Probably.', model: 'mushroom', color: 0x8a6440 });
F('mushroom_red', 'Funky Mushroom', { hunger: 3, trippy: 40, hp: -5 }, { desc: 'Everything becomes very interesting for a while.', model: 'mushroom', color: 0xd0402a });
F('ginkgo_nut', 'Ginkgo Nut', { hunger: 4, sick: 10 }, { desc: 'Smells like old socks raw. Roast it.', model: 'nut', cookTo: 'ginkgo_roast' });
F('ginkgo_roast', 'Roasted Ginkgo', { hunger: 14 }, { desc: 'Nutty, buttery, prehistoric popcorn.', model: 'nut', color: 0xb08040 });
F('palmfruit', 'Palm Fruit', { hunger: 10, thirst: 10 }, { desc: 'Hairy outside, refreshing inside.', model: 'palmfruit' });
F('cycadcone', 'Cycad Cone', { hunger: 4, sick: 25 }, { desc: 'Toxic raw. Roasted, it is surprisingly good.', model: 'cone', cookTo: 'cycad_roast' });
F('cycad_roast', 'Roasted Cycad Cone', { hunger: 18 }, { desc: 'Starchy and filling.', model: 'cone', color: 0xa86a30 });
F('fiddlehead', 'Fiddleheads', { hunger: 7, thirst: 3 }, { desc: 'Curly fern shoots. Herbivores go wild for them.', model: 'fiddlehead' });
F('starchroot', 'Starch Root', { hunger: 12 }, { desc: 'A knobbly, filling root.', model: 'root' });
F('egg_small', 'Small Egg', { hunger: 6, sick: 5 }, { desc: 'Cook it. Do not hatch it in your pocket.', model: 'egg', cookTo: 'egg_cooked', spoil: 1200 });
F('egg_cooked', 'Fried Egg', { hunger: 16 }, { desc: 'Sunny side up, 66 million years ago.', model: 'friedegg' });
F('meat_raw', 'Raw Meat', { hunger: 8, sick: 20 }, { desc: 'Carnivores love it. Your tummy will not.', model: 'meat', cookTo: 'meat_cooked', spoil: 900 });
F('meat_cooked', 'Cooked Meat', { hunger: 30 }, { desc: 'Smoky drumstick of mystery.', model: 'meat', color: 0x8a4a28, spoil: 2400 });
F('meat_prime', 'Prime Meat', { hunger: 12, sick: 20 }, { desc: 'Big predators can not resist this.', model: 'meat', color: 0xd04060, cookTo: 'steak', spoil: 700 });
F('steak', 'Prime Steak', { hunger: 45, hp: 10 }, { desc: 'A legendary meal.', model: 'meat', color: 0x7a3a20 });
F('fish_raw', 'Raw Fish', { hunger: 6, sick: 15 }, { desc: 'Coelacanth? Delicious? Unclear.', model: 'fish', cookTo: 'fish_cooked', spoil: 800 });
F('fish_cooked', 'Grilled Fish', { hunger: 24, thirst: -3 }, { desc: 'Flaky. Prehistoric. Delicious.', model: 'fish', color: 0xb07040 });
F('stew', 'Hearty Stew', { hunger: 45, thirst: 20, buff: 'wellfed' }, { desc: 'Warms you right up. Grants Well-Fed.', model: 'bowl', color: 0x8a5a30 });
F('kebab', 'Veggie Kebab', { hunger: 25, buff: 'wellfed' }, { desc: 'Roots and shrooms on a stick.', model: 'kebab' });
F('jerky', 'Dino Jerky', { hunger: 22 }, { desc: 'Salty, chewy, never spoils.', model: 'jerky', spoil: 0 });
F('noodles', 'Instant Noodles', { hunger: 20, thirst: -5 }, { desc: 'Emergency rations from the van. Eaten dry. Crunchy despair.', model: 'noodles', spoil: 0 });
F('energybar', 'Granola Bar', { hunger: 14, stamina: 20 }, { desc: 'Expired in the future.', model: 'bar', spoil: 0 });
F('coffee', 'Van Coffee', { thirst: 12, stamina: 40, buff: 'caffeinated', sleepy: -40 }, { desc: 'Brewed by a time machine. Tastes like Tuesday.', model: 'mug', spoil: 0 });
F('water_dirty', 'Murky Water', { thirst: 25, sick: 8 }, { desc: 'Might contain tadpoles. Boil it.', model: 'flask', color: 0x7a8a50, cookTo: 'water_clean', spoil: 0 });
F('water_clean', 'Clean Water', { thirst: 35 }, { desc: 'Boiled and safe.', model: 'flask', color: 0x5ab0e0, spoil: 0 });
F('herb', 'Healing Herb', { hp: 6 }, { desc: 'Bitter leaves with medicinal punch.', model: 'herb', spoil: 3000 });

// ------------------------------------------------------------------ tools & weapons
const T = (id, name, tool, opt = {}) => def(id, name, opt.cat ?? 'tool', { tool, durability: tool.dur ?? 150, ...opt });
T('stone_hatchet', 'Stone Hatchet', { kind: 'axe', tier: 1, dmg: 9, dur: 140, speed: 1 }, { desc: 'Chops trees. Slowly. Lovingly.', model: 'hatchet' });
T('stone_pick', 'Stone Pickaxe', { kind: 'pick', tier: 1, dmg: 8, dur: 140, speed: 1 }, { desc: 'Smashes rocks into smaller rocks.', model: 'pick' });
T('club', 'Wooden Club', { kind: 'club', tier: 1, dmg: 6, torpor: 14, dur: 160, speed: 1.1 }, { desc: 'Bonk. Knocks small dinos out cold.', model: 'club', cat: 'weapon' });
T('torch', 'Torch', { kind: 'torch', tier: 0, dmg: 4, dur: 400, speed: 1, light: 1 }, { desc: 'Light! Warmth! Predators get nervous.', model: 'torch' });
T('spear', 'Flint Spear', { kind: 'spear', tier: 1, dmg: 18, dur: 80, speed: 0.9, thrown: true }, { desc: 'Poke or throw. Get it back afterwards.', model: 'spear', cat: 'weapon' });
T('bola', 'Bola', { kind: 'bola', tier: 1, thrown: true }, { desc: 'Tangles legs. Stops runaway dinos.', model: 'bola', cat: 'weapon', stack: 10, durability: 0 });
T('slingshot', 'Slingshot', { kind: 'sling', tier: 1, dmg: 4, torpor: 10, ammo: 'stone', dur: 200 }, { desc: 'Pings stones at things. Great for knocking out fleeing critters.', model: 'slingshot', cat: 'weapon' });
T('blowgun', 'Blowgun', { kind: 'blowgun', tier: 2, dmg: 2, ammo: 'tranq_dart', dur: 200 }, { desc: 'Silent sleepy darts.', model: 'blowgun', cat: 'weapon' });
def('tranq_dart', 'Tranquilizer Dart', 'ammo', { desc: 'Snoozeberry-dipped. Adds torpor over time.', model: 'dart', stack: 30, torpor: 45 });
T('tranq_rifle', 'Tranq Rifle', { kind: 'rifle', tier: 3, dmg: 6, ammo: 'tranq_bullet', dur: 300 }, { desc: 'Built from a lawn chair and a fire extinguisher. Drops a T. rex. Eventually.', model: 'rifle', cat: 'weapon' });
def('tranq_bullet', 'Tranq Shell', 'ammo', { desc: 'Heavy-duty sleepy juice.', model: 'shell', stack: 20, torpor: 160 });
T('hammer', 'Builder\'s Hammer', { kind: 'hammer', tier: 1, dmg: 4, dur: 999 }, { desc: 'Opens the build menu. Also repairs.', model: 'hammer' });
T('scanner', 'Chrono-Scanner', { kind: 'scanner', tier: 1, dur: 9999 }, { charge: 100, desc: 'Handheld science gun from the van. Scans footprints, plants, fossils and dinos.', model: 'scanner' });
T('shovel', 'Shovel', { kind: 'shovel', tier: 1, dmg: 5, dur: 160 }, { desc: 'Dig up fossils, clay and roots.', model: 'shovel' });
T('canteen', 'Canteen', { kind: 'canteen', tier: 0, dur: 9999 }, { desc: 'Holds water. Fill it at rivers.', model: 'canteen' });
T('net', 'Catch Net', { kind: 'net', tier: 1, dur: 60 }, { desc: 'For snatching tiny thieving dinosaurs.', model: 'net' });
T('binoculars', 'Binoculars', { kind: 'binoculars', tier: 0, dur: 9999 }, { desc: 'Study wild dinos from a safe distance to learn what they eat.', model: 'binoculars' });
T('flashlight', 'Flashlight', { kind: 'flashlight', tier: 0, dur: 9999, light: 2 }, { charge: 100, desc: 'From the van glovebox. Batteries not included. Batteries included.', model: 'flashlight' });
T('walkie', 'Walkie-Talkie', { kind: 'walkie', tier: 0, dur: 9999 }, { charge: 100, desc: 'Talk to friends anywhere on the island (hold V).', model: 'walkie' });
T('sickle', 'Flint Sickle', { kind: 'sickle', tier: 1, dmg: 5, dur: 160 }, { desc: 'Harvests fiber and crops much faster.', model: 'sickle' });
T('metal_hatchet', 'Metal Hatchet', { kind: 'axe', tier: 2, dmg: 18, dur: 400, speed: 1.2 }, { desc: 'Space-iron edge. Trees file complaints.', model: 'hatchet', metal: true });
T('metal_pick', 'Metal Pickaxe', { kind: 'pick', tier: 2, dmg: 16, dur: 400, speed: 1.2 }, { desc: 'Cracks ore like eggs.', model: 'pick', metal: true });
T('whistle', 'Dino Whistle', { kind: 'whistle', tier: 0, dur: 9999 }, { desc: 'Command nearby tamed dinos (follow / stay / work).', model: 'whistle' });
T('fishing_rod', 'Fishing Rod', { kind: 'rod', tier: 1, dur: 120 }, { desc: 'Fish in rivers and the sea.', model: 'rod' });
T('lantern', 'Lantern', { kind: 'torch', tier: 1, dmg: 2, dur: 9999, light: 1.5 }, { desc: 'A jar of fireflies. They seem fine with it.', model: 'lantern' });

// equipment
def('saddle_small', 'Small Saddle', 'equip', { desc: 'Fits gallimimus, raptors and parasaurs.', model: 'saddle', saddle: 'small' });
def('saddle_big', 'Big Saddle', 'equip', { desc: 'Fits triceratops, stegosaurus, ankylosaurus.', model: 'saddle', saddle: 'big', scale: 1.4 });
def('saddle_rex', 'Rex Saddle', 'equip', { desc: 'For riding the king. Comes with seatbelt.', model: 'saddle', saddle: 'rex', scale: 1.7 });
def('saddle_flyer', 'Flyer Harness', 'equip', { desc: 'Lets you ride a pteranodon. Do not look down.', model: 'saddle', saddle: 'flyer' });
def('saddle_platform', 'Platform Saddle', 'equip', { desc: 'Turns a sauropod into a walking base.', model: 'saddle', saddle: 'platform', scale: 2.2 });

// medical
def('bandage', 'Bandage', 'med', { desc: 'Stops bleeding, heals a bit.', model: 'bandage', med: { hp: 20, cure: ['bleeding'] }, stack: 10 });
def('splint', 'Splint', 'med', { desc: 'Fixes a broken leg. Mostly.', model: 'splint', med: { hp: 5, cure: ['broken'] }, stack: 5 });
def('antidote', 'Antidote', 'med', { desc: 'Cures poison and funky-mushroom brain.', model: 'vial', med: { hp: 5, cure: ['poison', 'trippy', 'sick'] }, stack: 10 });
def('medkit', 'Med Kit', 'med', { desc: 'Big heal. Cures most things.', model: 'medkit', med: { hp: 70, cure: ['bleeding', 'poison', 'broken', 'sick'] }, stack: 5 });

// ------------------------------------------------------------------ placeables (structures carried as kits)
const P = (id, name, opt) => def(id, name, 'placeable', { place: id, stack: opt.stack ?? 5, model: opt.model ?? 'kit', ...opt });
P('campfire', 'Campfire', { desc: 'Cook food, boil water, keep warm, scare raptors.', model: 'campfire_kit', stack: 5 });
P('workbench', 'Workbench', { desc: 'Craft better tools and building parts.' });
P('storage_box', 'Storage Crate', { desc: 'Holds 24 stacks of stuff.' });
P('bedroll', 'Bedroll', { desc: 'Sleep through the night. Sets your respawn point.' });
P('bed', 'Comfy Bed', { desc: 'Sleep better, wake up happier.' });
P('cooking_pot', 'Cooking Pot', { desc: 'Stews, medicine and clean water.' });
P('kiln', 'Clay Kiln', { desc: 'Bakes bricks, glass and charcoal.' });
P('forge', 'Forge', { desc: 'Smelts metal ingots.' });
P('smoker', 'Smoker', { desc: 'Turns meat into jerky that never spoils.' });
P('crop_plot', 'Crop Plot', { desc: 'Grow berries, ferns and roots. Water + dung = fast growth.', stack: 10 });
P('water_collector', 'Rain Catcher', { desc: 'Collects clean rainwater.' });
P('torch_stand', 'Torch Stand', { desc: 'Lights up your camp.', stack: 10 });
P('feed_trough', 'Feeding Trough', { desc: 'Tamed dinos eat from here automatically.' });
P('incubator', 'Egg Incubator', { desc: 'Keeps eggs at the perfect temperature. Plays soothing music.' });
P('research_table', 'Research Table', { desc: 'Microscope, brushes and specimen jars. Study what you find.' });
P('specimen_shelf', 'Specimen Shelf', { desc: 'Show off your fossils.' });
P('spike_wall', 'Spike Wall', { desc: 'Pointy sticks. Predators hate it.', stack: 10 });
P('generator', 'Dung Generator', { desc: 'Burns biofuel for electricity. Smells exactly as expected.' });
P('solar_panel', 'Solar Panel', { desc: 'Free sunshine power. Taped together from van parts.' });
P('lamp', 'Electric Lamp', { desc: 'Needs power. Blinds raptors.', stack: 10 });
P('sprinkler', 'Sprinkler', { desc: 'Waters crops automatically. Needs power and water.' });
P('dino_wheel', 'Dino Wheel', { desc: 'A big hamster wheel. Put a dino in it. Make power.' });
P('auto_harvester', 'Auto-Harvester', { desc: 'Harvests nearby crop plots into a crate. Needs power.' });
P('radio_tower', 'Scanner Tower', { desc: 'Reveals dinos and resources nearby on the map.' });
P('lightning_rod', 'Lightning Rod', { desc: 'Catches lightning during storms. Charges capacitors. Very loud.' });
P('capacitor', 'Capacitor Bank', { desc: 'Stores a LOT of electricity.' });
P('flag', 'Team Flag', { desc: 'Claim your camp. Very important. Very official.' });
P('coffee_machine', 'Coffee Machine', { desc: 'Salvaged from the van. Powered by hope.' });
P('dino_bed', 'Dino Nest Bed', { desc: 'Tamed dinos sleep happier here.' });
P('fridge', 'Cooler Box', { desc: 'Slows food spoiling.' });
P('table', 'Table', { desc: 'For dinner, maps and arguing about maps.' });
P('chair', 'Chair', { desc: 'Sit down. You deserve it.' });
P('rug', 'Patchwork Rug', { desc: 'Ties the room together.' });
P('planter', 'Planter', { desc: 'A potted fern. Very homey.' });
P('hammock', 'Hammock', { desc: 'Sleep swinging between two posts.' });
P('skull_trophy', 'Skull Trophy', { desc: 'A big skull on a stick. Tells raptors who is boss.' });
P('greenhouse', 'Greenhouse', { desc: 'A glass hut around one big crop bed. Plants grow faster, day AND night, and never dry out.' });
P('trap_snare', 'Snare Trap', { desc: 'A bent sapling and a rope loop. Bait it with food a dino likes and wait. Holds dinos up to Gallimimus size.' });
P('trap_net', 'Spring Net Trap', { desc: 'Four posts and a heavy net. Bait it and it catches anything up to Dilophosaurus size.' });
P('trophy_gnasher', 'Gnasher\'s Tooth', { desc: 'Old Gnasher\'s biggest tooth, mounted. Predators give your camp a VERY wide berth.', stack: 1 });
P('trophy_momma', 'Big Momma\'s Scale', { desc: 'A sail scale from the Terror of Mirror Lake. Scares predators, and crops nearby grow faster (lucky!).', stack: 1 });
P('trophy_razor', 'Razor\'s Claw', { desc: 'The alpha raptor\'s sickle claw. Predators keep their distance from your camp.', stack: 1 });

// ------------------------------------------------------------------ van + time machine parts
const V = (id, name, opt) => def(id, name, 'part', { stack: 5, model: opt.model ?? 'part', ...opt });
V('crank_dynamo', 'Hand-Crank Dynamo', { desc: 'Turn it to charge the van battery. Great arm workout.', model: 'dynamo' });
V('wiring_harness', 'Wiring Harness', { desc: 'A bundle of carefully spliced wires.', model: 'wire' });
V('crt_part', 'CRT Repair Kit', { desc: 'Tubes, tape and a prayer for the old monitors.', model: 'circuit' });
V('engine_parts', 'Engine Parts', { desc: 'Pistons carved from bone. It might work.', model: 'gear' });
V('spare_tire', 'Patched Tire', { desc: 'Rubber from tree resin and hide. Round-ish.', model: 'tire' });
V('axle', 'Reinforced Axle', { desc: 'Iron and stubbornness.', model: 'ingot_iron' });
V('temporal_coil', 'Temporal Coil', { desc: 'Copper wound in amber-insulated spirals. Bends time slightly.', model: 'coil' });
V('flux_crystal', 'Flux Crystal Matrix', { desc: 'A chrono crystal cut and wired. Glows when you are not looking.', model: 'crystal' });
V('nav_chip', 'Navigation Chip', { desc: 'The time machine\'s brain. Flew out during the crash.', model: 'circuit', color: 0x40c0a0 });
V('power_core', 'Charged Power Core', { desc: '1.21 jiggawhatsits, bottled.', model: 'battery', color: 0x60e0ff });
V('stabilizer', 'Timeline Stabilizer', { desc: 'Prevents arriving as a smoothie. Important.', model: 'gear', color: 0xd0a040 });

// ------------------------------------------------------------------ specimens (research)
const S = (id, name, opt) => def(id, name, 'specimen', { stack: 10, model: opt.model ?? 'jar', ...opt });
S('plant_sample', 'Plant Sample', { desc: 'Analyse it at the van computer.', model: 'jar', color: 0x60a040 });
S('fossil', 'Fossil Fragment', { desc: 'Brush it clean at the research table.', model: 'fossil' });
S('amber_bug', 'Amber with Mosquito', { desc: 'Life finds a way. Analyse the DNA.', model: 'amber' });
S('eggshell', 'Eggshell Fragment', { desc: 'Tells you about nesting dinos.', model: 'eggshell' });
S('coprolite', 'Coprolite', { desc: 'Fossilised dung. Science is glamorous.', model: 'stone', color: 0x7a6040 });
S('dna', 'DNA Swab', { desc: 'A cotton bud with dino on it. Sequence it at the van.', model: 'swab' });
S('mineral', 'Mineral Sample', { desc: 'Interesting rock. Geology points!', model: 'crystal', color: 0x8080c0 });

// eggs (incubate to hatch)
for (const sp of ['compy', 'raptor', 'ptera', 'parasaur', 'trike', 'stego', 'ankylo', 'gallimimus', 'proto', 'dilo', 'rex', 'pachy', 'brachio', 'spino', 'microraptor']) {
  def('egg_' + sp, 'Egg (' + sp + ')', 'special', { desc: 'Keep it warm. Something wiggles inside.', model: 'dinoegg', egg: sp, stack: 1 });
}

export const ITEMS = I;
export const item = (id) => I[id];
export function itemName(id) { return I[id]?.name ?? id; }
export function isFood(id) { return !!I[id]?.food; }
export function fuelValue(id) { return I[id]?.fuel ?? 0; }
