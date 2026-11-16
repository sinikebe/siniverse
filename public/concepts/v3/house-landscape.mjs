// A mineral garden, authored for this house. Planting stays outside the walking bounds.
export function buildLandscape(T, scene, surfaces, {software=false}={}) {
  const root = new T.Group(); root.name = 'house-landscape'; scene.add(root);
  const resources = [], hash = n => { const v = Math.sin(n * 127.1) * 43758.5453; return v - Math.floor(v); };
  const heightAt = (x, z) => {
    const away = Math.max(0, Math.min(1, (Math.max(Math.abs(x) / 8, Math.abs(z - 1) / 9) - 1) / 2));
    return -.25 + away * (.5 + Math.sin(x * .12 + z * .06) * .8 + Math.sin(z * .19 - x * .08) * .55);
  };
  const segments=software?64:160;
  const ground = new T.PlaneGeometry(180, 180, segments, segments); ground.rotateX(-Math.PI / 2);
  const p = ground.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)));
  ground.computeVertexNormals();
  const uv = ground.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * .6, p.getZ(i) * .6);
  const terrain = new T.Mesh(ground, surfaces.get('#DBDDD1', 'gravel')); terrain.name = 'house-garden-terrain';
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
  for (let i = 0; i < 64; i++) {
    const angle = hash(i + 12) * Math.PI * 2, distance = 10 + hash(i + 82) * 24;
    const x = Math.cos(angle) * distance, z = Math.sin(angle) * distance - 1;
    const size = .3 + Math.pow(hash(i + 120), 2) * 1.6;
    matrix.compose(new T.Vector3(x, heightAt(x, z) + size * .19, z), q.setFromAxisAngle(up, angle), new T.Vector3(size * 1.35, size * .55, size));
    rocks.setMatrixAt(i, matrix);
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
  const count=software?900:5200;
  const grass = new T.InstancedMesh(grassGeometry, grassMaterial, count); grass.name = 'house-garden-grasses'; grass.receiveShadow = true; grass.userData.pickThrough = true;
  const tint = new T.Color();
  for (let i = 0; i < count; i++) {
    const angle = hash(i + 400) * Math.PI * 2, distance = 8 + hash(i + 800) * (i<count*.77?14:38);
    let x = Math.cos(angle) * distance, z = Math.sin(angle) * distance;
    // An open approach and the complete navigation rectangle remain free of planting.
    if (Math.abs(x) < 6.9 && z > -5.1 && z < 8.2) { x += x < 0 ? -7 : 7; }
    const scale = .45 + hash(i + 1100) * .9;
    matrix.compose(new T.Vector3(x, heightAt(x, z), z), q.setFromAxisAngle(up, angle), new T.Vector3(scale, scale, scale));
    grass.setMatrixAt(i, matrix); grass.setColorAt(i, tint.setHSL(.13 + hash(i + 1500) * .035, .12 + hash(i + 1800) * .20, .40 + hash(i + 2100) * .25));
  }
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
  return { root, dispose() { for (const m of resources) m.dispose();root.traverse(node=>node.geometry?.dispose());root.removeFromParent(); } };
}
