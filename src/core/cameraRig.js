// Third-person over-the-shoulder camera with collision, zoom, first-person
// mode, trauma-based shake and FOV kicks.
import * as THREE from 'three';

const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _p = new THREE.Vector3(), _d = new THREE.Vector3();

export class CameraRig {
  constructor(camera, physics) {
    this.cam = camera;
    this.phys = physics;
    this.yaw = 0; this.pitch = -0.15;
    this.dist = 3.4; this.curDist = 3.4;
    this.minDist = 1.4; this.maxDist = 9;
    this.shoulder = 0.42;
    this.firstPerson = false;
    this.trauma = 0;
    this.baseFov = 70;
    this.fovKick = 0;
    this.pivot = new THREE.Vector3();
    this.smoothPivot = new THREE.Vector3();
    this.initialized = false;
    this.override = null; // { pos, look, fov, t } for cinematics / computer screens
    this._ov = 0;
  }
  addTrauma(a) { this.trauma = Math.min(1, this.trauma + a); }
  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }
  flatForward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  look(dx, dy) {
    this.yaw -= dx;
    this.pitch = Math.max(-1.35, Math.min(1.25, this.pitch - dy));
  }
  zoom(steps) {
    if (this.firstPerson && steps > 0) { this.firstPerson = false; this.dist = this.minDist + 0.4; return; }
    this.dist = Math.max(this.minDist - 0.01, Math.min(this.maxDist, this.dist * (1 + steps * 0.12)));
    if (this.dist < this.minDist) { this.firstPerson = true; this.dist = this.minDist; }
  }

  update(dt, head, opt = {}) {
    const cam = this.cam;
    if (!this.initialized) { this.smoothPivot.copy(head); this.initialized = true; }
    // smooth the pivot a little vertically (stairs/steps) but keep horizontal crisp
    this.smoothPivot.x = head.x; this.smoothPivot.z = head.z;
    this.smoothPivot.y += (head.y - this.smoothPivot.y) * Math.min(1, dt * 14);
    this.forward(_f);
    _r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const fp = this.firstPerson || opt.firstPerson;
    const targetFov = this.baseFov + this.fovKick + (opt.sprint ? 6 : 0) + (opt.aim ? -14 : 0);
    if (fp) {
      cam.position.copy(this.smoothPivot).addScaledVector(_f.clone().setY(0).normalize(), 0.12);
      this.curDist = 0;
    } else {
      const dist = (opt.vehicleDist ?? this.dist) * (opt.aim ? 0.6 : 1);
      _p.copy(this.smoothPivot).addScaledVector(_r, this.shoulder * (opt.aim ? 1.25 : 1) * (opt.vehicleDist ? 0 : 1));
      _p.y += opt.vehicleDist ? 1.2 : 0.12;
      this.pivot.copy(_p);
      // collision
      _d.copy(_f).negate();
      let allowed = dist;
      if (this.phys) {
        const hit = this.phys.raycast(_p, _d, dist + 0.3, { filter: (s) => s.kind !== 'trigger' && !s.noCam });
        if (hit) allowed = Math.max(0.35, hit.t - 0.3);
      }
      // big creatures block the camera too (so it never ends up inside a T. rex)
      const bt = this.blockers?.(_p, _d, dist + 0.3);
      if (bt !== null && bt !== undefined) allowed = Math.min(allowed, Math.max(0.35, bt - 0.3));
      const k = allowed < this.curDist ? 25 : 4;
      this.curDist += (allowed - this.curDist) * Math.min(1, dt * k);
      this.curDist = Math.min(this.curDist, allowed + 0.0);
      cam.position.copy(_p).addScaledVector(_d, this.curDist);
      // never below terrain
      if (this.phys) {
        const g = this.phys.s.heightAt(cam.position.x, cam.position.z) + 0.25;
        if (cam.position.y < g) cam.position.y = g;
      }
    }
    _p.copy(cam.position).addScaledVector(_f, 20);
    cam.lookAt(_p);
    // cinematic override (computer screens, cutscenes)
    if (this.override) this._ov = Math.min(1, this._ov + dt * 2.5); else this._ov = Math.max(0, this._ov - dt * 3);
    if (this._ov > 0 && this.override) {
      const o = this.override;
      const e = this._ov * this._ov * (3 - 2 * this._ov);
      this._last = this._last || { pos: cam.position.clone(), q: cam.quaternion.clone() };
      const q0 = cam.quaternion.clone();
      const m = new THREE.Matrix4().lookAt(o.pos, o.look, new THREE.Vector3(0, 1, 0));
      const q1 = new THREE.Quaternion().setFromRotationMatrix(m);
      cam.position.lerp(o.pos, e);
      cam.quaternion.copy(q0.slerp(q1, e));
    }
    // shake
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    if (this.trauma > 0) {
      const s = this.trauma * this.trauma;
      const t = performance.now() / 1000;
      cam.rotation.z += (Math.sin(t * 37.3) * 0.06) * s;
      cam.position.x += Math.sin(t * 41.7) * 0.12 * s;
      cam.position.y += Math.sin(t * 33.1) * 0.12 * s;
    }
    this.fovKick *= Math.max(0, 1 - dt * 3);
    const fov = this.override?.fov ? THREE.MathUtils.lerp(targetFov, this.override.fov, this._ov) : targetFov;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 6); cam.updateProjectionMatrix(); }
  }
}
