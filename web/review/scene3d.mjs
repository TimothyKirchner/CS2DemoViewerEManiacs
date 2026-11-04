// three.js scene for the review: radar ground plane, player bodies with view rays, spotting lines,
// shot tracers, grenade paths and utility volumes. World (x, y, z) maps to three (x, z, -y).
import * as THREE from "../vendor/three.module.min.js";

const W = (x, y, z) => new THREE.Vector3(x, z, -y);
const TEAM = {2: 0xedb65d, 3: 0x70b9e9};
const viewDir = (yaw, pitch) => { const y = yaw * Math.PI / 180, p = pitch * Math.PI / 180; return W(Math.cos(p) * Math.cos(y), Math.cos(p) * Math.sin(y), -Math.sin(p)); };

function label(text, color) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 64;
  const g = c.getContext("2d"); g.font = "600 26px Segoe UI, Arial"; g.textAlign = "center";
  g.fillStyle = "#0b0f13cc"; const w = Math.min(250, g.measureText(text).width + 22); g.fillRect(128 - w / 2, 10, w, 40);
  g.fillStyle = color; g.fillText(text, 128, 40);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({map: new THREE.CanvasTexture(c), depthTest: false, transparent: true, sizeAttenuation: false}));
  s.scale.set(0.12, 0.03, 1); s.renderOrder = 10; return s;
}
function dynamicLines(color, max, opts = {}) {
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(max * 6), 3));
  const m = opts.dashed ? new THREE.LineDashedMaterial({color, dashSize: 24, gapSize: 16, transparent: true, opacity: opts.opacity ?? 1}) : new THREE.LineBasicMaterial({color, transparent: true, opacity: opts.opacity ?? 1, vertexColors: Boolean(opts.vertexColors)});
  if (opts.vertexColors) g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(max * 6), 3));
  const l = new THREE.LineSegments(g, m); l.frustumCulled = false; l.userData.max = max;
  l.userData.set = segs => {
    const a = g.attributes.position.array, col = g.attributes.color?.array; let n = 0;
    for (const s of segs.slice(0, max)) { a.set([s[0].x, s[0].y, s[0].z, s[1].x, s[1].y, s[1].z], n * 6); if (col) { const c = new THREE.Color(s[2] ?? color); col.set([c.r, c.g, c.b, c.r, c.g, c.b], n * 6); } n++; }
    g.setDrawRange(0, n * 2); g.attributes.position.needsUpdate = true; if (col) g.attributes.color.needsUpdate = true;
    if (opts.dashed) l.computeLineDistances();
  };
  return l;
}

