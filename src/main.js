// PREHISTORIC — boot: loading screen -> world -> title over the live scene -> play.
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import '@fontsource/silkscreen/400.css';
import '@fontsource/vt323/400.css';
import './ui/ui.css';
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { loadWorld } from './world/worldLoader.js';
import { Game } from './game.js';
import { Loading, Title } from './ui/menus.js';
import { UI } from './ui/ui.js';
import { Audio } from './audio/audio.js';
import { Vitals } from './systems/vitals.js';
import { Interaction } from './systems/interaction.js';
import { Crafting } from './systems/crafting.js';
import { Drops } from './systems/drops.js';
import { Hotkeys } from './systems/hotkeys.js';
import { renderIcons, setStructureModelBuilder } from './gfx/itemModels.js';
import { buildStructure } from './world/structureModels.js';
import { ITEMS } from './data/items.js';
import { PRESETS } from './entities/character.js';
import { installExtras } from './systems/registry.js';
import { isTouchDevice } from './ui/touch.js';

const qs = new URLSearchParams(location.search);

const DEFAULT_SETTINGS = { quality: 'high', sens: 1, fov: 70, volume: 0.8, music: 0.5, voice: 1, invertY: false, pushToTalk: true };
function loadJSON(k, def) { try { return { ...def, ...(JSON.parse(localStorage.getItem(k) || 'null') || {}) }; } catch { return { ...def }; } }
function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }

async function boot() {
  if (qs.get('harness')) { (await import('./devharness.js')).runHarness(qs); return; }
  if (qs.get('studio')) { (await import('./devstudio.js')).runStudio(qs); return; }
  if (qs.get('dinos')) { (await import('./devdinos.js')).runDinoStudio(qs); return; }
  if (qs.get('env')) { (await import('./devenv.js')).runEnvStudio(qs); return; }
  const touch = isTouchDevice();
  const settings = loadJSON('prehistoric-settings', { ...DEFAULT_SETTINGS, quality: touch ? 'low' : DEFAULT_SETTINGS.quality });
  if (qs.get('q')) settings.quality = qs.get('q');
  const profile = loadJSON('prehistoric-profile', { name: 'Explorer', outfit: { ...PRESETS[Math.floor(Math.random() * PRESETS.length)] } });
  const loading = new Loading();
  const app = document.getElementById('app');
  const engine = new Engine(app, settings.quality);
  const input = new Input(engine.renderer.domElement);
  const seed = qs.get('seed') || 'prehistoric';
  const world = await loadWorld(seed, (p, m) => loading.set(p * 0.45, m));
  const game = new Game({ engine, world, input, outfit: profile.outfit, name: profile.name, dayLength: +(qs.get('day') || 1200) });
  game.settings = settings;
  game.profile = profile;
  window.game = game;
  await game.init((p, m) => loading.set(0.45 + p * 0.5, m));
  // core systems (order matters: ui needs inventory, interaction before drops)
  game.vitals = game.addSystem(new Vitals(game));
  game.interaction = game.addSystem(new Interaction(game));
  game.addSystem(new Crafting(game));
  game.addSystem(new Drops(game));
  loading.set(0.96, 'Painting tiny pixel icons');
  await new Promise((r) => setTimeout(r, 0));
  setStructureModelBuilder(buildStructure);
  game.icons = renderIcons(engine.renderer, ITEMS, 40);
  new UI(game);
  game.addSystem(game.ui);
  game.addSystem(new Audio(game));
  game.addSystem(new Hotkeys(game));
  await installExtras(game);
  game.applySettings = () => {
    const s = game.settings;
    if (engine.qualityName !== s.quality) engine.setQuality(s.quality);
    input.sensitivity = 0.0022 * s.sens;
    input.invertY = s.invertY;
    game.rig.baseFov = s.fov;
    game.audio?.setVolumes({ master: s.volume, music: s.music, voice: s.voice });
    saveJSON('prehistoric-settings', s);
  };
  game.applySettings();
  loading.set(1, 'Ready');
  // ---- main loop
  let last = performance.now();
  const seen = new Set();
  const loop = () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    // one broken frame must never freeze the game: log each new error once
    try { game.update(dt); } catch (e) {
      const k = String(e?.stack ?? e).slice(0, 300);
      if (!seen.has(k)) { seen.add(k); console.error('frame error', e); }
      input.endFrame();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  loading.done();

  const start = async (opt) => {
    title?.close();
    game.titleMode = false;
    game.rig.override = null;
    await game.start?.(opt);
    if (!qs.get('nolock') && !touch) input.lock();
  };
  // ---- title over the live world
  let title = null;
  if (qs.get('autostart')) { start({ mode: qs.get('mode') || 'new', host: qs.get('host') === '1', code: (qs.get('code') || '').toUpperCase() }); }
  else {
    game.titleMode = true;
    title = new Title(document.getElementById('ui'), {
      profile, hasSave: !!game.hasSave?.(), serverAvailable: !!game.serverAvailable,
      click: () => game.audio?.play('ui_click'),
      onStart: (o) => { saveJSON('prehistoric-profile', profile); start(o); },
      onSaveProfile: (p) => { saveJSON('prehistoric-profile', p); game.local.setOutfit(p.outfit); },
      onPreview: (o) => game.previewOutfit?.(o),
    });
  }
}

boot().catch((e) => {
  console.error(e);
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#0d0f0c;color:#f1e9d2;font:18px monospace;padding:40px;z-index:99;white-space:pre-wrap';
  d.textContent = 'Something went wrong while booting the time machine:\n\n' + (e.stack || e.message || e);
  document.body.appendChild(d);
});
void THREE;
