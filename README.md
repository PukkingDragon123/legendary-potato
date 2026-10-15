# PREHISTORIC

A co-op survival, creature-taming and base-building game that runs in the browser.

You and your friends built a time machine inside a 1979 camper van out of old computers, car batteries and a microwave. It worked. Sort of. You are now somewhere very, very far in the past, on an island full of creatures no textbook ever mentioned, the van is smoking, and the only thing in the glovebox is a scanner and some mints (eaten).

Survive, build a camp, research the strange world with the van's computer, tame its creatures, repair the van and fix the time machine to get home.

## Running it

```bash
npm install
npm run dev        # solo play with hot reload at http://localhost:5173
npm run serve      # production build + game server (co-op) at http://localhost:8080
```

Co-op needs the game server (`npm run serve`, or `npm start` after `npm run build`). One player picks **New Expedition → Host co-op room** and shares the 4-letter room code; friends open the same address (use the host's LAN IP or a tunnel) and pick **Join Expedition**. Up to 8 explorers.

Useful URL flags: `?q=low|medium|high|ultra` (graphics), `?seed=word` (another island), `?day=600` (seconds per in-game day), `?server=https://host:8080` (use a remote game server), `?autostart=1`.

Dev viewers: `?dinos=1&sp=mutton,raptor,alpha:gnasher` lines up creatures (alphas too; `&auto=1` frames the first one, `&expr=happy`, `&puff=1`, `&speed=1`, `&walk=2`, `&state=ko`, `&act=roar`, `&bones=1`, `&stats=1`), `?studio=1&props=greenhouse,trap_net` lines up structure models, `?studio=1` shows the crew.

## Controls

| Action | Key |
| --- | --- |
| Move / sprint / crouch / jump | WASD · Shift · Ctrl or C · Space |
| Use, swing, fire | Left mouse |
| Aim (slingshot, darts, rifle, spear throw) | Right mouse |
| Interact / hold to repair, crank, revive | E |
| Ride or command a creature, carry a friend | Z |
| Inventory + crafting (CHRONO-PAL 2000) | Tab |
| Map · Journal | M · J |
| Build menu (with the Builder's Hammer) | B, wheel or 1-8 pieces, F material, R rotate, hold RMB remove |
| Hotbar | 1-8 or mouse wheel |
| Whistle to tamed creatures | F |
| Flashlight | L |
| Horn (in the van) | H |
| Voice chat (push to talk) | V |
| Chat · Emotes · Camera | Enter · G · P |

**Phones and tablets** get full touch controls (they switch on by themselves on a touch screen, or with `?touch=1`): drag anywhere on the left half to move with a floating stick (push it all the way to sprint), drag on the right half to look and tap the world to swing. Thumb buttons cover use, jump, interact (it shows what it will do), aim, duck and ride; the top bar opens the light, camera, build menu, journal, map, backpack and pause menu; hotbar slots are tappable; build mode adds piece, material and rotate buttons and the van adds a horn. While a screen is open a close button sits in the corner.

## What's in the game

**The Chrono-Van** is your first shelter, your lab and eventually a mobile base. Every part is physical: hinged and sliding doors, seats you can sit in, a breaker panel that routes power to the lights, computers, radio and time machine, a hand-crank dynamo to charge the flat batteries, three CRT monitors, a glovebox that is jammed (hit it), a cassette radio with procedurally composed 80s synth-pop, lockers, a cooler, a specimen shelf and a CHARGE-O-TRON for your gadgets. Repairs are done in place: swap the flat tire, hammer the bent axle, rebuild the engine under the hatch, rewire the sparking loom, fix the side monitors, the headlight and the cracked windshield. Twelve homemade upgrades bolt on with their own models (roof deck with ladder, air horns, cargo pods, a second battery bank, raptor floodlights, a solar roof, a microscope rig, a coffee maker, the Dung-o-Matic generator, a working satellite dish, scrap armour with a bull bar, monster wheels). Once repaired it drives, runs on Dung-o-Diesel and bounces over the terrain.

**CHRONO-OS**, the van's green-screen computer: mail from the crew with story and hints, the R&D tech tree, specimen analysis mini-games (microscope focusing, DNA base pairing, fossil brushing), the Critter-Dex, the VAN-CAD garage, diagnostics with the Navigation Chip's beacon, and Snake-o-saurus.

**Research** is discovery-based: point the Chrono-Scanner at plants, rocks, ore, fossils, creatures, nests and dung to collect BIO / GEO / ZOO / PALEO data and fun facts, find insights (a specific scan or analysis) and spend data on 27 technologies that unlock recipes, building materials, van parts and the time machine.

**Survival and building**: hunger, thirst, stamina, energy, body temperature, wetness, injuries and status effects; chop, mine and gather; craft at stations (workbench, campfire, cooking pot, kiln, forge, smoker, research table, the van workshop); 42 placeables including beds, crates, crops, a greenhouse, rain catchers, incubators, creature traps, a small power grid with generators, solar panels, lamps and capacitors, plus furniture. Raft-style building with stilted foundations, floors, walls, windows, doorways with doors, roofs, stairs, pillars, ladders, fences and gates in stick & thatch, plank, brick and scrap-metal tiers, with structural support.

**Creatures**: 16 original species, none of them real dinosaurs, each sculpted like clay over its own armature: signed-distance shapes (ellipsoids, round cones, flat triangles, lumps) blend into one smooth skin, meshed with surface nets on a worker in two levels of detail, skinned to the bones, painted with countershading, patterns and glowing elemental markings, and shaded with fur sheen, wrapped light, curl bumps and baked ambient occlusion. MUTTON CHOPS (a cloud of a sheep with a cocoa face, floppy ears, goat eyes and magnificent woolly sideburns), SNATCHET (a leaf-eared hopper with buck teeth), ZAPPIT (a gliding static critter with glowing cheeks), GRUMBLET (a grumpy pig-armadillo with a stone face shield), EMBERSTRUT (a long-legged fire bird with a candle-flame crest), HORNPIPE (a river beast with a trumpet horn), KNOCKLE (a kangaroo with a crystal geode for a forehead), VOLTFANG (a thunder-wolf with a crackling mane), SPITFRILL (a frog-faced salamander whose frill flares like a dish), GUSTAIL (a great white sky-owl with ribbon streamers), THORNBACK (a walking hill with bramble horns and flowers on its back), PRISMBACK (a crystal pangolin), CLUBBERT (a boulder turtle with a tail club), RIPTIDE (an otter-shark the size of a bus), TREENECK (a gentle giant with a forest on its back) and MAGMAW (an upright lava brute with obsidian horns). Every creature has shader-drawn eyes with lids, gaze and pupils (round, slit or goat-bar) and cartoon expressions (happy arcs, sleepy lines, KO swirls, dead crosses, heart pupils, squeezed eyes), a jaw that drops into a carved mouth with a tongue and teeth, blushing cheeks and a hit flash. A procedural rig walks, trots, gallops, pronks, hops, paddles and flies them with two-bone leg IK planted on the terrain, a level foot, body bob, roll, slope and turn lean, a steadied head that looks at things, springy ears, tails, cheeks and fleeces, folding wings and a flaring frill; they idle, glance around, flick ears, pull faces, eat, roar, howl, headbutt, sleep curled up and fall over when knocked out. Their behaviour: herds that stay together and run together, territorial charges, packs that flank, predators that go hunting when hungry, creep up on prey, sprint, kill and feed on the carcass, prey that watches for hunters and flees as a herd (Mutton Chops puffs up into a ball that takes half damage and bounces away), thieves that steal food and shiny tools, sleep cycles, nests with eggs and night raids. Carcasses can be butchered (Mutton Chops gives Raw Mutton for a legendary Mutton Chop, and wool for rope and bedrolls). Tame them by patient bribing, by knocking them out and feeding them while they snooze, with nets, or by hatching eggs. Tamed creatures get names and personalities, follow orders, work jobs that deliver to your crates (gathering, foraging, farming, lumberjacking, mining, fishing, guarding, treasure hunting, growing wool), can be saddled and ridden (Gustails fly), and breed. The Pocket Prof's CRITTERDEX logs every species you meet with a phosphor portrait, its habits, favourite food, taming method, job, drops and habitat.

**Caves**: a dry grotto hidden behind Thunder Falls (hop the stepping stones and walk through the water; the Navigation Chip is inside) and the Crystal Grotto, a mossy cave mouth with chrono crystals glowing in the dark.

**The volcano** in the north-east has a real summit crater with a bubbling lava lake (crust plates drifting over glowing cracks), embers, an orange glow at night and a smoke plume you can see from the crash site. Lava burns.

**Tracking, traps and alphas**: creatures press footprints into the ground as they walk (three-toed theropods, round sauropod pads, broad ornithopod prints, hoofed quadrupeds). Look at a print to see whose it is, how fresh and which way it went; scan it and the trail goes on your compass. Snare traps and spring-net traps hold whatever walks in, and baiting them with a creature's favourite food lures it over. Three alphas rule their lairs with a boss bar and signature attacks: OLD GNASHER the Magmaw (roar, stomp, charge) in the Magmaw Wastes, BIG MOMMA the Riptide (tail sweep, dives under and surfaces next to you) in Mirror Lake and RAZOR the Voltfang alpha (pounce, calls his pack) at the Voltfang Den. Beat or tame them for trophies that keep predators away from camp; with Razor gone the night raids stop. Big creatures that charge or stampede smash through walls, and everything that eats eventually leaves dung, which feeds your crops, the greenhouse and the van's Dung-o-Diesel.

**Co-op**: host-authoritative networking through a tiny relay server, proximity voice chat over WebRTC (walkie-talkies go island-wide), reviving and carrying knocked-out friends, shared van, base, research and creatures.

**Story**: ten chapters on the sticky note take you from "get the lights on" to "pull the ENGAGE lever", with achievements along the way and an ending.

## Tech notes

Three.js (WebGL2) with a custom HDR pipeline (SAO, bloom, god rays, grading), reversed-Z depth and cascaded shadows. Everything is procedural: the island and its biomes, every texture (painted at load; structure, prop and creature textures come with normal and roughness maps), every model, the animation and all sounds (WebAudio). The world generates in a worker and is cached in IndexedDB; saves go to IndexedDB with autosave.

```
src/core       engine, input, physics, camera
src/world      island generator, terrain, water, sky, flora, ground cover, resource nodes, structure models
src/entities   characters, player, van, creatures (sculpt, designs, rig)
src/systems    vitals, interaction, crafting, structures, building, research, journal, taming, weapons,
               alphas (bosses), tracks, caves, volcano, story, co-op, save
src/ui         HUD, CHRONO-PAL, CHRONO-OS, menus
src/audio      procedural sound library, van engine and radio
src/net        co-op networking and voice
server         static file server + WebSocket relay
```
