/// <reference types="vite/client" />
import Matter from 'matter-js';
import { Camera } from './camera';
import { Hud } from './hud';
import { Input } from './input';
import { Renderer } from './render';
import { PAD, STEP, World } from './world';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const input = new Input(canvas);
const camera = new Camera();
const renderer = new Renderer();
let dpr = 1;
let debug = false;

const hud = new Hud({
  possess: (a) => world.possess(a),
  despawn: (a) => world.removeActor(a),
  spawnDef: (def) => {
    const p = world.spawnPoint();
    world.spawnActor(def, p.x, p.y);
  },
  spawnProp: (type) => {
    const p = world.spawnPoint();
    world.spawnProp(type, p.x, p.y);
  },
  reset: () => reset(),
  core: () => world.toggleCore(),
  debug: () => { debug = !debug; },
  rowdy: () => toggleRowdy(),
});

let world = new World((m) => hud.toast(m));

function reset() {
  world.destroy();
  world = new World((m) => hud.toast(m));
  if (world.possessed) camera.snap(world.possessed.pos);
  hud.toast('Scene reset.');
}

function toggleRowdy() {
  world.rowdy = !world.rowdy;
  hud.toast(world.rowdy ? 'Rowdy NPCs: everyone else now uses their powers at random.' : 'NPCs are calm again.');
}

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  camera.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();
if (world.possessed) camera.snap(world.possessed.pos);

let last = performance.now();
let acc = 0;
let fps = 60;

function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;

  // Global keys
  if (input.hit('Tab')) hud.toggleMenu();
  if (input.hit('Escape')) hud.toggleMenu(false);
  if (input.hit('KeyR')) reset();
  if (input.hit('KeyG')) world.toggleCore();
  if (input.hit('Backquote')) debug = !debug;
  if (input.hit('KeyT')) toggleRowdy();
  if (input.hit('KeyH')) hud.toggleHelp();
  if (input.hit('KeyQ')) world.cycle(-1);
  if (input.hit('KeyE')) world.cycle(1);

  const mouseWorld = camera.toWorld(input.mouse.x, input.mouse.y);
  const me = world.possessed;
  if (me) {
    me.aim = mouseWorld;
    me.ctrl.move = (input.down('KeyD', 'ArrowRight') ? 1 : 0) - (input.down('KeyA', 'ArrowLeft') ? 1 : 0);
    me.ctrl.jump = input.down('Space', 'KeyW', 'ArrowUp');
    me.ctrl.down = input.down('KeyS', 'ArrowDown');
    if (input.hit('Space', 'KeyW', 'ArrowUp')) me.jumpBuf = 0.12;
    if (input.hit('KeyJ') || input.mouse.lHit) world.trigger(me, 0);
    if (input.hit('KeyK') || input.mouse.rHit) world.trigger(me, 1);
  }

  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 4) {
    world.step(STEP);
    acc -= STEP;
    steps++;
  }
  if (steps === 4) acc = 0;

  const target = me && !me.dead ? me.pos : { x: PAD.x, y: PAD.y - 40 };
  const vel = me && !me.dead ? me.vel : { x: 0, y: 0 };
  camera.follow(dt, target, vel, input.mouse, world.tilt, world.fx.shake);

  renderer.draw(ctx, world, camera, camera.toWorld(input.mouse.x, input.mouse.y), dpr, debug, fps);
  hud.update(world, debug, dt);
  input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Dev-only handle for poking at the sandbox from the browser console.
if (import.meta.env.DEV) {
  (window as unknown as { cc: unknown }).cc = { get world() { return world; }, camera, Matter };
}
