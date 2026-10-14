# PREHISTORIC

A co-op survival, dinosaur-taming and base-building game that runs in the browser.

You and your friends built a time machine inside a 1979 camper van out of old computers, car batteries and a microwave. It worked. Sort of. You are now 66 million years in the past, the van is smoking, and the only thing in the glovebox is a scanner and some mints (eaten).

Survive, build a camp, research the strange world with the van's computer, tame dinosaurs, repair the van and fix the time machine to get home.

## Running it

```bash
npm install
npm run dev        # solo play with hot reload at http://localhost:5173
npm run serve      # production build + game server (co-op) at http://localhost:8080
```

Co-op needs the game server (`npm run serve`, or `npm start` after `npm run build`). One player picks **New Expedition → Host co-op room** and shares the 4-letter room code; friends open the same address (use the host's LAN IP or a tunnel) and pick **Join Expedition**. Up to 8 explorers.

Useful URL flags: `?q=low|medium|high|ultra` (graphics), `?seed=word` (another island), `?day=600` (seconds per in-game day), `?server=https://host:8080` (use a remote game server), `?autostart=1`.

Dev viewers: `?dinos=1&sp=rex,alpha:gnasher,raptor` lines up dinosaurs (alphas too), `?studio=1&props=greenhouse,trap_net` lines up structure models, `?studio=1` shows the crew.

## Controls

| Action | Key |
| --- | --- |
| Move / sprint / crouch / jump | WASD · Shift · Ctrl or C · Space |
| Use, swing, fire | Left mouse |
| Aim (slingshot, darts, rifle, spear throw) | Right mouse |
| Interact / hold to repair, crank, revive | E |
| Ride or command a dino, carry a friend | Z |
| Inventory + crafting (CHRONO-PAL 2000) | Tab |
| Map · Journal | M · J |
| Build menu (with the Builder's Hammer) | B, wheel or 1-8 pieces, F material, R rotate, hold RMB remove |
| Hotbar | 1-8 or mouse wheel |
| Whistle to tamed dinos | F |
| Flashlight | L |
| Horn (in the van) | H |
| Voice chat (push to talk) | V |
| Chat · Emotes · Camera | Enter · G · P |

**Phones and tablets** get full touch controls (they switch on by themselves on a touch screen, or with `?touch=1`): drag anywhere on the left half to move with a floating stick (push it all the way to sprint), drag on the right half to look and tap the world to swing. Thumb buttons cover use, jump, interact (it shows what it will do), aim, duck and ride; the top bar opens the light, camera, build menu, journal, map, backpack and pause menu; hotbar slots are tappable; build mode adds piece, material and rotate buttons and the van adds a horn. While a screen is open a close button sits in the corner.

## What's in the game

**The Chrono-Van** is your first shelter, your lab and eventually a mobile base. Every part is physical: hinged and sliding doors, seats you can sit in, a breaker panel that routes power to the lights, computers, radio and time machine, a hand-crank dynamo to charge the flat batteries, three CRT monitors, a glovebox that is jammed (hit it), a cassette radio with procedurally composed 80s synth-pop, lockers, a cooler, a specimen shelf and a CHARGE-O-TRON for your gadgets. Repairs are done in place: swap the flat tire, hammer the bent axle, rebuild the engine under the hatch, rewire the sparking loom, fix the side monitors, the headlight and the cracked windshield. Twelve homemade upgrades bolt on with their own models (roof deck with ladder, air horns, cargo pods, a second battery bank, raptor floodlights, a solar roof, a microscope rig, a coffee maker, the Dung-o-Matic generator, a working satellite dish, scrap armour with a bull bar, monster wheels). Once repaired it drives, runs on Dung-o-Diesel and bounces over the terrain.

**CHRONO-OS**, the van's green-screen computer: mail from the crew with story and hints, the R&D tech tree, specimen analysis mini-games (microscope focusing, DNA base pairing, fossil brushing), the Dino-Dex, the VAN-CAD garage, diagnostics with the Navigation Chip's beacon, and Snake-o-saurus.

**Research** is discovery-based: point the Chrono-Scanner at plants, rocks, ore, fossils, dinosaurs, nests and dung to collect BIO / GEO / ZOO / PALEO data and fun facts, find insights (a specific scan or analysis) and spend data on 27 technologies that unlock recipes, building materials, van parts and the time machine.

**Survival and building**: hunger, thirst, stamina, energy, body temperature, wetness, injuries and status effects; chop, mine and gather; craft at stations (workbench, campfire, cooking pot, kiln, forge, smoker, research table, the van workshop); 42 placeables including beds, crates, crops, a greenhouse, rain catchers, incubators, dino traps, a small power grid with generators, solar panels, lamps and capacitors, plus furniture. Raft-style building with stilted foundations, floors, walls, windows, doorways with doors, roofs, stairs, pillars, ladders, fences and gates in stick & thatch, plank, brick and scrap-metal tiers, with structural support.

**Dinosaurs**: 14 species built from one parametric chunky model, each with an element and its own behaviour. Elements give every species a fantasy look: fire (an obsidian T. rex with molten cracks and burning tufts, a flame-plumed gallimimus), water (a spinosaurus with a glowing aqua sail, a parasaur with a glowing crest and fins), electric (lightning-striped raptors and microraptors with spark-tipped horns), grass (a compy with a leaf crest, a triceratops carrying a moss garden, a brachiosaurus with a sapling and hanging vines), crystal (a stegosaurus with crystal clusters for plates, a pachy with a crystal dome), earth (rock plates and glowing amber ore on the ankylosaurus and proto), toxic (a purple dilophosaurus with glowing spots and spikes) and wind (a pteranodon with a fluffy collar and streamers). Markings glow brighter at night, eyes are big and glossy with glowing irises, and up close each one gives off embers, sparks, drips, leaves, glints, dust, bubbles or wisps. Their behaviour: herds that stampede, territorial charges, packs that flank, predators that stalk and fear fire, thieves that steal your food and shiny tools, sleep cycles, nests with eggs, and night raids on your camp. Tame them by patient bribing, by knocking them out and feeding them while they snooze, with nets, or by hatching eggs. Tamed dinos get names and personalities, follow orders, work jobs that deliver to your crates (gathering, foraging, farming, lumberjacking, mining, fishing, guarding, treasure hunting), can be saddled and ridden (pteranodons fly), and breed.

**Caves**: a dry grotto hidden behind Thunder Falls (hop the stepping stones and walk through the water; the Navigation Chip is inside) and the Crystal Grotto, a mossy cave mouth with chrono crystals glowing in the dark.

**The volcano** in the north-east has a real summit crater with a bubbling lava lake (crust plates drifting over glowing cracks), embers, an orange glow at night and a smoke plume you can see from the crash site. Lava burns.

**Tracking, traps and alphas**: dinosaurs press footprints into the ground as they walk (three-toed theropods, round sauropod pads, broad ornithopod prints, hoofed quadrupeds). Look at a print to see whose it is, how fresh and which way it went; scan it and the trail goes on your compass. Snare traps and spring-net traps hold whatever walks in, and baiting them with a dino's favourite food lures it over. Three alphas rule their lairs with a boss bar and signature attacks: OLD GNASHER the T. rex (roar, stomp, charge) at the Rex Nesting Grounds, BIG MOMMA the Spinosaurus (tail sweep, dives under and surfaces next to you) in Mirror Lake and RAZOR the raptor alpha (pounce, calls his pack) at the Raptor Den. Beat or tame them for trophies that keep predators away from camp; with Razor gone the night raids stop. Big dinos that charge or stampede smash through walls, and everything that eats eventually leaves dung, which feeds your crops, the greenhouse and the van's Dung-o-Diesel.

**Co-op**: host-authoritative networking through a tiny relay server, proximity voice chat over WebRTC (walkie-talkies go island-wide), reviving and carrying knocked-out friends, shared van, base, research and dinos.

**Story**: ten chapters on the sticky note take you from "get the lights on" to "pull the ENGAGE lever", with achievements along the way and an ending.

## Tech notes

Three.js (WebGL2) with a custom HDR pipeline (SAO, bloom, god rays, grading), reversed-Z depth and cascaded shadows. Everything is procedural: the island and its biomes, every texture (painted at load; structure, prop and creature textures come with normal and roughness maps), every model, the animation and all sounds (WebAudio). The world generates in a worker and is cached in IndexedDB; saves go to IndexedDB with autosave.

```
src/core       engine, input, physics, camera
src/world      island generator, terrain, water, sky, flora, ground cover, resource nodes, structure models
src/entities   characters, player, van, dinosaurs
src/systems    vitals, interaction, crafting, structures, building, research, journal, taming, weapons,
               alphas (bosses), tracks, caves, volcano, story, co-op, save
src/ui         HUD, CHRONO-PAL, CHRONO-OS, menus
src/audio      procedural sound library, van engine and radio
src/net        co-op networking and voice
server         static file server + WebSocket relay
```
