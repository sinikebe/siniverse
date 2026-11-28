import { setMetreUV } from './house-materials.mjs';

// The three façades face the same street. Coordinates are metres, like the player house.
export function buildNeighborhood(T, scene, surfaces, { heightAt, software = false }) {
  const root = new T.Group();
  root.name = 'siniverse-neighborhood';
  scene.add(root);
  const areas = [], owned = [];
  const palette = {
    wall: surfaces.get('#F0EBDD', 'plaster'),
    stone: surfaces.get('#CAC6B9', 'stone'),
    chalk: surfaces.get('#EBE8DA', 'stone'),
    roof: surfaces.get('#424F4F'),
    rim: surfaces.get('#586260'),
    frame: surfaces.get('#303B39'),
    door: surfaces.get('#DAAE80', 'wood'),
    oak: surfaces.get('#E5D6B8', 'wood'),
    shutter: surfaces.get('#7E8977'),
    gravel: surfaces.get('#D9D0BD', 'gravel'),
    glass: new T.MeshStandardMaterial({color: '#849998', roughness: .19, metalness: .50}),
    canopy: new T.MeshStandardMaterial({vertexColors: true, side: T.DoubleSide, roughness: .91}),
    bark: surfaces.get('#8E8274', 'wood'),
  };
  owned.push(palette.glass, palette.canopy);

  function group(parent, x, y, z, yaw = 0) {
    const node = new T.Group();
    node.position.set(x, y, z); node.rotation.y = yaw; parent.add(node);
    return node;
  }
  function area(name, x = 0, z = 0, yaw = 0) {
    const node = group(root, x, heightAt(x, z), z, yaw);
    node.name = name; areas.push(node); return node;
  }
  function put(parent, geometry, material, x, y, z) {
    if (material.userData.metreUV) setMetreUV(geometry, material.userData.metreUV);
    const mesh = new T.Mesh(geometry, material);
    mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }
  const box = (parent, x, y, z, w, h, d, material) =>
    put(parent, new T.BoxGeometry(w, h, d), material, x, y, z);
  function beam(parent, start, end, radius, material) {
    const a = new T.Vector3(...start), b = new T.Vector3(...end), diff = b.clone().sub(a);
    const mesh = put(parent, new T.CylinderGeometry(radius * .76, radius, diff.length(), 7), material,
      (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), diff.normalize());
  }
  function walls(parent, width, depth, eaves) {
    box(parent, 0, .055, 0, width + .08, .32, depth + .08, palette.stone);
    box(parent, 0, (eaves + .2) / 2, 0, width, eaves - .2, depth, palette.wall);
  }
  // Profile of a timber gable, with two separate folded-metal slopes and their seams.
  function pitched(parent, width, depth, eaves, rise, timber = false) {
    walls(parent, width, depth, eaves);
    const cross = new T.Shape();
    cross.moveTo(-width / 2, eaves); cross.lineTo(width / 2, eaves);
    cross.lineTo(0, eaves + rise); cross.closePath();
    const gable = new T.ExtrudeGeometry(cross, {depth, bevelEnabled: false});
    put(parent, gable, timber ? palette.oak : palette.wall, 0, 0, -depth / 2);
    const pitch = Math.atan2(rise, width / 2), run = width / 2 + .22;
    const length = run / Math.cos(pitch), metalY = eaves + rise - run * Math.tan(pitch) / 2;
    for (const side of [-1, 1]) {
      const plane = group(parent, side * run / 2, metalY, 0);
      plane.rotation.z = -side * pitch;
      box(plane, 0, 0, 0, length, .15, depth + .48, palette.roof);
      const spacing = software ? 1.12 : .58;
      for (let z = -depth / 2; z <= depth / 2; z += spacing)
        box(plane, 0, .083, z, length, .043, .04, palette.rim);
    }
    box(parent, 0, eaves + rise + .055, 0, .14, .13, depth + .49, palette.rim);
  }
  function opening(facade, x, bottom, w, h, divisions = 2) {
    // Thin inset of cool glazing behind projecting timber reveals and a limestone sill.
    box(facade, x, bottom + h / 2, .035, w + .16, h + .16, .13, palette.frame);
    box(facade, x, bottom + h / 2, .108, w, h, .045, palette.glass);
    for (let i = 1; i < divisions; i++)
      box(facade, x - w / 2 + w * i / divisions, bottom + h / 2, .15, .053, h + .04, .065, palette.frame);
    box(facade, x, bottom - .095, .11, w + .27, .085, .32, palette.chalk);
  }
  function entry(facade, x) {
    box(facade, x, 1.18, .06, 1.16, 2.12, .15, palette.frame);
    box(facade, x, 1.16, .145, .98, 2.02, .045, palette.door);
    box(facade, x + .35, 1.13, .20, .065, .26, .065, palette.rim);
    box(facade, x, .1, .38, 1.47, .18, .85, palette.chalk);
  }
  function bench(facade, x, z, width) {
    for (const side of [-1, 1])
      box(facade, x + side * width * .34, .27, z, .13, .45, .42, palette.frame);
    for (let i = 0; i < 3; i++)
      box(facade, x, .51, z + (i - 1) * .15, width, .085, .13, palette.oak);
  }
  function downpipe(facade, x, roofHeight) {
    beam(facade, [x, roofHeight, .12], [x, .28, .12], .055, palette.rim);
  }

  const longhouse = area('neighborhood-longere', -29, 1);
  const longRidge = group(longhouse, 0, 0, 0, Math.PI / 2);
  pitched(longRidge, 5.5, 13.6, 2.65, 1.28);
  const longFront = group(longhouse, 0, 0, 2.75);
  opening(longFront, -4.65, .88, 1.35, 1.23);
  opening(longFront, -.25, .84, 2.22, 1.36, 3);
  opening(longFront, 4.25, .88, 1.52, 1.23);
  entry(longFront, -2.55);
  for (const x of [-5.60, -3.70, 3.24, 5.26])
    box(longFront, x, 1.50, .10, .39, 1.35, .10, palette.shutter);
  box(longFront, -1.25, 2.56, .84, 5.35, .13, 1.80, palette.roof).rotation.x = .075;
  for (const x of [-3.68, 1.14]) box(longFront, x, 1.26, 1.58, .105, 2.48, .105, palette.oak);
  bench(longFront, -.68, .53, 1.72);
  downpipe(longFront, 6.58, 2.65);
  const endWall = group(longhouse, 6.8, 0, 0, Math.PI / 2);
  opening(endWall, 0, .87, 1.50, 1.26);
  box(longhouse, -5.05, 3.64, -.75, .66, 1.57, .63, palette.wall);
  box(longhouse, -5.05, 4.46, -.75, .8, .13, .76, palette.stone);

  const patio = area('neighborhood-patio', 24, -5);
  const rearWing = group(patio, -.35, 0, -2.92, Math.PI / 2);
  pitched(rearWing, 4.45, 10.55, 2.69, 1.18);
  const eastWing = group(patio, 3.10, 0, 1.31);
  walls(eastWing, 3.65, 4.66, 2.81);
  box(eastWing, 0, 2.87, 0, 4.02, .19, 5.02, palette.roof);
  const courtWall = group(patio, -.36, 0, -.695);
  opening(courtWall, -2.2, .28, 3.9, 1.99, 3);
  entry(courtWall, .62);
  const eastFront = group(eastWing, 0, 0, 2.33);
  opening(eastFront, 0, .86, 2.22, 1.26);
  const westFace = group(eastWing, -1.825, 0, .54, -Math.PI / 2);
  opening(westFace, 0, .29, 2.31, 1.94);
  box(patio, -1.55, .033, 1.56, 5.54, .09, 4.34, palette.chalk);
  bench(courtWall, -3.82, 3.78, 1.64);
  downpipe(eastFront, 1.63, 2.79);

  const narrow = area('neighborhood-pignon', -15, 25, Math.PI);
  pitched(narrow, 5.5, 8.0, 3.18, 1.74, true);
  const streetFace = group(narrow, 0, 0, 4);
  opening(streetFace, -.98, .52, 1.63, 2.43);
  entry(streetFace, 1.24);
  box(streetFace, 1.23, 2.49, .58, 2.03, .12, 1.31, palette.roof);
  box(streetFace, 2.08, 1.24, 1.11, .11, 2.43, .11, palette.oak);
  box(streetFace, 1.23, .051, .93, 2.08, .11, 1.92, palette.stone);
  opening(group(narrow, -2.75, 0, 0, -Math.PI / 2), .5, .94, 1.72, 1.32);
  opening(group(narrow, 2.75, 0, 0, Math.PI / 2), -.45, .91, 2.24, 1.34, 3);
  downpipe(streetFace, -2.61, 3.17);

  // Airy deciduous crowns: each fork carries small groups of individually coloured leaves.
  const random = seed => {
    const value = Math.sin(seed * 127.1 + .87) * 43758.5453;
    return value - Math.floor(value);
  };
  // The stationary sun's detailed shadow map is centred on the player's rooms.
  // Give objects outside it contact shading that fades into the existing ground.
  const shadeSize = 64, pixels = new Uint8Array(shadeSize * shadeSize * 4);
  for (let i = 0; i < shadeSize * shadeSize; i++) {
    const u = Math.abs(((i % shadeSize) + .5) / shadeSize * 2 - 1);
    const v = Math.abs((Math.floor(i / shadeSize) + .5) / shadeSize * 2 - 1);
    const edge = Math.hypot(Math.max(0, u - .64), Math.max(0, v - .64));
    const falloff = Math.min(1, edge / .36);
    const alpha = 1 - falloff * falloff * (3 - 2 * falloff);
    pixels.set([255, 255, 255, Math.round(255 * alpha)], i * 4);
  }
  const shadowMap = new T.DataTexture(pixels, shadeSize, shadeSize, T.RGBAFormat);
  shadowMap.magFilter = shadowMap.minFilter = T.LinearFilter; shadowMap.needsUpdate = true;
  const shade = new T.MeshBasicMaterial({color: '#3C3731', map: shadowMap, opacity: .40,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1});
  owned.push(shadowMap, shade);
  function contact(plot, x, z, width, depth, y = .019) {
    const patch = new T.PlaneGeometry(width, depth);
    patch.rotateX(-Math.PI / 2); put(plot, patch, shade, x, y, z);
  }
  contact(longhouse, .22, -.18, 16.5, 7.75);
  contact(patio, -.18, -3.03, 13.25, 6.65);
  contact(patio, 3.15, 1.16, 5.41, 6.40);
  contact(narrow, -.18, .16, 7.64, 10.75);

  function tree(plot, x, z, scale, seed) {
    const base = group(plot, x, 0, z);
    base.scale.setScalar(scale);
    beam(base, [0, .01, 0], [.07, 1.75, -.06], .094, palette.bark);
    const pos = [], col = [];
    const leaves = ['#818764', '#91956B', '#989762', '#AC9D69', '#7F8866'].map(c => new T.Color(c));
    const forkCount = software ? 15 : 22;
    for (let i = 0; i < forkCount; i++) {
      const s = seed + i * 243, angle = i * 2.4 + random(s) * .43;
      const reach = .39 + random(s + 2) * .66, y = 1.91 + random(s + 4) * 1.36;
      const end = [Math.cos(angle) * reach, y, Math.sin(angle) * reach];
      const elbow = [end[0] * .61, y - .58, end[2] * .57];
      beam(base, [.05, 1.01 + random(s + 7) * .69, -.04], elbow, .047, palette.bark);
      beam(base, elbow, end, .028, palette.bark);
      const amount = software ? 27 : 54;
      for (let j = 0; j < amount; j++) {
        const k = s + j * 11, theta = random(k + 1) * Math.PI * 2;
        const r = .56 * Math.sqrt(random(k + 2));
        const dx = Math.cos(theta) * r, dz = Math.sin(theta) * r;
        const lx = end[0] + dx, lz = end[2] + dz;
        const ly = y + (random(k + 3) - .52) * .72 - r * .35;
        const size = (software ? .12 : .09) * (.65 + random(k + 5));
        const a = random(k + 6) * Math.PI * 2, w = size * .68;
        const sx = Math.cos(a) * size, sz = Math.sin(a) * size;
        const wx = -Math.sin(a) * w, wz = Math.cos(a) * w;
        const tip = [lx + sx, ly + .066, lz + sz], foot = [lx - sx, ly - .047, lz - sz];
        const left = [lx + wx, ly, lz + wz], right = [lx - wx, ly + .028, lz - wz];
        pos.push(...tip, ...left, ...foot, ...foot, ...right, ...tip);
        const c = leaves[Math.floor(random(k + 8) * leaves.length)];
        for (let n = 0; n < 6; n++) col.push(c.r, c.g, c.b);
      }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals(); put(base, geo, palette.canopy, 0, 0, 0);
  }
  tree(patio, -1.72, 2.44, .90, 707);
  tree(longhouse, -7.56, 4.65, 1.13, 511);
  tree(narrow, -4.16, 5.64, 1.03, 272);
  contact(patio, -1.73, 2.43, 1.8, 1.62, .082);
  contact(longhouse, -7.51, 4.61, 2.10, 1.72);
  contact(narrow, -4.26, 5.72, 2.22, 1.83);

  // Low beds of sage and oat grass, loose around each gate and denser along masonry.
  // The domed hearts keep their silhouette at a distance; individual sprays break up the edges.
  function planting(plot, x, z, scale, seed, grass) {
    const plant = group(plot, x, .035, z); plant.scale.setScalar(scale);
    const verts = [], tints = [];
    const colors = (grass ? ['#8D8865', '#A4A17C', '#A69A70', '#B3A27E'] :
      ['#65765F', '#798974', '#87967B', '#61745E']).map(c => new T.Color(c));
    if (!grass) {
      for (let i = 0; i < 5; i++) {
        const theta = i * 2.4 + seed, distance = i === 0 ? 0 : .26;
        const geo = new T.IcosahedronGeometry(1, 1), p = geo.attributes.position;
        geo.deleteAttribute('uv'); // Foliage batches use vertex colours throughout.
        const tint = [];
        for (let j = 0; j < p.count; j++) {
          const lx = p.getX(j), ly = p.getY(j), lz = p.getZ(j);
          const r = .92 + .13 * Math.sin(lx * 21 + ly * 13 + lz * 8 + seed);
          p.setXYZ(j, lx * r * .40, ly * r * .27, lz * r * .35);
          const c = colors[(i + 1) % colors.length], sun = .75 + .2 * ly + .08 * lx;
          tint.push(c.r * sun, c.g * sun, c.b * sun);
        }
        geo.computeVertexNormals(); geo.setAttribute('color', new T.Float32BufferAttribute(tint, 3));
        put(plant, geo, palette.canopy, Math.cos(theta) * distance, .23, Math.sin(theta) * distance);
      }
    }
    const count = software ? 27 : 48;
    for (let j = 0; j < count; j++) {
      const n = seed + j * 19, angle = random(n) * Math.PI * 2;
      const dx = Math.cos(angle), dz = Math.sin(angle);
      const radius = (.2 + .42 * random(n + 6)) * (grass ? .84 : 1);
      const rise = (grass ? .38 : .32) + .37 * random(n + 7);
      const w = grass ? .038 : .049;
      const a = [dx * .15, .11, dz * .15], b = [a[0] - dz * w, .11, a[2] + dx * w];
      const mid = [dx * radius * .77, rise * .84, dz * radius * .77];
      const fold = [mid[0] - dz * w, mid[1], mid[2] + dx * w];
      const tip = [dx * radius, rise, dz * radius];
      verts.push(...a, ...b, ...mid, ...b, ...fold, ...mid, ...mid, ...fold, ...tip);
      const c = colors[j % colors.length];
      for (let k = 0; k < 9; k++) tints.push(c.r, c.g, c.b);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
    geo.setAttribute('color', new T.Float32BufferAttribute(tints, 3));
    geo.computeVertexNormals(); put(plant, geo, palette.canopy, 0, 0, 0);
  }
  function border(plot, clusters, seed) {
    for (const [i, [x, z, s, grass]] of clusters.entries()) {
      contact(plot, x, z, 1.54 * s, 1.39 * s);
      planting(plot, x, z, s, seed + i * 103, grass);
    }
  }
  border(longhouse, [[-6.17, 3.29, 1.12], [-5.42, 3.52, .82, true], [-4.86, 3.10, .89],
    [2.52, 3.54, .94, true], [3.33, 3.29, 1.28], [4.30, 3.45, .86], [5.04, 3.31, 1.15, true],
    [5.83, 3.35, .86], [-6.33, 6.06, .91], [-5.55, 6.13, .82, true]], 91);
  border(narrow, [[-2.20, 4.61, 1.23], [-1.39, 4.62, .93, true], [-.65, 4.45, .86],
    [-3.21, 3.63, 1.01, true], [-3.38, 2.92, .96], [-3.53, 2.18, .84, true],
    [-3.90, 6.76, .91], [-3.24, 6.92, .72, true], [2.79, 7.56, .86], [3.49, 7.57, .92, true]], 45);
  border(patio, [[2.04, 4.18, 1.04], [2.79, 4.25, .93, true], [3.58, 4.31, 1.14],
    [-4.82, 1.11, .91], [-4.90, 1.96, 1.03, true], [4.06, 7.19, .87]], 71);

  function gatepost(plot, x, z, width = .34) {
    box(plot, x, .42, z, width, .86, width, palette.wall);
    box(plot, x, .87, z, width + .08, .08, width + .08, palette.stone);
  }
  gatepost(longhouse, -4.03, 6.54); gatepost(longhouse, -1.29, 6.54);
  box(longhouse, -6.12, .24, 6.54, 3.85, .49, .28, palette.wall);
  box(longhouse, -6.12, .50, 6.54, 3.92, .07, .34, palette.chalk);
  gatepost(patio, 1.72, 7.61);
  box(patio, 3.07, .35, 7.61, 2.46, .71, .30, palette.wall);
  gatepost(narrow, 2.20, 8.02);
  contact(longhouse, -6.02, 6.58, 4.93, 1.01);
  contact(patio, 2.96, 7.55, 3.62, 1.12);
  contact(narrow, 2.22, 8.02, .85, .78);

  const street = area('neighborhood-street');
  // A seamless asphalt aggregate. Small mineral chips keep a metrically correct scale
  // as the camera sweeps from the elevated opening to walking height.
  const size = 128, bytes = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const x = i % size, y = Math.floor(i / size);
    const cloud = Math.sin(x * 2 * Math.PI / size) * Math.sin(y * 4 * Math.PI / size);
    const grit = random(i + 8000), value = 107 + cloud * 3 + (grit - .5) * 24 + (grit > .965 ? 12 : 0);
    bytes[i * 4] = value + 2; bytes[i * 4 + 1] = value + 1;
    bytes[i * 4 + 2] = value - 1; bytes[i * 4 + 3] = 255;
  }
  const aggregate = new T.DataTexture(bytes, size, size, T.RGBAFormat);
  aggregate.colorSpace = T.SRGBColorSpace; aggregate.wrapS = aggregate.wrapT = T.RepeatWrapping;
  aggregate.generateMipmaps = true; aggregate.minFilter = T.LinearMipMapLinearFilter;
  aggregate.magFilter = T.LinearFilter; aggregate.anisotropy = 4; aggregate.needsUpdate = true;
  const asphalt = new T.MeshStandardMaterial({map: aggregate, roughness: .96, vertexColors: true});
  owned.push(asphalt, aggregate);
  // Pale crushed limestone reads differently from both the earth and the asphalt,
  // including at the shallow angle of an eye-level view across the street.
  const chips = bytes.slice();
  for (let i = 0; i < chips.length; i += 4) {
    const v = 184 + (bytes[i] - 109) * 1.64;
    chips[i] = v + 9; chips[i + 1] = v + 6; chips[i + 2] = v - 4;
  }
  const limestone = new T.DataTexture(chips, size, size, T.RGBAFormat);
  limestone.colorSpace = T.SRGBColorSpace; limestone.wrapS = limestone.wrapT = T.RepeatWrapping;
  limestone.generateMipmaps = true; limestone.minFilter = T.LinearMipmapLinearFilter;
  limestone.magFilter = T.LinearFilter; limestone.anisotropy = 4; limestone.needsUpdate = true;
  const crushedStone = new T.MeshStandardMaterial({map: limestone, roughness: .97});
  crushedStone.userData.metreUV = 1.37; owned.push(limestone, crushedStone);
  const pos = [], colors = [], uv = [], idx = [];
  const crown = [[-2.75, .052, .79], [-2.51, .065, .92], [-1.32, .088, .96], [0, .107, 1], [1.32, .088, .96], [2.51, .065, .92], [2.75, .052, .79]];
  for (let x = -88; x <= 88; x += 2) {
    const shade = .976 + .024 * random(x + 901);
    for (const [offset, lift, tone] of crown) {
      const z = 12 + offset, v = tone * shade;
      pos.push(x, heightAt(x, z) - street.position.y + lift, z);
      uv.push(x * .72, z * .72); colors.push(v, v, v);
    }
    if (x === 88) continue;
    const start = ((x + 88) / 2) * crown.length;
    for (let k = 0; k < crown.length - 1; k++) {
      const a = start + k, b = a + crown.length;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const roadway = new T.BufferGeometry();
  roadway.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  roadway.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  roadway.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  roadway.setIndex(idx); roadway.computeVertexNormals();
  put(street, roadway, asphalt, 0, 0, 0);

  for (const side of [-1, 1]) {
    const edge = 12 + side * 2.75;
    box(street, 0, .007, edge + side * .42, 176, .07, .84, palette.gravel);
    const curbLength = software ? 2 : 1;
    for (let x = -88; x < 88; x += curbLength) {
      const cx = x + curbLength / 2;
      const garageAccess = side < 0 && cx > .42 && cx < 5.68;
      const y = heightAt(cx, edge) - street.position.y + (garageAccess ? .05 : .068);
      box(street, cx, y, edge + side * .064, curbLength - .015, .105, .14, palette.chalk);
    }
  }
  // Continue the existing garage apron and the four original stepping stones down to the verge.
  box(street, 3.05, .092, 7.77, 4.45, .065, 3.04, crushedStone).rotation.x = .019;
  for (let i = 0; i < 3; i++)
    box(street, -2.3, .133 - i * .022, 7.38 + i * .8, 1.34, .09, .66, palette.chalk);
  function lane(x, startZ, endZ, width) {
    box(street, x, .049, (startZ + endZ) / 2, width, .065, Math.abs(endZ - startZ), crushedStone);
  }
  lane(-31.55, 4.37, 9.26, 1.56);
  lane(24.24, -2.20, 9.26, 1.62);
  lane(-16.24, 14.74, 19.37, 1.46);

  // Every façade stays independently frustum-cullable, with a single draw per surface
  // and all the window bars, roof seams and individual kerbstones baked at build time.
  for (const plot of areas) bakeStaticPlot(T, plot);
  return {root, dispose() {
    root.traverse(node => node.geometry?.dispose());
    for (const resource of owned) resource.dispose();
    root.removeFromParent();
  }};
}

function bakeStaticPlot(T, plot) {
  plot.updateWorldMatrix(true, true);
  const inverse = plot.matrixWorld.clone().invert(), transform = new T.Matrix4(), batches = new Map();
  const vertex = new T.Vector3(), normal = new T.Vector3(), normalTransform = new T.Matrix3();
  plot.traverse(node => {
    if (!node.isMesh) return;
    const {geometry, material} = node;
    if (!batches.has(material)) batches.set(material, {position: [], normal: [], uv: [], color: [], index: []});
    const batch = batches.get(material), offset = batch.position.length / 3;
    transform.multiplyMatrices(inverse, node.matrixWorld);
    normalTransform.getNormalMatrix(transform);
    const attrs = geometry.attributes;
    for (let i = 0; i < attrs.position.count; i++) {
      vertex.fromBufferAttribute(attrs.position, i).applyMatrix4(transform);
      normal.fromBufferAttribute(attrs.normal, i).applyNormalMatrix(normalTransform);
      batch.position.push(vertex.x, vertex.y, vertex.z); batch.normal.push(normal.x, normal.y, normal.z);
      if (attrs.uv) batch.uv.push(attrs.uv.getX(i), attrs.uv.getY(i));
      if (attrs.color) batch.color.push(attrs.color.getX(i), attrs.color.getY(i), attrs.color.getZ(i));
    }
    const count = geometry.index?.count ?? attrs.position.count;
    for (let i = 0; i < count; i++) batch.index.push(offset + (geometry.index ? geometry.index.getX(i) : i));
    geometry.dispose();
  });
  plot.clear();
  for (const [material, batch] of batches) {
    const geo = new T.BufferGeometry();
    for (const attr of ['position', 'normal', 'uv', 'color'])
      if (batch[attr].length) geo.setAttribute(attr, new T.Float32BufferAttribute(batch[attr], attr === 'uv' ? 2 : 3));
    geo.setIndex(batch.index); geo.computeBoundingSphere();
    const mesh = new T.Mesh(geo, material);
    mesh.receiveShadow = true; mesh.userData.pickThrough = true; mesh.matrixAutoUpdate = false;
    plot.add(mesh);
  }
}
