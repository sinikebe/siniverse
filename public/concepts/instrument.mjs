const ACCENTS = { finapp: [42, 82, 255], garapp: [215, 110, 81], branchlab: [143, 107, 205] };
const PORCELAIN = [227, 225, 215];
const FACES = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4]];
const mix = (a, b, t) => a + (b - a) * t;
const angleMix = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

function sections(state) {
  return Array.from({ length: 20 }, (_, index) => {
    let x, y, z, angle, size, highlight;
    if (state.intent === 'garapp') {
      angle = index / 20 * Math.PI * 2 - Math.PI / 2 + state.history * Math.PI / 2;
      x = Math.cos(angle) * 1.67; y = Math.sin(angle) * 1.67; z = Math.cos(angle * 2) * .08;
      size = [.31, .68, .43]; highlight = index === 0;
    } else if (state.intent === 'branchlab') {
      const spread = state.spread ? 1 : 0;
      x = (index - 9.5) * .285;
      if (spread) x = index < 5 ? -3.15 + index * .23 : index > 14 ? 2.23 + (index - 15) * .23 : -1.34 + (index - 5) * .3;
      y = Math.sin(index / 19 * Math.PI) * .27;
      z = Math.sin(index / 19 * Math.PI) * .2;
      angle = Math.cos(index / 19 * Math.PI) * -.12;
      size = [.23, spread ? index < 5 ? 1.1 : index > 14 ? 1.35 : .48 : .92, .4];
      highlight = index === 4 || index === 15;
    } else {
      const branch = index < 10 ? -1 : 1, t = (index % 10) / 9;
      x = -2.65 + t * 5.3;
      y = branch * (.11 + Math.pow(t, 1.7) * (.43 + state.horizon / 16));
      z = Math.sin(t * Math.PI) * branch * .12;
      angle = branch * t * .4;
      size = [.25, .87, .36]; highlight = index % 5 === 0;
    }
    return { x, y, z, angle, size, color: highlight ? ACCENTS[state.intent] : PORCELAIN };
  });
}

function rotate(point, yaw, pitch) {
  const x = point[0] * Math.cos(yaw) + point[2] * Math.sin(yaw);
  const depth = -point[0] * Math.sin(yaw) + point[2] * Math.cos(yaw);
  return [x, point[1] * Math.cos(pitch) - depth * Math.sin(pitch),
    point[1] * Math.sin(pitch) + depth * Math.cos(pitch)];
}
function normal(a, b, c) {
  const u = b.map((v, i) => v - a[i]), v = c.map((value, i) => value - a[i]);
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const length = Math.hypot(...n) || 1;
  return n.map(value => value / length);
}
function vertices(section, yaw, pitch) {
  return [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
    [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]].map(vertex => {
    const x = vertex[0] * section.size[0] / 2, y = vertex[1] * section.size[1] / 2;
    return rotate([section.x + x * Math.cos(section.angle) - y * Math.sin(section.angle),
      section.y + x * Math.sin(section.angle) + y * Math.cos(section.angle),
      section.z + vertex[2] * section.size[2] / 2], yaw, pitch);
  });
}

