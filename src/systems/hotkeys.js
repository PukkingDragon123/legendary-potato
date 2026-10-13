// Global hotkeys: menus, camera mode, chat, emotes.
export class Hotkeys {
  constructor(game) {
    this.name = 'hotkeys';
    this.game = game;
    this.emotes = ['wave', 'dance', 'point', 'cheer', 'scream'];
    this.emoteIdx = 0;
  }
  update() {
    const g = this.game, inp = g.input, ui = g.ui;
    if (!ui) return;
    if (ui.chatInput) return;
    if (inp.pressed('pause')) {
      if (g.building?.active) g.building.exit();
      else if (ui.crtOpen) g.computer?.close();
      else if (ui.container) ui.closeContainer();
      else if (ui.pda) ui.closePDA();
      else if (ui.menuOpen) ui.closePause();
      else ui.openPause();
      return;
    }
    if (ui.menuOpen || ui.crtOpen) return;
    if (inp.pressed('inventory')) { if (ui.container) ui.closeContainer(); else ui.togglePDA('bag'); }
    if (inp.pressed('map')) ui.togglePDA('map');
    if (inp.pressed('journal')) ui.togglePDA('log');
    if (ui.pda || ui.container) return;
    if (inp.pressed('chat')) ui.openChatInput((text) => g.sendChat?.(text));
    if (inp.pressed('camera')) { g.rig.firstPerson = !g.rig.firstPerson; }
    if (inp.pressed('emote')) {
      const p = g.local;
      const e = this.emotes[this.emoteIdx++ % this.emotes.length];
      p.emote = e;
      clearTimeout(this._et);
      this._et = setTimeout(() => { if (p.emote === e) p.emote = null; }, e === 'dance' ? 4000 : 1800);
      if (e === 'scream') g.audio?.play('hurt', { pos: p.pos, rate: 1.6 });
      g.net?.send?.('emote', { e });
    }
    // moving cancels emotes
    if (g.local.emote && Math.hypot(g.local.vel.x, g.local.vel.z) > 1.5) g.local.emote = null;
  }
}
