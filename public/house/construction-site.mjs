// Static scenery, in metres. The site stays outside the house's walking rectangle.
export const WORK_AREAS = [
  { x: -14.6, z: 1.5, width: 7.2, depth: 13.2 },
  { x: -5.2, z: -22, width: 5, depth: 5 }
];

export function buildConstructionSite(world, kit) {
  const T = world.THREE;
  const { root: landscape, mesh, curve, material, canvasTexture, roundedGeometry, contact, materials, heightAt } = kit;
  const root = new T.Group(); root.name = 'construction-site'; landscape.add(root);
  const yellow = '#C49A4D', steel = '#444B4A', rubber = '#292D2B', concrete = '#A8A89A';
  const up = new T.Vector3(0, 1, 0), forward = new T.Vector3(0, 0, 1);
  const vector = p => new T.Vector3(...p);

  function box(size, color, position, parent, name, kind = 'paint', radius = .025) {
    return mesh(roundedGeometry(size, radius, 3), color, position, parent, name, kind);
  }

  function rod(a, b, radius, color, parent, name) {
    const start = vector(a), end = vector(b), delta = end.clone().sub(start);
    const item = mesh(new T.CylinderGeometry(radius, radius, delta.length(), 10), color,
      start.clone().add(end).multiplyScalar(.5).toArray(), parent, name, 'metal');
    item.quaternion.setFromUnitVectors(up, delta.normalize()); return item;
  }
  function beam(a, b, width, thickness, color, parent, name) {
    const start = vector(a), end = vector(b), delta = end.clone().sub(start);
    const item = box([width, thickness, delta.length()], color,
      start.clone().add(end).multiplyScalar(.5).toArray(), parent, name, 'paint', .015);
    item.quaternion.setFromUnitVectors(forward, delta.normalize()); return item;
  }
  function pin(p, radius, width, parent) {
    const item = rod([p[0] - width / 2, p[1], p[2]], [p[0] + width / 2, p[1], p[2]], radius, steel, parent, 'excavator-pivot');
    return item;
  }
  function hydraulic(a, b, parent) {
    const mid = vector(a).lerp(vector(b), .58).toArray();
    rod(a, mid, .085, steel, parent, 'excavator-hydraulic-barrel');
    rod(mid, b, .045, '#B3BCB9', parent, 'excavator-hydraulic-piston');
    pin(a, .105, .32, parent); pin(b, .075, .25, parent);
  }

  // A level, irregular scraped pad, with the same mineral surface as the garden.
  const area = WORK_AREAS[0], pad = new T.PlaneGeometry(area.width, area.depth, 14, 18); pad.rotateX(-Math.PI / 2);
  const positions = pad.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    const edge = Math.max(Math.abs(x) / (area.width / 2), Math.abs(z) / (area.depth / 2));
    const ripple = edge > .8 ? Math.sin(z * 3.8 + x * 4.7) * .08 : 0;
    positions.setXYZ(i, x + ripple, heightAt(area.x + x, area.z + z) + .012, z + ripple);
  }
  pad.computeVertexNormals();
  const dirt = mesh(pad, '#9C8C6A', [area.x, 0, area.z], root, 'construction-scraped-earth', 'gravel'); dirt.castShadow = false;

  const excavator = new T.Group(); excavator.name = 'construction-excavator';
  excavator.position.set(-14.3, heightAt(-14.3, 3.1), 3.1); excavator.rotation.y = Math.PI + .35; root.add(excavator);
  contact([0, .025, -.1], [3.7, 4.3], .5, excavator);
  box([1.8, .28, 2.8], steel, [0, .64, 0], excavator, 'excavator-undercarriage', 'metal', .06);

  function capsule(path, radius, halfLength) {
    path.moveTo(-halfLength, -radius); path.lineTo(halfLength, -radius);
    path.absarc(halfLength, 0, radius, -Math.PI / 2, Math.PI / 2, false);
    path.lineTo(-halfLength, radius); path.absarc(-halfLength, 0, radius, Math.PI / 2, Math.PI * 1.5, false);
    path.closePath(); return path;
  }
  const trackShape = capsule(new T.Shape(), .37, 1.14);
  trackShape.holes.push(capsule(new T.Path(), .24, 1.10));
  const trackGeometry = new T.ExtrudeGeometry(trackShape, { depth: .43, bevelEnabled: true, bevelSize: .018, bevelThickness: .018, bevelSegments: 2, curveSegments: 12, steps: 1 });
  trackGeometry.rotateY(Math.PI / 2); trackGeometry.translate(-.215, 0, 0);
  for (const x of [-.95, .95]) {
    mesh(trackGeometry, rubber, [x, .405, 0], excavator, 'excavator-track-band', 'rubber');
    for (let i = 0; i < 6; i++) {
      const wheel = mesh(new T.CylinderGeometry(.22, .22, .38, 16), steel, [x, .405, -.98 + i * .392], excavator, 'excavator-track-roller', 'metal'); wheel.rotation.z = Math.PI / 2;
    }
  }
  const treadPoses = [];
  for (const x of [-.95, .95]) {
    for (const side of [-1, 1]) for (let i = 0; i < 12; i++) treadPoses.push({ p: [x, .405 + side * .385, -1.1 + i * .2], n: [0, side, 0] });
    for (const end of [-1, 1]) for (let i = 0; i < 9; i++) {
      const angle = (end > 0 ? 0 : Math.PI) + (i + .5) / 9 * Math.PI;
      treadPoses.push({ p: [x, .405 + Math.cos(angle) * .385, end * 1.14 + Math.sin(angle) * .385], n: [0, Math.cos(angle), Math.sin(angle)] });
    }
  }
  const treads = new T.InstancedMesh(roundedGeometry([.51, .045, .14], .012, 3), material('#3F423C', 'rubber'), treadPoses.length);
  treads.name = 'excavator-track-shoes'; treads.castShadow = treads.receiveShadow = true;
  const matrix = new T.Matrix4(), rotation = new T.Quaternion();
  treadPoses.forEach((pose, i) => { matrix.compose(vector(pose.p), rotation.setFromUnitVectors(up, vector(pose.n)), new T.Vector3(1, 1, 1)); treads.setMatrixAt(i, matrix); });
  excavator.add(treads);
  mesh(new T.CylinderGeometry(.58, .58, .16, 24), steel, [0, .91, 0], excavator, 'excavator-slew-ring', 'metal');
  box([2.05, .57, 2.12], yellow, [0, 1.22, .27], excavator, 'excavator-upper-body', 'paint', .13);
  box([1.95, .75, .63], yellow, [0, 1.50, 1.18], excavator, 'excavator-counterweight', 'paint', .17);
  box([.93, .54, 1.0], yellow, [.53, 1.57, .55], excavator, 'excavator-engine-cover', 'paint', .07);
  box([1.72, .13, .12], '#E0D6B2', [0, 1.57, 1.52], excavator, 'excavator-rear-reflector', 'paint', .012);
  for (let i = 0; i < 7; i++) box([.02, .035, .55], steel, [1.005, 1.43 + i * .055, .55], excavator, 'excavator-engine-vent', 'paint', .004);
  rod([.65, 1.7, .65], [.65, 2.26, .65], .055, steel, excavator, 'excavator-exhaust');
  // A genuinely glazed cab, with a visible seat and control levers inside its frame.
  const cab = new T.Group(); cab.name = 'excavator-cab'; cab.position.set(-.50, 1.54, -.30); excavator.add(cab);
  box([.93, .12, 1.43], steel, [0, -.02, 0], cab, 'excavator-cab-floor', 'metal', .035);
  box([1.02, .12, 1.51], yellow, [0, 1.39, 0], cab, 'excavator-cab-roof', 'paint', .055);
  for (const x of [-.44, .44]) for (const z of [-.65, .65]) box([.055, 1.34, .055], steel, [x, .69, z], cab, 'excavator-cab-pillar', 'metal', .012);
  for (const x of [-.44, .44]) box([.022, 1.17, 1.23], '#9BAFAD', [x, .75, 0], cab, 'excavator-cab-side-glass', 'glass', .008).castShadow = false;
  for (const z of [-.65, .65]) box([.81, 1.17, .022], '#9BAFAD', [0, .75, z], cab, 'excavator-cab-windscreen', 'glass', .008).castShadow = false;
  box([.48, .13, .47], rubber, [0, .42, .17], cab, 'excavator-seat', 'rubber', .07);
  box([.47, .57, .12], rubber, [0, .74, .40], cab, 'excavator-seat-back', 'rubber', .06);
  for (const x of [-.27, .27]) rod([x, .37, -.11], [x, .68, -.23], .018, steel, cab, 'excavator-controls');
  box([.045, .07, .12], steel, [-.48, .68, -.37], cab, 'excavator-door-handle', 'metal', .012);
  const lamp = material('#F4E7BD', 'paint').clone(); lamp.emissive.set('#DFC184'); lamp.emissiveIntensity = .15; materials.add(lamp);
  for (const x of [-.31, .31]) box([.16, .08, .05], lamp, [x, 1.28, -.77], cab, 'excavator-work-light', 'paint', .015);

  const pivot = [.64, 1.66, -.58], elbow = [.64, 3.68, -2.12], wrist = [.64, .68, -3.91];
  for (const offset of [-.17, .17]) {
    const shift = p => [p[0] + offset, p[1], p[2]];
    beam(shift(pivot), shift(elbow), .105, .34, yellow, excavator, 'excavator-boom-plate');
    beam(shift(elbow), shift(wrist), .10, .28, yellow, excavator, 'excavator-dipper-plate');
  }
  for (const point of [pivot, elbow, wrist]) pin(point, .14, .59, excavator);
  hydraulic([.64, 1.35, -.23], [.64, 3.02, -1.55], excavator);
  hydraulic([.64, 3.73, -1.84], [.64, 1.65, -3.38], excavator);
  hydraulic([.64, 1.95, -3.13], [.64, .72, -4.05], excavator);
  curve([[.41, 1.52, -.35], [.41, 2.82, -1.49], [.41, 3.77, -2.11], [.41, 2.53, -2.9]], rubber, .026, excavator, 'excavator-hydraulic-hose');
  const bucket = new T.Group(); bucket.name = 'excavator-bucket'; bucket.position.set(.64, -.02, -3.92); excavator.add(bucket);
  const scoop = new T.Shape(); scoop.moveTo(-.35, .58); scoop.quadraticCurveTo(-.66, .1, -.32, .04); scoop.quadraticCurveTo(.18, -.03, .67, .10);
  scoop.lineTo(.59, .18); scoop.quadraticCurveTo(.15, .08, -.30, .13); scoop.quadraticCurveTo(-.48, .17, -.25, .54); scoop.closePath();
  const scoopGeometry = new T.ExtrudeGeometry(scoop, { depth: .85, bevelEnabled: true, bevelSize: .015, bevelThickness: .015, bevelSegments: 2, curveSegments: 12 });
  scoopGeometry.rotateY(Math.PI / 2); scoopGeometry.translate(-.425, 0, 0);
  mesh(scoopGeometry, '#615E50', [0, 0, 0], bucket, 'excavator-hollow-bucket', 'metal');
  const cheek = new T.Shape(); cheek.moveTo(-.35, .57); cheek.quadraticCurveTo(-.67, .1, -.32, .04); cheek.quadraticCurveTo(.2, 0, .67, .10); cheek.lineTo(.27, .48); cheek.closePath();
  const cheekGeometry = new T.ExtrudeGeometry(cheek, { depth: .035, bevelEnabled: false, curveSegments: 10 }); cheekGeometry.rotateY(Math.PI / 2);
  for (const x of [-.43, .40]) mesh(cheekGeometry, '#706A56', [x, 0, 0], bucket, 'excavator-bucket-cheek', 'metal');
  for (let i = 0; i < 5; i++) box([.105, .075, .25], '#8C8774', [-.32 + i * .16, .10, -.70], bucket, 'excavator-bucket-tooth', 'metal', .015);

  // A few stockpiles and safety objects make this a working site, not a vehicle display.
  const pile = mesh(new T.IcosahedronGeometry(1, 2), '#8C795B', [-16.6, heightAt(-16.6, -2.7) + .27, -2.7], root, 'construction-earth-pile', 'gravel'); pile.scale.set(1.1, .48, 1.5);
  for (let row = 0; row < 2; row++) for (let i = 0; i < 4; i++) box([1.15, .12, .18], '#958570', [-16.8, heightAt(-16.8, 3.4) + .10 + row * .23, 3.1 + i * .23], root, 'construction-pallet-slats', 'wood', .01);
  for (let i = 0; i < 8; i++) box([.37, .18, .48], '#ACA594', [-17.1 + i % 2 * .42, heightAt(-16.8, 3.4) + .47 + Math.floor(i / 4) * .19, 3.3 + Math.floor(i % 4 / 2) * .53], root, 'construction-stacked-block', 'stone', .012);
  for (const [x, z] of [[-11.65, 4.8], [-12.3, 5.5], [-17.3, 5.0]]) {
    const cone = new T.Group(); cone.name = 'construction-traffic-cone'; cone.position.set(x, heightAt(x, z), z); root.add(cone);
    box([.43, .055, .43], rubber, [0, .035, 0], cone, 'construction-cone-foot', 'rubber', .04);
    mesh(new T.ConeGeometry(.16, .45, 16), '#BC663D', [0, .28, 0], cone, 'construction-cone-body');
    mesh(new T.CylinderGeometry(.065, .105, .12, 16), '#E8E4D5', [0, .34, 0], cone, 'construction-cone-reflector');
  }
  const stripes = canvasTexture((ctx, n) => {
    ctx.fillStyle = '#E8DBC0'; ctx.fillRect(0, 0, n, n); ctx.scale(1, 9);
    ctx.fillStyle = '#745A36'; for (let x = -40; x < n + 40; x += 54) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 25, 0); ctx.lineTo(x - 4, n / 9); ctx.lineTo(x - 29, n / 9); ctx.fill(); }
  });
  const stripeMaterial = material('#FFFFFF', 'paint').clone(); stripeMaterial.map = stripes; stripeMaterial.roughness = .8; materials.add(stripeMaterial);
  for (const z of [-1.6, 1.1, 3.8]) {
    const barrier = new T.Group(); barrier.name = 'construction-safety-barrier'; barrier.position.set(-11.45, heightAt(-11.45, z), z); barrier.rotation.y = Math.PI / 2; root.add(barrier);
    for (const x of [-.80, .80]) { box([.065, 1.12, .065], '#848B87', [x, .56, 0], barrier, 'construction-barrier-upright', 'metal', .008); box([.12, .055, .65], steel, [x, .035, 0], barrier, 'construction-barrier-foot', 'metal', .012); }
    for (const y of [.48, .93]) box([1.85, .20, .055], stripeMaterial, [0, y, .01], barrier, 'construction-striped-rail', 'paint', .012);
  }
  const sign = new T.Group(); sign.name = 'construction-notice'; sign.position.set(-12.3, heightAt(-12.3, 5.2), 5.2); sign.rotation.y = .62; root.add(sign);
  for (const x of [-.76, .76]) box([.07, 1.70, .07], '#8C8877', [x, .85, 0], sign, 'construction-notice-post', 'wood', .008);
  box([2.04, 1.18, .065], '#454B44', [0, 1.4, 0], sign, 'construction-notice-board', 'paint', .03);
  const notice = canvasTexture((ctx, n) => {
    ctx.scale(1, 1.78); const h = n / 1.78;
    ctx.fillStyle = '#E1DBC7'; ctx.fillRect(0, 0, n, h); ctx.fillStyle = '#BB9250'; ctx.fillRect(0, 0, n, 23);
    ctx.fillStyle = '#343B37'; ctx.font = 'bold 10px sans-serif'; ctx.fillText('SINIVERSE / CHANTIER EN COURS', 15, 16);
    ctx.font = 'bold 25px sans-serif'; ctx.fillText('UN MONDE', 16, 63); ctx.fillText('EN CONSTRUCTION.', 16, 93);
    ctx.font = '10px sans-serif'; ctx.fillText('De nouvelles idées prennent forme.', 16, 123);
  }, 256);
  const noticeMaterial = material('#FFFFFF', 'paper').clone(); noticeMaterial.map = notice; materials.add(noticeMaterial);
  mesh(new T.PlaneGeometry(1.98, 1.11), noticeMaterial, [0, 1.4, .037], sign, 'construction-notice-lettering').castShadow = false;

  // A distant tower crane. The lattice is instanced into three draws, with no animation loop.
  const crane = new T.Group(); crane.name = 'construction-tower-crane'; crane.position.set(-5.2, heightAt(-5.2, -22), -22); crane.rotation.y = Math.PI * 1.15; root.add(crane);
  for (const x of [-1, 1]) for (const z of [-1, 1]) box([1.12, .43, 1.12], concrete, [x * .9, .21, z * .9], crane, 'crane-concrete-footing', 'stone', .045);
  const chords = [], braces = [], rigging = [];
  for (const x of [-.55, .55]) for (const z of [-.55, .55]) chords.push([[x, .35, z], [x, 12.7, z]]);
  for (let y = .55; y < 12; y += 1.95) for (const side of [-1, 1]) {
    chords.push([[-.55, y, side * .55], [.55, y, side * .55]], [[side * .55, y, -.55], [side * .55, y, .55]]);
    braces.push([[-.55, y, side * .55], [.55, y + 1.9, side * .55]], [[.55, y, side * .55], [-.55, y + 1.9, side * .55]], [[side * .55, y, -.55], [side * .55, y + 1.9, .55]], [[side * .55, y, .55], [side * .55, y + 1.9, -.55]]);
  }
  for (let x = -4.5; x < 15.7; x += 1.5) {
    const end = Math.min(x + 1.5, 15.7);
    for (const z of [-.48, .48]) { chords.push([[x, 12.55, z], [end, 12.55, z]]); braces.push([[x, 12.55, z], [end, 13.35, 0]], [[end, 12.55, z], [x, 13.35, 0]]); }
    chords.push([[x, 13.35, 0], [end, 13.35, 0]]); braces.push([[x, 12.55, -.48], [x, 12.55, .48]]);
  }
  for (const x of [-4.2, 5.5, 13.5]) rigging.push([[0, 15.1, 0], [x, 13.35, 0]]);
  chords.push([[0, 12.7, 0], [0, 15.15, 0]]);
  function lattice(lines, width, color, name) {
    const value = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), material(color, 'paint'), lines.length); value.name = name;
    lines.forEach(([a, b], i) => { const start = vector(a), end = vector(b), direction = end.clone().sub(start); matrix.compose(start.add(end).multiplyScalar(.5), rotation.setFromUnitVectors(up, direction.clone().normalize()), new T.Vector3(width, direction.length(), width)); value.setMatrixAt(i, matrix); });
    value.castShadow = false; crane.add(value);
  }
  lattice(chords, .12, yellow, 'crane-lattice-chords'); lattice(braces, .045, '#B99657', 'crane-lattice-diagonals'); lattice(rigging, .022, '#626C67', 'crane-support-cables');
  for (let i = 0; i < 4; i++) box([.46, 1.0, .92], '#8C9187', [-3.9 + i * .48, 12.05, 0], crane, 'crane-counterweight', 'stone', .025);
  box([1.1, 1.25, 1.2], yellow, [.95, 12.0, .83], crane, 'crane-operator-cab', 'paint', .055);
  box([.9, .90, .024], '#A7BDB8', [.95, 12.08, 1.445], crane, 'crane-cab-glazing', 'glass', .012);
  const trolley = box([.55, .22, 1.08], steel, [10, 12.43, 0], crane, 'crane-trolley', 'metal', .035);
  for (const z of [-.15, .15]) rod([10, 12.3, z], [10, 5.3, z], .016, '#4E5852', crane, 'crane-hoist-rope');
  box([.38, .52, .30], yellow, [10, 5.05, 0], crane, 'crane-hook-block', 'paint', .05);
  curve([[10, 4.85, 0], [10, 4.60, 0], [10.20, 4.51, 0], [10.32, 4.69, 0]], steel, .045, crane, 'crane-hook');
  crane.traverse(node => { if (node.isMesh) node.castShadow = false; });
  root.traverse(node => { if (node.isMesh) node.userData.pickThrough = true; });
  root.updateMatrixWorld(true);
  root.traverse(node => { node.matrixAutoUpdate = false; });
  return { root, excavator, crane, trolley };
}
