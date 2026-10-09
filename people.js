// Cached overhead sprites keep large crowds cheap to draw; animation is visual only.
const skins = ['#e5b58e', '#c58b64', '#986647', '#f0c8a6', '#764d39'];
const hair = ['#342923', '#634332', '#211f20', '#c7a16b', '#493328'];
const atlases = new Map(), motion = new WeakMap();
const CELL = 72, SIZE = .9, WALK_FRAMES = 8;

function sprite(c, shirt, variant, frame) {
  const down = frame >= 9, dead = frame === 10, stride = frame < 8 ? Math.sin(frame * Math.PI / 4) : 0;
  const skin = dead ? '#a58c7e' : skins[variant];
  const ellipse = (x, y, rx, ry, color) => { c.fillStyle = color; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); };
  const limb = (x, y, tx, ty, width, color) => { c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.moveTo(x, y); c.lineTo(tx, ty); c.stroke(); };
  c.lineCap = 'round'; c.lineJoin = 'round';
  ellipse(.025, .045, down ? .28 : .25, down ? .38 : .25, '#08120d55');
  if (down) {
    limb(-.075, .05, -.14, .3, .08, '#3b4249'); limb(.075, .05, .17, .27, .08, '#3b4249');
    ellipse(-.14, .32, .06, .075, '#182327'); ellipse(.17, .29, .06, .075, '#182327');
    limb(-.13, -.13, -.29, -.015, .075, shirt); limb(.13, -.13, .28, -.22, .075, shirt);
    ellipse(-.3, -.005, .045, .045, skin); ellipse(.29, -.23, .045, .045, skin);
    c.fillStyle = shirt; c.beginPath(); c.roundRect(-.14, -.2, .28, .31, .065); c.fill();
    ellipse(0, -.29, .095, .105, skin); ellipse(0, -.31, .082, .079, hair[variant]);
    return;
  }
  // Feet and swinging arms are underneath the shoulders and crown of the head.
  for (const side of [-1, 1]) {
    const swing = stride * side, footY = .12 + swing * .13, handY = .055 - swing * .12;
    limb(side * .085, .07, side * .10, footY, .075, '#40505a');
    ellipse(side * .10, footY + .015, .057, .08, '#14242c');
    limb(side * .155, -.045, side * .215, handY, .08, shirt);
    ellipse(side * .22, handY + .015, .043, .05, skin);
  }
  c.fillStyle = shirt; c.beginPath(); c.roundRect(-.18, -.12, .36, .26, .085); c.fill();
  limb(-.11, .115, .11, .115, .025, '#15293255');
  ellipse(0, -.17, .035, .05, skin); // Small nose gives a clear facing direction.
  ellipse(0, -.065, .101, .108, skin);
  ellipse(0, -.045, .09, .092, hair[variant]);
  ellipse(-.026, -.073, .039, .044, '#ffffff15');
}
function atlas(shirt, variant) {
  const key = `${shirt}-${variant}`;
  if (!atlases.has(key)) {
    const canvas = document.createElement('canvas'); canvas.width = CELL * 11; canvas.height = CELL;
    const c = canvas.getContext('2d');
    for (let frame = 0; frame < 11; frame++) {
      c.save(); c.translate(CELL * (frame + .5), CELL / 2); c.scale(CELL / SIZE, CELL / SIZE);
      sprite(c, shirt, variant, frame); c.restore();
    }
    atlases.set(key, canvas);
  }
  return atlases.get(key);
}
export function drawPerson(ctx, a, time, shirt, reduceMotion = false) {
  let pose = motion.get(a);
  if (!pose) { pose = { x: a.x, y: a.y, time, angle: a.hue * Math.PI * 2, phase: a.hue * Math.PI * 2 }; motion.set(a, pose); }
  const speed = Math.hypot(a.vx, a.vy), dt = Math.max(0, time - pose.time);
  const down = a.state === 'fallen' || (a.state === 'injured' && a.down) || a.state === 'dead';
  const walking = !down && !a.waiting && speed > .08;
  if (!down && speed > .08 && dt > 0) {
    const angle = Math.atan2(a.vy, a.vx) + Math.PI / 2;
    const turn = Math.atan2(Math.sin(angle - pose.angle), Math.cos(angle - pose.angle));
    pose.angle += turn * (1 - Math.exp(-dt * 12));
  }
  if (walking && dt > 0) pose.phase += Math.hypot(a.x - pose.x, a.y - pose.y) * Math.PI * 2 / .7;
  pose.x = a.x; pose.y = a.y; pose.time = time;
  const frame = a.state === 'dead' ? 10 : down ? 9 : walking && !reduceMotion ? Math.floor(pose.phase / (Math.PI * 2) * WALK_FRAMES) % WALK_FRAMES : 8;
  const variant = Math.min(4, Math.floor(a.hue * 5)), size = SIZE * a.radius / .235;
  ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(pose.angle);
  ctx.drawImage(atlas(shirt, variant), frame * CELL, 0, CELL, CELL, -size / 2, -size / 2, size, size); ctx.restore();
}
