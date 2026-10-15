// Dev-only creature studio: species lineup for close-up screenshots.
// ?dinos=1&sp=mutton,raptor&cam=x,y,z&look=x,y,z&rot=-1.2&state=idle|sleep|ko|dead
//   &speed=0&walk=R (circle radius)&act=roar&at=0.5&expr=happy&puff=1&ai=flee
//   &mood=angry&alert=0&fly=1&baby=1&lod=1&t=0.42&frames=N&stats=1
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { Sky } from './world/sky.js';
import { patchMaterial } from './gfx/shaderlib.js';
import { SPECIES } from './entities/dinoSpecies.js';
import { buildDino, DinoRig } from './entities/dinoModel.js';
import { alphaSpecies } from './systems/bosses.js';
import { Character, PRESETS } from './entities/character.js';

export function runDinoStudio(qs) {
  const engine = new Engine(document.getElementById('app'), qs.get('q') || 'high');
  const sky = new Sky(engine);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 48), patchMaterial(new THREE.MeshStandardMaterial({ color: 0x6a8a44, roughness: 0.95 }), {}));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  engine.scene.add(ground);
  const ids = (qs.get('sp') || 'mutton').split(',');
  const gap = parseFloat(qs.get('gap') || '1.2');
  const list = [];
  const spOf = (id) => (id.startsWith('alpha:') ? alphaSpecies(id.slice(6)) : SPECIES[id]);
  const widths = ids.map((id) => Math.max(1.0, spOf(id).size * 0.9));
  const total = widths.reduce((a, b) => a + b, 0) + gap * (ids.length - 1);
  let x = -total / 2;
  const stats = [];
  for (const [i, id] of ids.entries()) {
    const sp = spOf(id);
    const t0 = performance.now();
    const rig = buildDino(sp, { baby: qs.get('baby') === '1' });
    stats.push(`${id}: ${Math.round(performance.now() - t0)}ms ${rig.D ? `${rig.D.stats.nv}v ${rig.D.stats.nt}t lod1 ${rig.D.stats.nv1}v` : 'toy'}`);
    x += widths[i] / 2;
    const home = new THREE.Vector3(x, 0, 0);
    rig.root.position.copy(home);
    rig.root.rotation.y = parseFloat(qs.get('rot') || '-1.2');
    if (qs.get('baby') === '1') rig.root.scale.setScalar(0.5);
    x += widths[i] / 2 + gap;
    engine.scene.add(rig.root);
    const dbg = qs.get('dbg') || '';
    if (dbg.includes('noshadow')) rig.root.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
    if (dbg.includes('normals')) for (const m of rig.lods ?? []) m.material = new THREE.MeshNormalMaterial();
    if (dbg.includes('basic')) for (const m of rig.lods ?? []) m.material = new THREE.MeshBasicMaterial({ vertexColors: true });
    if (dbg.includes('lambert')) for (const m of rig.lods ?? []) m.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    if (dbg.includes('noao') && rig.D) for (const g of rig.D.geo) { g.attributes.aAO.array.fill(1); g.attributes.aAO.needsUpdate = true; }
    if (qs.get('bones') && rig.body) { const hlp = new THREE.SkeletonHelper(rig.body); hlp.material.depthTest = false; hlp.material.linewidth = 2; engine.scene.add(hlp); for (const m of rig.lods) { m.material.transparent = true; m.material.opacity = 0.35; m.material.depthWrite = false; } }
    list.push({ rig, anim: new DinoRig(rig, sp), sp, home, a: i * 1.3 });
  }
  if (qs.get('human')) { const c = new Character(PRESETS[0]); c.root.position.set(-total / 2 - 1.2, 0, 1); c.root.rotation.y = -0.6; engine.scene.add(c.root); list.push({ char: c }); }
  if (qs.get('stats')) { const d = document.createElement('pre'); d.style.cssText = 'position:fixed;left:8px;top:8px;color:#fff;font:12px monospace;background:#0008;padding:6px;z-index:9'; d.textContent = stats.join('\n'); document.body.appendChild(d); }
  console.log(stats.join('\n'));
  const cam = engine.camera;
  const cp = (qs.get('cam') || `0,${Math.max(1.2, total * 0.2)},${Math.max(3, total * 0.9)}`).split(',').map(Number);
  const lk = (qs.get('look') || '0,0.6,0').split(',').map(Number);
  cam.position.set(...cp); cam.lookAt(...lk);
  // ?auto=1 frames the first creature from the front-left (?az=angle, ?zoom=k)
  if (qs.get('auto') && list[0]?.rig) {
    const R = list[0].rig, H = R.height, Ln = R.len;
    const az = parseFloat(qs.get('az') || '0.6'), zoom = parseFloat(qs.get('zoom') || '1');
    const r = Math.max(H, Ln) * 1.25 / zoom;
    const yaw = list[0].rig.root.rotation.y;
    // creatures face -Z in their own space
    const fx = -Math.sin(yaw + az), fz = -Math.cos(yaw + az);
    const c = list[0].home;
    const fy = parseFloat(qs.get('fy') || '0.55');
    cam.position.set(c.x + fx * r, H * (fy + 0.25), c.z + fz * r);
    cam.lookAt(c.x - Math.sin(yaw) * Ln * 0.12, H * fy, c.z - Math.cos(yaw) * Ln * 0.12);
  }
  const tod = parseFloat(qs.get('t') || '0.42');
  const weather = { cover: 0.2, storm: 0, fog: 0, rain: 0 };
  const maxFrames = parseInt(qs.get('frames') || '0', 10);
  const state = qs.get('state') || 'idle', act = qs.get('act'), speedQ = qs.get('speed'), walkR = parseFloat(qs.get('walk') || '0');
  const ground0 = () => 0;
  let frame = 0;
  window.studio = { list, engine };
  function loop() {
    frame++;
    if (maxFrames && frame > maxFrames) { window.__done = true; return; }
    const dt = 1 / 30;
    sky.update(tod, weather, cam.position, dt);
    for (const d of list) {
      if (d.char) { d.char.update(dt, {}); continue; }
      const speed = speedQ !== null ? parseFloat(speedQ) * d.sp.stats.speed : walkR ? d.sp.stats.speed : 0;
      let yaw = d.rig.root.rotation.y;
      if (walkR) {
        // walk a circle around the home spot (counter-clockwise from above)
        d.a += (speed / walkR) * dt;
        d.rig.root.position.set(d.home.x + Math.cos(d.a) * walkR, 0, d.home.z + Math.sin(d.a) * walkR);
        yaw = Math.atan2(-(-Math.sin(d.a)), -(Math.cos(d.a)));
        d.rig.root.rotation.y = yaw;
      }
      const at = act && qs.get('at') === 'loop' ? (frame * dt / 1.6) % 1 : parseFloat(qs.get('at') || '0.5');
      if ((qs.get('dbg') || '').includes('rest')) continue;
      const per = (k, def) => { const v = qs.get(k + 's'); if (v) { const a = v.split(','); return a[list.indexOf(d)] ?? a[a.length - 1]; } return qs.get(k) ?? def; };
      d.anim.update(dt, {
        speed, yaw, state: per('state', state), ai: per('ai') || undefined,
        action: per('act', act) ? { name: per('act', act), t: at } : null,
        look: { yaw: parseFloat(qs.get('lyaw') || '0'), pitch: parseFloat(qs.get('lpitch') || '0') },
        alert: parseFloat(qs.get('alert') || '0'), mood: qs.get('mood') || undefined, fly: qs.get('fly') === '1',
        pos: d.rig.root.position, scale: 1, ground: ground0, puff: parseFloat(per('puff', '0')), expr: per('expr') || undefined,
        lod: parseInt(qs.get('lod') || '0', 10), pitch: 0,
      });
    }
    engine.render(dt);
    requestAnimationFrame(loop);
  }
  loop();
}
