import { WORK_AREAS } from './construction-site.mjs';
// Signed distance from an axis-aligned patch, in scene metres (x min/max, z min/max).
const edgeDistance = (x, z, [left, right, rear, front]) =>
  Math.max(left - x, x - right, rear - z, z - front);
const street = [-88, 88, 8.4, 15.6];
const extension = [5.5, 13.5, -6.5, 3.5];
const neighboringLots = [
  [-38, -20, -4, 8.6], [17, 30, -11, 8.6], [-21, -9, 15.4, 32],
];
const forecourt = [-11.2, 6.9, -5.1, 8.2];
const paths = [-3.3, 5.4, 6, 9.3];
const clearPatches = [street, forecourt, paths, ...neighboringLots];
// The excavator pad and adjoining road shoulder share a finished grade.
const [yard] = WORK_AREAS;
const earthworks = [yard.x - yard.width / 2, yard.x + yard.width / 2, yard.z - yard.depth / 2, yard.z + yard.depth / 2];
const levelPatches = [street, paths, extension, earthworks, ...neighboringLots];
const smooth01 = (a) => {
  const t = Math.max(0, Math.min(1, a));
  return t * t * (3 - 2 * t);
};

// A mineral garden, authored for this house. Planting stays outside the walking bounds.
export function buildLandscape(T, scene, surfaces, {software=false}={}) {
  const root = new T.Group(); root.name = 'house-landscape'; scene.add(root);
  const resources = [], hash = n => { const v = Math.sin(n * 127.1) * 43758.5453; return v - Math.floor(v); };
  const naturalHeight = (x, z) => {
    const away = Math.max(0, Math.min(1, (Math.max(Math.abs(x) / 12, Math.abs(z - 1) / 9) - 1) / 2));
    return -.25 + away * (.5 + Math.sin(x * .12 + z * .06) * .8 + Math.sin(z * .19 - x * .08) * .55);
  };
  const inWorkArea = (x, z, padding = 0) => WORK_AREAS.some(area => Math.abs(x - area.x) < area.width / 2 + padding && Math.abs(z - area.z) < area.depth / 2 + padding);
  const needsClearance = (x, z, padding) => inWorkArea(x, z, padding)
    || clearPatches.some(patch => edgeDistance(x, z, patch) < padding);
  const heightAt = (x, z) => {
    let value = naturalHeight(x, z);
    for (const area of WORK_AREAS) {
      const edge = Math.max(Math.abs(x - area.x) / (area.width / 2), Math.abs(z - area.z) / (area.depth / 2));
      const blend = Math.max(0, Math.min(1, (1.15 - edge) / .3));
      const smooth = blend * blend * (3 - 2 * blend);
      value += (naturalHeight(area.x, area.z) - value) * smooth;
    }
    // The coarse mobile mesh also needs a full grid cell of level ground under the kerbs.
    let edge = Infinity;
    for (const patch of levelPatches) edge = Math.min(edge, edgeDistance(x, z, patch));
    return -.25 + (value + .25) * smooth01((edge - 3) / 4);
  };
  const segments=software?64:160;
  const ground = new T.PlaneGeometry(180, 180, segments, segments); ground.rotateX(-Math.PI / 2);
  const p = ground.attributes.position;
  const groundTint = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, heightAt(x, z));
    const lawn = 1 - smooth01((edgeDistance(x, z, extension) + .2) / 1.5);
    const field = lawn * (.86 + .14 * Math.sin(x * .9 + z * .6));
    groundTint.set([1 - field * .44, 1 - field * .23, 1 - field * .64], i * 3);
  }
  ground.setAttribute('color', new T.BufferAttribute(groundTint, 3));
  ground.computeVertexNormals();
  const uv = ground.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * .6, p.getZ(i) * .6);
  const terrainMaterial = surfaces.get('#DBDDD1', 'gravel');
  terrainMaterial.vertexColors = true;
  const terrain = new T.Mesh(ground, terrainMaterial); terrain.name = 'house-garden-terrain';
  terrain.receiveShadow = true; terrain.userData.pickThrough = true; root.add(terrain);

  const rockGeometry = new T.IcosahedronGeometry(1, 3), rp = rockGeometry.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i);
    const r = 1 + Math.sin(x * 11 + z * 8) * .09 + Math.sin(y * 17 - z * 5) * .06;
    rp.setXYZ(i, x * r, y * r, z * r);
  }
  rockGeometry.computeVertexNormals();
  // Weld the duplicated icosphere corners when averaging normals; no faceted pebbles.
  const averaged = new Map(), normals = rockGeometry.attributes.normal;
  const keyAt = i => [rp.getX(i),rp.getY(i),rp.getZ(i)].map(v=>Math.round(v*100000)).join(':');
  for(let i=0;i<rp.count;i++){const key=keyAt(i),n=averaged.get(key)||new T.Vector3();n.add(new T.Vector3().fromBufferAttribute(normals,i));averaged.set(key,n);}
  for(let i=0;i<rp.count;i++){const n=averaged.get(keyAt(i)).normalize();normals.setXYZ(i,n.x,n.y,n.z);}
  const rocks = new T.InstancedMesh(rockGeometry, surfaces.get('#CBCFC8', 'rock'), 64);
  rocks.name = 'house-garden-boulders'; rocks.castShadow = rocks.receiveShadow = true; rocks.userData.pickThrough = true;
  const matrix = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0);
  const rockCapacity = rocks.count;
  rocks.count = 0;
  for (let i = 0; i < rockCapacity * 4 && rocks.count < rockCapacity; i++) {
    const angle = hash(i + 12) * Math.PI * 2, distance = 10 + hash(i + 82) * 34;
    const x = Math.cos(angle) * distance, z = Math.sin(angle) * distance - 1;
    const size = .3 + Math.pow(hash(i + 120), 2) * 1.6;
    if (needsClearance(x, z, size * 1.6) || edgeDistance(x, z, extension) < size * 1.6) continue;
    matrix.compose(new T.Vector3(x, heightAt(x, z) + size * .19, z), q.setFromAxisAngle(up, angle), new T.Vector3(size * 1.35, size * .55, size));
    rocks.setMatrixAt(rocks.count++, matrix);
  }
  root.add(rocks);

  // Each clump is a few curved blades. Instancing keeps a whole garden to two draws.
  const blades = [], bladeNormals = [];
  for (let i = 0; i < 9; i++) {
    const angle = hash(i + 3) * Math.PI * 2, h = .30 + hash(i + 21) * .5, bend = .15 + hash(i + 44) * .18;
    const rx = Math.cos(angle), rz = Math.sin(angle), width = .022;
    const left = [rz * width, 0, -rx * width], right = [-rz * width, 0, rx * width];
    const ml = [rx * bend * .28 + rz * width * .6, h * .58, rz * bend * .28 - rx * width * .6];
    const mr = [rx * bend * .28 - rz * width * .6, h * .58, rz * bend * .28 + rx * width * .6];
    const tip = [rx * bend, h, rz * bend];
    blades.push(...left, ...right, ...ml, ...right, ...mr, ...ml, ...ml, ...mr, ...tip);
    for (let j = 0; j < 9; j++) bladeNormals.push(rx * .3, .9, rz * .3);
  }
  const grassGeometry = new T.BufferGeometry(); grassGeometry.setAttribute('position', new T.Float32BufferAttribute(blades, 3));
  grassGeometry.setAttribute('normal', new T.Float32BufferAttribute(bladeNormals, 3));
  const grassMaterial = new T.MeshStandardMaterial({ color: '#A19B7E', roughness: .96, side: T.DoubleSide }); resources.push(grassMaterial);
  // A shared wind front moves across the field. Only the tips bend; each clump keeps its roots.
  const windTime = { value: 0 };
  grassMaterial.onBeforeCompile = shader => {
    shader.uniforms.windTime = windTime;
    shader.vertexShader = 'uniform float windTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vec2 clump = instanceMatrix[3].xz;
      vec2 wind = vec2(0.92, 0.39);
      float phase = windTime * 0.92 - dot(clump, wind) * 0.49;
      float gust = smoothstep(0.10, 0.95, sin(phase));
      float bend = 0.04 + 0.29 * gust + 0.035 * sin(phase * 2.3 + clump.y);
      float bladeAspect = instanceMatrix[1].y / length(instanceMatrix[0].xz);
      vec2 localWind = vec2(dot(wind, normalize(instanceMatrix[0].xz)),
                            dot(wind, normalize(instanceMatrix[2].xz)));
      transformed.xz += localWind * (position.y * position.y * bend * bladeAspect);`
    );
  };
  const count=software?900:5200;
  const grass = new T.InstancedMesh(grassGeometry, grassMaterial, count); grass.name = 'house-garden-grasses'; grass.receiveShadow = true; grass.userData.pickThrough = true;
  const tint = new T.Color();
  function plant(slot, seed, x, z, mown) {
    const scale = .45 + hash(seed + 1100) * .9;
    const height = mown ? .11 + .10 * hash(seed + 512) : scale;
    matrix.compose(new T.Vector3(x, heightAt(x, z), z),
      q.setFromAxisAngle(up, hash(seed + 10) * Math.PI * 2), new T.Vector3(scale, height, scale));
    grass.setMatrixAt(slot, matrix);
    grass.setColorAt(slot, tint.setHSL((mown ? .17 : .13) + hash(seed + 1500) * .035,
      .12 + hash(seed + 1800) * .2, .42 + hash(seed + 2100) * .25));
  }
  let planted = 0;
  for (let i = 0; i < count * 2 && planted < count; i++) {
    // Scatter short tufts over the future wing and leave the hard landscaping clear.
    const lawnSeed = i % 8 === 0;
    const angle = hash(i + 400) * Math.PI * 2;
    const distance = 8 + hash(i + 800) * (i % 4 === 1 ? 38 : 18);
    const x = lawnSeed ? extension[0] + hash(i + 726) * 8 : Math.cos(angle) * distance;
    const z = lawnSeed ? extension[2] + hash(i + 915) * 10 : Math.sin(angle) * distance;
    if (needsClearance(x, z, .42)) continue;
    plant(planted++, i, x, z, edgeDistance(x, z, extension) < .5);
  }
  grass.count = planted;
  root.add(grass);

  // Low, distant silhouettes and aerial perspective give the opening shot a horizon.
  for (let layer = 0; layer < 3; layer++) {
    const ridge = new T.PlaneGeometry(220, 34, 96, 1), pos = ridge.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), top = pos.getY(i) > 0;
      pos.setY(i, top ? 3 + layer * 1.6 + Math.sin(x * .043 + layer) * 3.4 + Math.sin(x * .13 + layer * 2) * 1.0 : -12);
    }
    ridge.computeVertexNormals();
    const m = new T.MeshBasicMaterial({ color: ['#879590', '#99A7A2', '#AFBAB6'][layer], side: T.DoubleSide }); resources.push(m);
    const hill = new T.Mesh(ridge, m); hill.position.set(0, 0, -52 - layer * 16); hill.userData.pickThrough = true; root.add(hill);
  }
  // At the threshold the view fans out across the street. Wrap the skyline around
  // the southern lots so a sideways glance along the road cannot reveal a plane edge.
  for (const [layer, radius] of [55, 76].entries()) {
    const vertices = [], triangles = [], steps = 160;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, angle = (t - .5) * Math.PI * 1.48;
      const x = radius * Math.sin(angle), z = 1 + radius * Math.cos(angle);
      const valley = 2.3 * Math.sin(angle * 4 + layer * 2) + 1.2 * Math.cos(angle * 8 - layer);
      const treeline = layer === 0 ? .65 * Math.max(0, Math.cos(angle * 11)) * hash(i + 53) : 0;
      const taper = smooth01(Math.min(t, 1 - t) / .09);
      const crest = -2 + taper * (6 + layer * 4 + valley + treeline);
      vertices.push(x, -12, z, x, crest, z);
      if (i < steps) {
        const base = i * 2;
        triangles.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
    const ridge = new T.BufferGeometry();
    ridge.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    ridge.setIndex(triangles);
    const material = new T.MeshBasicMaterial({ color: layer === 0 ? '#87978B' : '#A0AEAD' });
    resources.push(material);
    const hills = new T.Mesh(ridge, material);
    hills.name = 'street-horizon-' + layer;
    hills.userData.pickThrough = true;
    root.add(hills);
  }
  return {
    root, heightAt,
    updateAmbient(seconds) { windTime.value = seconds; },
    dispose() { for (const m of resources) m.dispose();root.traverse(node=>node.geometry?.dispose());root.removeFromParent(); }
  };
}