export class ReviewScene {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({antialias: true});
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    container.prepend(this.renderer.domElement);
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x0d1216);
    this.scene.fog = new THREE.Fog(0x0d1216, 6000, 16000);
    this.camera = new THREE.PerspectiveCamera(60, 1, 4, 30000);
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x30363c, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(2000, 4000, 1000); this.scene.add(sun);
    this.world = new THREE.Group(); this.scene.add(this.world);
    this.players = new Map(); this.grenades = []; this.effects = new Map();
    this.views = dynamicLines(0xffffff, 32, {vertexColors: true, opacity: 0.85}); this.world.add(this.views);
    this.sees = dynamicLines(0x7fcf9a, 32, {dashed: true, opacity: 0.9}); this.world.add(this.sees);
    this.spots = dynamicLines(0xf07a6a, 32, {dashed: true, opacity: 0.9}); this.world.add(this.spots);
    this.tracers = dynamicLines(0xfff2b0, 96, {vertexColors: true}); this.world.add(this.tracers);
    this.drops = dynamicLines(0x55616c, 16, {opacity: 0.5}); this.world.add(this.drops);
    this.deathGroup = new THREE.Group(); this.world.add(this.deathGroup);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(26, 2.5, 8, 32), new THREE.MeshBasicMaterial({color: 0xffffff}));
    this.ring.rotation.x = Math.PI / 2; this.world.add(this.ring);
    this.mode = "orbit"; this.orbit = {theta: -0.6, phi: 0.95, radius: 1400, target: new THREE.Vector3()}; this.follow = true;
    this.bindControls();
    new ResizeObserver(() => this.resize()).observe(container); this.resize();
  }
  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight; if (!w || !h) return;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  bindControls() {
    const el = this.renderer.domElement; let drag = null;
    el.addEventListener("contextmenu", e => e.preventDefault());
    el.addEventListener("pointerdown", e => { drag = {x: e.clientX, y: e.clientY, button: e.button}; el.setPointerCapture(e.pointerId); });
    el.addEventListener("pointerup", () => drag = null);
    el.addEventListener("pointermove", e => {
      if (!drag || this.mode !== "orbit" && this.mode !== "top") return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      if (drag.button === 2 || e.shiftKey || this.mode === "top") {
        const s = this.orbit.radius / 900, right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0), fwd = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), right);
        this.orbit.target.addScaledVector(right, -dx * s).addScaledVector(fwd, dy * s); this.follow = false;
      } else { this.orbit.theta -= dx * 0.006; this.orbit.phi = Math.max(0.12, Math.min(1.5, this.orbit.phi - dy * 0.006)); }
    });
    el.addEventListener("wheel", e => { e.preventDefault(); this.orbit.radius = Math.max(250, Math.min(9000, this.orbit.radius * Math.exp(e.deltaY * 0.001))); }, {passive: false});
    el.addEventListener("dblclick", () => { this.follow = true; });
  }
  setMap(def, images) {
    for (const m of this.planes ?? []) { this.world.remove(m); m.geometry.dispose(); m.material.map?.dispose(); m.material.dispose(); }
    this.planes = []; this.def = def;
    if (!def) return;
    const size = 1024 * def.scale, loader = new THREE.TextureLoader();
    const plane = (url, opacity) => {
      const tex = loader.load(url); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({map: tex, transparent: opacity < 1, opacity, depthWrite: opacity >= 1}));
      m.rotation.x = -Math.PI / 2; m.position.copy(W(def.x + size / 2, def.y - size / 2, 0)); this.world.add(m); this.planes.push(m); return m;
    };
    this.upper = plane(images.upper, 1);
    this.lower = images.lower ? plane(images.lower, 0.55) : null;
  }
  // Ground heights follow the round's recorded player heights so the radar sits under their feet.
  setGround(frames) {
    const zs = frames.flatMap(f => f.players.map(p => p.z)).filter(Number.isFinite).sort((a, b) => a - b);
    if (!zs.length || !this.upper) return;
    const split = this.def?.splitZ, upperZ = zs.filter(z => !Number.isFinite(split) || z > split), lowerZ = zs.filter(z => Number.isFinite(split) && z <= split);
    this.upper.position.y = (upperZ[Math.floor(upperZ.length * 0.05)] ?? zs[0]) - 2;
    if (this.lower) { this.lower.visible = lowerZ.length > 0; this.lower.position.y = (lowerZ[Math.floor(lowerZ.length * 0.05)] ?? this.upper.position.y - 300) - 2; }
    this.groundY = this.upper.position.y;
  }
  setRound(round, players) {
    for (const g of this.grenades) { this.world.remove(g.line); g.line.geometry.dispose(); }
    this.grenades = (round.grenades ?? []).map(p => {
      const pts = p.points.map(q => W(q[1], q[2], q[3])), geo = new THREE.BufferGeometry().setFromPoints(pts);
      const color = {smoke: 0xb6c8d1, fire: 0xfb7949, flash: 0xf3e9a0, he: 0x9ee07a, decoy: 0x999999}[p.type] ?? 0xffffff;
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({color, transparent: true, opacity: 0.8})); line.frustumCulled = false;
      this.world.add(line); return {line, ticks: p.points.map(q => q[0]), end: p.end};
    });
    for (const e of this.effects.values()) { this.world.remove(e); e.geometry.dispose(); }
    this.effects.clear();
    for (const p of this.players.values()) p.group.visible = false;
    this.names = new Map(players.map(p => [p.id, p.name]));
  }
  player(id, team) {
    let p = this.players.get(id);
    if (!p || p.team !== team) {
      if (p) this.world.remove(p.group);
      const group = new THREE.Group(), mat = new THREE.MeshStandardMaterial({color: TEAM[team] ?? 0xcccccc, roughness: 0.6});
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(14, 34, 4, 10), mat); body.position.y = 31;
      const head = new THREE.Mesh(new THREE.SphereGeometry(8.5, 14, 10), mat);
      const tag = label(this.names?.get(id) ?? id, team === 2 ? "#edb65d" : "#70b9e9");
      group.add(body, head, tag); this.world.add(group);
      p = {group, body, head, tag, team, mat}; this.players.set(id, p);
    }
    return p;
  }
  // state: {players, focus, related:Set, effects, tick, shots, deaths, allViews}
  update(s) {
    const views = [], sees = [], spots = [], drops = [], tracers = [];
    const byId = new Map(s.players.map(p => [p.id, p]));
    for (const [id, p] of this.players) if (!byId.has(id)) p.group.visible = false;
    for (const q of s.players) {
      const p = this.player(q.id, q.team), alive = q.alive !== false && q.hp > 0;
      p.group.visible = alive; if (!alive) continue;
      const eye = (q.duck ? 46 : 64);
      p.group.position.copy(W(q.x, q.y, q.z));
      p.body.scale.y = q.duck ? 0.72 : 1; p.body.position.y = q.duck ? 23 : 31; p.head.position.y = eye - 2;
      p.tag.position.y = eye + 34;
      const focus = q.id === s.focus, related = s.related?.has(q.id);
      p.mat.emissive?.setHex(focus ? 0x553f15 : related ? 0x3a1714 : 0x000000);
      p.group.scale.setScalar(focus ? 1.12 : 1);
      const from = W(q.x, q.y, q.z + eye);
      if (focus || related || s.allViews) views.push([from, from.clone().addScaledVector(viewDir(q.yaw, q.pitch ?? 0), focus ? 2600 : 700), focus ? 0xffffff : related ? 0xf07a6a : 0x7c8a96]);
      if (Number.isFinite(this.groundY) && q.z - (this.groundY) > 60) drops.push([W(q.x, q.y, q.z), new THREE.Vector3(from.x, this.groundY, from.z)]);
      // Spotting: green = enemies the focused player sees, red = enemies that see the focused player.
      const fp = byId.get(s.focus);
      if (fp && q.seenBy?.includes(s.focus) && fp.alive !== false) sees.push([W(fp.x, fp.y, fp.z + 60), from]);
      if (q.id === s.focus && q.seenBy) for (const v of q.seenBy) { const e = byId.get(v); if (e && e.alive !== false) spots.push([W(e.x, e.y, e.z + 60), from]); }
    }
    const f = byId.get(s.focus);
    if (f && f.alive !== false) { this.ring.visible = true; this.ring.position.copy(W(f.x, f.y, f.z + 2)); } else this.ring.visible = false;
    for (const shot of s.shots ?? []) {
      const from = W(shot.x, shot.y, shot.z + 62), age = shot.age;
      tracers.push([from, from.clone().addScaledVector(viewDir(shot.yaw, shot.pitch ?? 0), 1800), new THREE.Color(shot.id === s.focus ? 0xffffff : 0xfff2b0).multiplyScalar(Math.max(0.15, 1 - age))]);
    }
    this.views.userData.set(views); this.sees.userData.set(sees); this.spots.userData.set(spots); this.tracers.userData.set(tracers); this.drops.userData.set(drops);
    for (const g of this.grenades) { let n = 0; while (n < g.ticks.length && g.ticks[n] <= s.tick) n++; g.line.visible = n > 1 && s.tick <= g.end + 64 * 25; g.line.geometry.setDrawRange(0, n); }
    const live = new Set();
    for (const e of s.effects ?? []) {
      const k = e.type + e.start + "|" + e.id; live.add(k);
      if (!this.effects.has(k)) {
        const geo = e.type === "smoke" ? new THREE.SphereGeometry(140, 20, 14) : e.type === "fire" ? new THREE.CylinderGeometry(120, 120, 6, 24) : new THREE.SphereGeometry(e.type === "flash" ? 40 : 60, 12, 8);
        const color = {smoke: 0xb6c8d1, fire: 0xfb7949, flash: 0xffffdd, he: 0xffaa55, decoy: 0x888888}[e.type];
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({color, transparent: true, opacity: e.type === "smoke" ? 0.55 : 0.5, depthWrite: false}));
        m.position.copy(W(e.x, e.y, e.z + (e.type === "smoke" ? 60 : 3))); this.world.add(m); this.effects.set(k, m);
      }
    }
    for (const [k, m] of this.effects) if (!live.has(k)) { this.world.remove(m); m.geometry.dispose(); this.effects.delete(k); }
    if (this.deathKey !== s.deaths.length) {
      this.deathKey = s.deaths.length; this.deathGroup.clear();
      const mat = new THREE.MeshBasicMaterial({color: 0xf07a6a});
      for (const d of s.deaths) { const x = new THREE.Group(); for (const r of [Math.PI / 4, -Math.PI / 4]) { const b = new THREE.Mesh(new THREE.BoxGeometry(40, 3, 6), mat); b.rotation.y = r; x.add(b); } x.position.copy(W(d.x, d.y, d.z + 3)); this.deathGroup.add(x); }
    }
    this.place(f);
  }
  place(f) {
    const cam = this.camera, o = this.orbit;
    if (f && this.follow && f.alive !== false) o.target.lerp(W(f.x, f.y, f.z + 40), 0.2);
    if ((this.mode === "pov" || this.mode === "chase") && f && f.alive !== false) {
      const eye = W(f.x, f.y, f.z + (f.duck ? 46 : 64)), dir = viewDir(f.yaw, f.pitch ?? 0);
      for (const [id, p] of this.players) p.tag.visible = this.mode !== "pov" && id !== f.id;
      const fp = this.players.get(f.id); if (fp) fp.group.visible = this.mode !== "pov";
      cam.fov = this.mode === "pov" ? 74 : 65; cam.updateProjectionMatrix();
      if (this.mode === "pov") { cam.position.copy(eye); cam.lookAt(eye.clone().add(dir)); }
      else { const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize(); cam.position.copy(eye).addScaledVector(flat, -170).add(new THREE.Vector3(0, 55, 0)); cam.lookAt(eye.clone().addScaledVector(dir, 400)); }
      return;
    }
    for (const p of this.players.values()) p.tag.visible = true;
    cam.fov = 60; cam.updateProjectionMatrix();
    const phi = this.mode === "top" ? 0.001 : o.phi, r = this.mode === "top" ? Math.max(o.radius, 2200) : o.radius;
    cam.position.set(o.target.x + r * Math.sin(phi) * Math.sin(o.theta), o.target.y + r * Math.cos(phi), o.target.z + r * Math.sin(phi) * Math.cos(o.theta));
    cam.up.set(0, 1, 0); if (this.mode === "top") cam.up.set(0, 0, -1);
    cam.lookAt(o.target);
  }
  render() { this.renderer.render(this.scene, this.camera); }
}