export function createInstrument(canvas, initial) {
  let context;
  try { context = canvas.getContext('2d'); } catch { return null; }
  if (!context) return null;
  canvas.hidden = false;
  let state = { intent: 'finapp', horizon: 10, history: 0, spread: false, view: false, ...initial };
  let reducedMotion = Boolean(initial.reducedMotion), current = sections(state);
  let yaw = -.61, width = 0, height = 0, dpr = 1, animation = 0;
  const camera = () => -.61 + (!reducedMotion && state.view ? .4 : 0);
  const project = point => {
    const scale = Math.min(width / 8.15, height / 5.9);
    const perspective = 9 / (9 - point[2]);
    return [width / 2 + point[0] * scale * perspective, height * .47 - point[1] * scale * perspective];
  };
  function draw() {
    if (!width || !height) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    const shadow = context.createRadialGradient(width * .52, height * .76, 0, width * .52, height * .76, width * .35);
    shadow.addColorStop(0, 'rgba(32,39,37,.18)'); shadow.addColorStop(1, 'rgba(32,39,37,0)');
    context.save(); context.translate(0, height * .76); context.scale(1, .16); context.translate(0, -height * .76);
    context.fillStyle = shadow; context.beginPath(); context.arc(width * .52, height * .76, width * .35, 0, Math.PI * 2); context.fill(); context.restore();
    context.strokeStyle = 'rgba(32,39,37,.18)'; context.lineWidth = .7;
    context.beginPath(); context.moveTo(width * .19, height * .87); context.lineTo(width * .84, height * .87);
    for (let tick = 0; tick < 13; tick++) {
      const x = width * (.19 + tick / 12 * .65);
      context.moveTo(x, height * .87 - (tick % 3 ? 3 : 6)); context.lineTo(x, height * .87 + 3);
    }
    context.stroke();
    const pitch = state.intent === 'garapp' ? .3 : .5;
    if (state.intent === 'branchlab' && state.spread) {
      const a = project(rotate([-3, -.08, -.35], yaw, pitch)), b = project(rotate([3, -.08, -.35], yaw, pitch));
      context.beginPath(); context.moveTo(...a); context.bezierCurveTo(a[0] + width * .2, a[1] + 28, b[0] - width * .2, b[1] + 28, ...b);
      context.strokeStyle = 'rgba(32,39,37,.65)'; context.lineWidth = 3; context.stroke();
    }
    const faces = [];
    for (const section of current) {
      const points = vertices(section, yaw, pitch);
      for (const face of FACES) {
        const polygon = face.map(index => points[index]);
        const n = normal(...polygon.slice(0, 3));
        if (n[2] <= .015) continue;
        const light = Math.max(0, n[0] * -.35 + n[1] * .7 + n[2] * .62);
        const tone = .58 + light * .4;
        const color = section.color.map(value => Math.round(value * tone + (light > .7 ? 9 : 0)));
        faces.push({ polygon, depth: polygon.reduce((sum, p) => sum + p[2], 0) / 4, color });
      }
    }
    faces.sort((a, b) => a.depth - b.depth);
    for (const face of faces) {
      context.beginPath();
      face.polygon.forEach((point, index) => {
        const p = project(point);
        if (index) context.lineTo(...p); else context.moveTo(...p);
      });
      context.closePath();
      context.fillStyle = 'rgb(' + face.color.join(',') + ')'; context.fill();
      context.strokeStyle = 'rgba(32,39,37,.38)'; context.lineWidth = .7; context.stroke();
    }
  }
  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    width = rect.width; height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    draw();
  }
  function update(next) {
    const previous = state;
    state = { ...state, ...next };
    if (['intent', 'horizon', 'history', 'spread', 'view'].every(key => previous[key] === state[key])) return;
    cancelAnimationFrame(animation);
    const target = sections(state), start = current, startYaw = yaw, endYaw = camera();
    if (reducedMotion) { current = target; yaw = endYaw; draw(); return; }
    const started = performance.now();
    const frame = now => {
      const progress = Math.min(1, (now - started) / 680), t = 1 - Math.pow(1 - progress, 3);
      current = start.map((section, index) => {
        const next = target[index];
        return { x: mix(section.x, next.x, t), y: mix(section.y, next.y, t), z: mix(section.z, next.z, t),
          angle: angleMix(section.angle, next.angle, t), size: section.size.map((v, i) => mix(v, next.size[i], t)),
          color: section.color.map((v, i) => mix(v, next.color[i], t)) };
      });
      yaw = mix(startYaw, endYaw, t); draw();
      if (progress < 1) animation = requestAnimationFrame(frame);
      else { current = target; animation = 0; }
    };
    animation = requestAnimationFrame(frame);
  }
  resize();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas.parentElement);
  else window.addEventListener('resize', resize, { passive: true });
  return { update, setReducedMotion(value) {
    reducedMotion = value; cancelAnimationFrame(animation);
    current = sections(state); yaw = camera(); draw();
  } };
}
