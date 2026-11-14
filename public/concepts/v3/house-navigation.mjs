// Metres on the house floor. No physics engine or per-frame URL state.
export const EYE_HEIGHT = 1.65;
export const WALK_RADIUS = .22;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
export function canStand(point, obstacles, bounds, radius = WALK_RADIUS) {
  const [x, z] = point;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (x < bounds.minX + radius || x > bounds.maxX - radius || z < bounds.minZ + radius || z > bounds.maxZ - radius) return false;
  return !obstacles.some(o => x > o.minX - radius && x < o.maxX + radius && z > o.minZ - radius && z < o.maxZ + radius);
}
export function segmentClear(a, b, obstacles, bounds) {
  const count = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .07));
  for (let i = 0; i <= count; i++) if (!canStand([a[0] + (b[0] - a[0]) * i / count, a[1] + (b[1] - a[1]) * i / count], obstacles, bounds)) return false;
  return true;
}
export function stepOnFloor(pose, forward, side, obstacles, bounds) {
  const dx = pose.target[0] - pose.position[0], dz = pose.target[2] - pose.position[2], length = Math.hypot(dx, dz) || 1;
  const shift = [(dx * forward - dz * side) / length, (dz * forward + dx * side) / length];
  let point = [pose.position[0], pose.position[2]];
  // Small substeps prevent tunnelling; independent axes allow sliding along a wall.
  const count = Math.max(1, Math.ceil(Math.hypot(...shift) / .07));
  for (let i = 0; i < count; i++) {
    const x = [point[0] + shift[0] / count, point[1]];
    if (canStand(x, obstacles, bounds)) point = x;
    const z = [point[0], point[1] + shift[1] / count];
    if (canStand(z, obstacles, bounds)) point = z;
  }
  const delta = [point[0] - pose.position[0], EYE_HEIGHT - pose.position[1], point[1] - pose.position[2]];
  return {position: [point[0], EYE_HEIGHT, point[1]], target: pose.target.map((v, i) => v + delta[i])};
}
export function lookOnFloor(pose, dx, dy) {
  const v = pose.target.map((n, i) => n - pose.position[i]), length = Math.hypot(...v) || 4;
  const yaw = Math.atan2(v[0], v[2]) + dx, pitch = clamp(Math.asin(v[1] / length) + dy, -.65, .65);
  return {position: [...pose.position], target: [pose.position[0] + 4 * Math.sin(yaw) * Math.cos(pitch), pose.position[1] + 4 * Math.sin(pitch), pose.position[2] + 4 * Math.cos(yaw) * Math.cos(pitch)]};
}
export function blendLook(from, to, t) {
  const a=Math.atan2(from[0],from[2]),b=Math.atan2(to[0],to[2]),yaw=a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
  const pitchA=Math.atan2(from[1],Math.hypot(from[0],from[2])),pitchB=Math.atan2(to[1],Math.hypot(to[0],to[2])),pitch=pitchA+(pitchB-pitchA)*t;
  return [4*Math.sin(yaw)*Math.cos(pitch),4*Math.sin(pitch),4*Math.cos(yaw)*Math.cos(pitch)];
}
export function floorPath(start, end, obstacles, bounds) {
  if (!canStand(start, obstacles, bounds) || !canStand(end, obstacles, bounds)) throw Error('Le trajet doit commencer et finir dans un passage libre.');
  if (segmentClear(start, end, obstacles, bounds)) return [[...start], [...end]];
  const cell = .16, width = Math.ceil((bounds.maxX - bounds.minX) / cell) + 1, height = Math.ceil((bounds.maxZ - bounds.minZ) / cell) + 1;
  const point = n => [bounds.minX + n % width * cell, bounds.minZ + Math.floor(n / width) * cell];
  function nearest(p) {
    const x = Math.round((p[0] - bounds.minX) / cell), z = Math.round((p[1] - bounds.minZ) / cell);
    let best = null, distance = Infinity;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const a = x + dx, b = z + dz; if (a < 0 || a >= width || b < 0 || b >= height) continue;
      const n = a + b * width, q = point(n), d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d < distance && segmentClear(p, q, obstacles, bounds)) {best = n; distance = d;}
    }
    if (best === null) throw Error('Ce point ne rejoint pas le sol praticable.');
    return best;
  }
  const origin = nearest(start), goal = nearest(end), open = [origin], score = new Map([[origin, 0]]), previous = new Map(), closed = new Set();
  const heuristic = n => {const p = point(n), q = point(goal); return Math.hypot(p[0] - q[0], p[1] - q[1]);};
  let found = false;
  while (open.length && closed.size < 12000) {
    let at = 0; for (let i = 1; i < open.length; i++) if (score.get(open[i]) + heuristic(open[i]) < score.get(open[at]) + heuristic(open[at])) at = i;
    const current = open.splice(at, 1)[0]; if (current === goal) {found = true; break;}
    if (closed.has(current)) continue; closed.add(current);
    const x = current % width, z = Math.floor(current / width), p = point(current);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const a = x + dx, b = z + dz; if (a < 0 || a >= width || b < 0 || b >= height) continue;
      const n = a + b * width; if (closed.has(n)) continue;
      const q = point(n); if (!segmentClear(p, q, obstacles, bounds)) continue;
      const candidate = score.get(current) + Math.hypot(dx, dz) * cell;
      if (candidate < (score.get(n) ?? Infinity)) {score.set(n, candidate); previous.set(n, current); if (!open.includes(n)) open.push(n);}
    }
  }
  if (!found) throw Error('Aucun passage ouvert ne rejoint ce poste.');
  const path = [end]; let n = goal; while (n !== origin) {path.push(point(n)); n = previous.get(n);}
  path.push(start); path.reverse();
  const simplified = [path[0]]; let i = 0;
  while (i < path.length - 1) {let j = path.length - 1; while (j > i + 1 && !segmentClear(path[i], path[j], obstacles, bounds)) j--; simplified.push(path[j]); i = j;}
  return simplified;
}
export function pointAlong(path, t) {
  const distances = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1])), total = distances.reduce((a, b) => a + b, 0);
  let remaining = clamp(t, 0, 1) * total;
  for (let i = 0; i < distances.length; i++) {
    if (remaining <= distances[i] || i === distances.length - 1) {const s = distances[i] ? remaining / distances[i] : 1; return path[i].map((n, j) => n + (path[i + 1][j] - n) * s);}
    remaining -= distances[i];
  }
  return [...path[0]];
}
