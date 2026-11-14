// A metric, walkable house model. Navigation and HTML are owned by the caller.
export function buildHouse(world, apps) {
  const T = world.THREE;
  const palette = { wall: '#E8DCC7', floor: '#C8B89A', garage: '#919A92', frame: '#26392F', roof: '#52685B',
    apron: '#BBBBAE', desk: '#CDBD99', metal: '#748277', glass: '#A6C8C5', tyre: '#24332C', car: '#DB7253' };
  const root = new T.Group(); root.name = 'siniverse-house'; world.scene.add(root);
  const roof = new T.Group(); roof.name = 'house-roof'; root.add(roof);
  const shell = [], obstacles = [], materials = new Map();
  const ramp = new T.DataTexture(new Uint8Array([82, 164, 245]), 3, 1, T.RedFormat);
  ramp.colorSpace = T.NoColorSpace;
  ramp.minFilter = T.NearestFilter; ramp.magFilter = T.NearestFilter; ramp.unpackAlignment = 1; ramp.needsUpdate = true;
  function material(color, double = false) {
    const key = color + (double ? ':double' : '');
    if (!materials.has(key)) materials.set(key, new T.MeshToonMaterial({ color, gradientMap: ramp, side: double ? T.DoubleSide : T.FrontSide }));
    return materials.get(key);
  }
  function mesh(geometry, color, position = [0, 0, 0], parent = root, name = '', double = false) {
    const item = world.mesh(geometry, color, position, parent);
    item.material = material(color, double); item.name = name;
    item.castShadow = true; item.receiveShadow = true; return item;
  }
  function box(size, color, position, parent = root, name = '') {
    return mesh(new T.BoxGeometry(...size), color, position, parent, name);
  }
  function line(points, color, radius = .012, parent = root, name = '') {
    const item = world.line(points, color, radius, parent); item.material = material(color); item.name = name;
    item.castShadow = false; return item;
  }
  function quad(points, color, parent = root, name = '') {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute([...(points[0]), ...(points[1]), ...(points[2]), ...(points[0]), ...(points[2]), ...(points[3])], 3));
    geometry.computeVertexNormals(); return mesh(geometry, color, [0, 0, 0], parent, name, true);
  }
  function triangle(points, color, parent, name) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(points.flat(), 3)); geometry.computeVertexNormals();
    return mesh(geometry, color, [0, 0, 0], parent, name, true);
  }
  function obstacle(object, tag) {
    root.updateMatrixWorld(true);
    const extent = new T.Box3().setFromObject(object);
    obstacles.push({ minX: extent.min.x, maxX: extent.max.x, minZ: extent.min.z, maxZ: extent.max.z, tag });
  }
  function wallPiece(axis, fixed, from, to, bottom, top, face) {
    if (to - from < .005 || top - bottom < .005) return;
    const size = axis === 'x' ? [to - from, top - bottom, .22] : [.22, top - bottom, to - from];
    const position = axis === 'x' ? [(from + to) / 2, (bottom + top) / 2, fixed] : [fixed, (bottom + top) / 2, (from + to) / 2];
    const item = box(size, palette.wall, position, root, 'house-wall-' + face);
    item.userData.houseFace = face; shell.push(item);
    if (bottom < 1.9) obstacle(item, 'wall-' + face);
  }
  function wall(axis, fixed, from, to, openings, face) {
    let cursor = from;
    for (const opening of [...openings].sort((a, b) => a.from - b.from)) {
      wallPiece(axis, fixed, cursor, opening.from, 0, 2.8, face);
      wallPiece(axis, fixed, opening.from, opening.to, 0, opening.bottom || 0, face);
      wallPiece(axis, fixed, opening.from, opening.to, opening.top, 2.8, face);
      cursor = opening.to;
    }
    wallPiece(axis, fixed, cursor, to, 0, 2.8, face);
  }
  function frame(axis, fixed, from, to, bottom, top) {
    const width = to - from, height = top - bottom, centre = (from + to) / 2;
    const add = (size, along, y) => box(axis === 'x' ? size : [size[2], size[1], size[0]], palette.frame,
      axis === 'x' ? [along, y, fixed] : [fixed, y, along], root, 'house-opening-frame');
    add([.075, height + .075, .27], from, (bottom + top) / 2);
    add([.075, height + .075, .27], to, (bottom + top) / 2);
    add([width + .075, .075, .27], centre, top);
    if (bottom > 0) add([width + .075, .075, .27], centre, bottom);
  }
  const glazing = new T.MeshToonMaterial({ color: palette.glass, gradientMap: ramp, transparent: true, opacity: .26, depthWrite: false, side: T.DoubleSide });
  function windowPane(axis, fixed, from, to, bottom, top) {
    const size = axis === 'x' ? [to - from, top - bottom, .018] : [.018, top - bottom, to - from];
    const position = axis === 'x' ? [(from + to) / 2, (bottom + top) / 2, fixed] : [fixed, (bottom + top) / 2, (from + to) / 2];
    const item = world.box(size, palette.glass, position, root); item.material = glazing; item.name = 'house-window';
    frame(axis, fixed, from, to, bottom, top);
  }

  // All exterior ground has a purpose: approach, threshold and circulation.
  box([12.8, .12, 11.5], palette.apron, [0, -.16, 1.25], root, 'house-approach-ground');
  box([10.65, .12, 7.25], palette.frame, [0, -.08, 0], root, 'house-foundation');
  box([6.1, .06, 7.18], palette.floor, [-2.25, -.01, 0], root, 'house-office-floor');
  box([4.5, .06, 7.18], palette.garage, [3.05, -.01, 0], root, 'house-garage-floor');
  box([1.4, .045, .42], palette.frame, [-2.3, .015, 3.55], root, 'house-entry-threshold');
  box([3.9, .025, .22], palette.frame, [3.05, .015, 3.52], root, 'house-garage-threshold');
  wall('x', -3.49, -5.3, 5.3, [], 'rear');
  wall('z', 5.19, -3.6, 3.6, [], 'right');
  wall('z', -5.19, -3.6, 3.6, [{ from: -.65, to: .95, bottom: .95, top: 2.05 }], 'left');
  windowPane('z', -5.19, -.65, .95, .95, 2.05);
  wall('x', 3.49, -5.3, .8, [
    { from: -4.85, to: -3.55, bottom: .95, top: 2.05 }, { from: -3, to: -1.6, bottom: 0, top: 2.2 }
  ], 'front-office');
  windowPane('x', 3.49, -4.85, -3.55, .95, 2.05);
  frame('x', 3.49, -3, -1.6, 0, 2.2);
  wall('x', 3.49, .8, 5.3, [{ from: 1.1, to: 5.0, bottom: 0, top: 2.35 }], 'front-garage');
  frame('x', 3.49, 1.1, 5, 0, 2.35);
  wall('z', .8, -3.6, 3.6, [{ from: 1.0, to: 2.2, bottom: 0, top: 2.2 }], 'partition');
  frame('z', .8, 1.0, 2.2, 0, 2.2);
  const entry = new T.Group(); entry.name = 'house-open-entry-door'; entry.position.set(-3, 0, 3.49); entry.rotation.y = -Math.PI / 2; root.add(entry);
  box([1.32, 2.12, .065], '#AD926C', [.66, 1.06, 0], entry, 'house-entry-door-leaf');
  box([.18, .035, .05], '#C8B477', [1.12, 1.07, .065], entry, 'house-entry-door-handle');
  obstacle(entry, 'open-entry-door');
  const inner = new T.Group(); inner.name = 'house-open-inner-door'; inner.position.set(.8, 0, 1.0); inner.rotation.y = Math.PI / 2; root.add(inner);
  box([.065, 2.12, 1.12], '#C0AC87', [0, 1.06, .56], inner, 'house-inner-door-leaf');
  box([.05, .035, .16], '#C8B477', [.065, 1.07, .93], inner, 'house-inner-door-handle');
  obstacle(inner, 'open-inner-door');
  box([3.88, .10, 1.10], '#A8B0A0', [3.05, 2.56, 2.94], root, 'house-open-garage-door');
  line([[1.04, 2.5, 3.48], [1.04, 2.5, 2.3]], palette.frame, .025, root, 'house-garage-door-guide');
  line([[5.05, 2.5, 3.48], [5.05, 2.5, 2.3]], palette.frame, .025, root, 'house-garage-door-guide');

  // One pitched domestic roof and an attached lower garage roof.
  quad([[-5.55, 2.84, 3.82], [-5.55, 2.84, -3.82], [-2.25, 4.15, -3.82], [-2.25, 4.15, 3.82]], palette.roof, roof, 'house-roof-left-slope');
  quad([[-2.25, 4.15, 3.82], [-2.25, 4.15, -3.82], [1.05, 2.84, -3.82], [1.05, 2.84, 3.82]], palette.roof, roof, 'house-roof-right-slope');
  triangle([[-5.19, 2.8, 3.49], [.8, 2.8, 3.49], [-2.25, 4.03, 3.49]], palette.wall, roof, 'house-front-gable');
  triangle([[.8, 2.8, -3.49], [-5.19, 2.8, -3.49], [-2.25, 4.03, -3.49]], palette.wall, roof, 'house-rear-gable');
  box([4.8, .16, 7.62], palette.roof, [3.08, 2.94, 0], roof, 'house-garage-roof');
  line([[-5.55, 2.84, 3.82], [-2.25, 4.15, 3.82]], palette.frame, .045, roof, 'house-front-roof-edge-left');
  line([[-2.25, 4.15, 3.82], [1.05, 2.84, 3.82]], palette.frame, .045, roof, 'house-front-roof-edge-right');
  line([[-2.25, 4.15, 3.82], [-2.25, 4.15, -3.82]], palette.frame, .035, roof, 'house-roof-ridge');

  // A single functional office bench, with two distinct actual workstations.
  const desk = new T.Group(); desk.name = 'house-office-workbench'; root.add(desk);
  box([4.6, .12, 1.18], palette.desk, [-2.8, .76, -2.65], desk, 'house-desk-top');
  for (const x of [-4.98, -.62]) for (const z of [-3.14, -2.16]) box([.09, .70, .09], palette.frame, [x, .35, z], desk, 'house-desk-leg');
  const screens = {}, surfaces = {};
  function screen(id, x) {
    box([.62, .055, .38], palette.frame, [x, .855, -2.63], desk, 'house-' + id + '-screen-foot');
    box([.10, .29, .10], palette.frame, [x, .99, -2.61], desk, 'house-' + id + '-screen-stand');
    box([1.52, 1.12, .12], palette.frame, [x, 1.65, -2.57], desk, 'house-' + id + '-screen-frame');
    const face = box([1.40, 1.0, .018], '#152B27', [x, 1.65, -2.499], desk, 'house-' + id + '-screen');
    const idle = new T.Group(); idle.name = id + '-idle-drawing'; face.add(idle); face.userData.idle = idle;
    screens[id] = face; surfaces[id] = { position: [x, 1.65, -2.475], width: 1.40, height: 1.0, rotationY: 0 };
    box([.67, .035, .21], palette.frame, [x, .842, -2.21], desk, 'house-' + id + '-keyboard');
    for (const z of [-2.26, -2.21, -2.16]) line([[x - .28, .863, z], [x + .28, .863, z]], '#899B8A', .004, desk);
    // Seats are tucked under the workbench, within its collision footprint.
    mesh(new T.CylinderGeometry(.23, .25, .075, 9), '#657C69', [x, .445, -2.31], desk, 'house-tucked-seat');
    for (const dx of [-.15, .15]) for (const dz of [-.12, .12]) box([.04, .40, .04], palette.frame, [x + dx, .20, -2.31 + dz], desk, 'house-seat-leg');
    return idle;
  }
  const finance = screen('finapp', -4);
  line([[-.59, -.33, .014], [-.30, -.26, .014], [-.03, -.18, .014], [.22, .06, .014], [.58, .33, .014]], apps.finapp?.color || '#3866F2', .022, finance, 'house-finapp-scenario-a');
  line([[-.59, -.33, .018], [-.30, -.20, .018], [-.03, -.09, .018], [.22, -.03, .018], [.58, .12, .018]], '#9DB9F9', .015, finance, 'house-finapp-scenario-b');
  line([[-.61, .36, .010], [-.61, -.36, .010], [.61, -.36, .010]], '#647D78', .008, finance, 'house-finapp-axis');
  const hardware = screen('branchlab', -1.7);
  for (const x of [-.42, .42]) line([[x - .13, -.12, .014], [x - .13, .13, .014], [x + .13, .13, .014], [x + .13, -.12, .014], [x - .13, -.12, .014]], '#B7B6D8', .013, hardware);
  line([[-.28, 0, .02], [.28, 0, .02]], apps.branchlab?.color || '#9E78D7', .023, hardware, 'house-branchlab-screen-link');
  box([.34, .65, .48], palette.frame, [-.83, 1.145, -2.78], desk, 'house-branchlab-computer');
  box([.08, .035, .024], '#596F62', [-.83, 1.24, -2.528], desk, 'house-branchlab-port');
  line([[-.83, 1.24, -2.505], [-.84, 1.08, -2.30], [-1.12, .89, -2.20], [-1.35, .91, -2.25], [-1.22, 1.16, -2.48]], apps.branchlab?.color || '#9E78D7', .022, desk, 'house-branchlab-real-cable');
  obstacle(desk, 'office-workstations');

  // Garage record: reachable from the car through the clear front aisle.
  const log = box([.065, 1.10, 1.28], '#B6A37C', [.969, 1.55, 2.9], root, 'house-garapp-record-cover');
  box([.018, 1.0, 1.18], '#F1E9D5', [1.016, 1.55, 2.9], root, 'house-garapp-record-page');
  for (let row = 0; row < 4; row++) line([[1.03, 1.82 - row * .18, 2.47], [1.03, 1.82 - row * .18, 3.30]], row === 0 ? palette.car : '#B5B39F', .008, root, 'house-garapp-record-rule');
  surfaces.garapp = { position: [1.045, 1.55, 2.9], width: 1.16, height: .96, rotationY: Math.PI / 2,
    camera: { position: [3.25, 1.65, 2.9], target: [1.045, 1.55, 2.9] } };
  log.userData.role = 'vehicle-record';

  const car = new T.Group(); car.name = 'house-parked-car'; car.position.set(3.1, 0, -.3); root.add(car);
  box([1.72, .48, 4.08], palette.car, [0, .61, 0], car, 'car-body');
  box([1.68, .10, .12], palette.frame, [0, .46, 2.04], car, 'car-front-bumper');
  box([1.68, .10, .12], palette.frame, [0, .46, -2.04], car, 'car-rear-bumper');
  quad([[-.78, .85, .78], [.78, .85, .78], [.63, 1.48, .30], [-.63, 1.48, .30]], palette.car, car, 'car-cabin-front');
  quad([[-.63, 1.48, .30], [.63, 1.48, .30], [.63, 1.46, -.96], [-.63, 1.46, -.96]], palette.car, car, 'car-roof');
  quad([[-.63, 1.46, -.96], [.63, 1.46, -.96], [.78, .85, -1.50], [-.78, .85, -1.50]], palette.car, car, 'car-cabin-rear');
  for (const side of [-1, 1]) {
    quad([[side * .78, .85, -1.50], [side * .78, .85, .78], [side * .63, 1.48, .30], [side * .63, 1.46, -.96]], palette.car, car, 'car-cabin-side');
    quad([[side * .765, .98, -1.28], [side * .765, .98, .59], [side * .664, 1.39, .24], [side * .664, 1.38, -.89]], '#9DBBB9', car, 'car-side-glass');
    line([[side * .77, .98, -.32], [side * .665, 1.40, -.32]], palette.frame, .026, car, 'car-window-pillar');
    line([[side * .872, .40, -.45], [side * .872, .78, -.45]], '#A45943', .009, car, 'car-door-seam');
    box([.025, .045, .20], palette.frame, [side * .88, .74, .12], car, 'car-door-handle');
    for (const z of [-1.23, 1.24]) {
      const tyre = mesh(new T.CylinderGeometry(.32, .32, .19, 14), palette.tyre, [side * .79, .32, z], car, 'car-wheel'); tyre.rotation.z = Math.PI / 2;
      const hub = mesh(new T.CylinderGeometry(.15, .15, .20, 10), '#AFB9AC', [side * .79, .32, z], car, 'car-wheel-hub'); hub.rotation.z = Math.PI / 2;
    }
    box([.30, .13, .025], '#F1EAC6', [side * .52, .67, 2.055], car, 'car-headlight');
    box([.24, .14, .025], '#A94A39', [side * .56, .66, -2.055], car, 'car-rear-light');
  }
  quad([[-.69, .99, .70], [.69, .99, .70], [.57, 1.39, .39], [-.57, 1.39, .39]], '#A7C4C2', car, 'car-windscreen');
  quad([[-.68, 1.0, -1.39], [.68, 1.0, -1.39], [.56, 1.37, -1.065], [-.56, 1.37, -1.065]], '#A7C4C2', car, 'car-rear-window');
  obstacle(car, 'parked-car');

  // Toon materials need one soft daylight direction, not decorative lamp meshes.
  const lights = world.scene.children.filter(item => item.isLight);
  for (const light of lights) {
    if (light.isHemisphereLight) { light.intensity = 2.5; light.groundColor.set('#B4AB94'); }
    if (light.isDirectionalLight) light.intensity = light.position.y > 20 ? 2.05 : .65;
  }
  const sun = lights.find(item => item.isDirectionalLight && item.position.y > 20);
  if (world.renderer?.shadowMap && sun) {
    world.renderer.shadowMap.enabled = true; world.renderer.shadowMap.type = T.PCFSoftShadowMap;
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: .5, far: 90 });
    sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -.0007; sun.shadow.normalBias = .065;
  }
  world.cleanup?.(() => { for (const item of materials.values()) item.dispose(); glazing.dispose(); ramp.dispose(); });
  root.updateMatrixWorld(true);
  return { roof, entry, car, screens, surfaces, shell, obstacles,
    bounds: { minX: -6.4, maxX: 6.4, minZ: -4.5, maxZ: 7.0 } };
}
