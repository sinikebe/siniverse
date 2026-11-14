// A small, tangible house. All coordinates are metres; navigation belongs to Plan.
export function buildHouse(world, apps) {
  const T = world.THREE;
  const P = { plaster: '#E7D8BC', floor: '#B9976E', frame: '#30463D', roof: '#59735B',
    garage: '#AAAFA0', metal: '#77867B', cream: '#FFF1D5', paper: '#F5E7C8',
    glass: '#A8C5C6', tyre: '#29332F', car: '#D96D4B', wood: '#BD9161' };
  const root = new T.Group(); root.name = 'siniverse-house'; world.scene.add(root);
  const roof = new T.Group(); roof.name = 'house-roof'; root.add(roof);
  const shell = [], obstacles = [], textures = [], materials = new Set();
  const screens = {}, surfaces = {}, previews = {}, anchors = {};
  const cache = new Map();
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const hash = (x, y = 0) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };

  function canvasTexture(draw, size = 256, color = true) {
    if (!globalThis.document) {
      const texture = new T.DataTexture(new Uint8Array(color ? [255, 255, 255, 255] : [128, 128, 128, 255]), 1, 1, T.RGBAFormat);
      texture.colorSpace = color ? T.SRGBColorSpace : T.NoColorSpace; texture.needsUpdate = true;
      textures.push(texture); return texture;
    }
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d'); draw(ctx, size);
    const texture = new T.CanvasTexture(canvas); texture.colorSpace = color ? T.SRGBColorSpace : T.NoColorSpace;
    texture.wrapS = texture.wrapT = T.RepeatWrapping; texture.anisotropy = 4;
    textures.push(texture); return texture;
  }
  const wood = canvasTexture((ctx, n) => {
    const pixels = ctx.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const wave = Math.sin(y * .32 + Math.sin(x * .024) * 1.8) * 5 + Math.sin(y * 1.87 + x * .008) * 2;
      const value = clamp(231 + wave + hash(x, y) * 10, 0, 255), i = (y * n + x) * 4;
      pixels.data[i] = value; pixels.data[i + 1] = value - 3; pixels.data[i + 2] = value - 7; pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
  });
  const grain = canvasTexture((ctx, n) => {
    const pixels = ctx.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4, value = 121 + Math.round(hash(x, y) * 16);
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value; pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
  }, 128, false);
  const contactMap = canvasTexture((ctx, n) => {
    const gradient = ctx.createRadialGradient(n / 2, n / 2, n * .08, n / 2, n / 2, n * .5);
    gradient.addColorStop(0, 'rgba(36,31,23,.65)'); gradient.addColorStop(.45, 'rgba(36,31,23,.33)');
    gradient.addColorStop(.8, 'rgba(36,31,23,.08)'); gradient.addColorStop(1, 'rgba(36,31,23,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, n, n);
  }, 128);
  function material(color, kind = 'paint') {
    const key = color + ':' + kind;
    if (cache.has(key)) return cache.get(key);
    const options = { color, roughness: .65, metalness: .025 };
    if (kind === 'plaster') Object.assign(options, { roughness: .96, bumpMap: grain, bumpScale: .013 });
    if (kind === 'wood') Object.assign(options, { map: wood, roughness: .54, bumpMap: grain, bumpScale: .006 });
    if (kind === 'metal') Object.assign(options, { metalness: .45, roughness: .36 });
    if (kind === 'rubber') Object.assign(options, { roughness: .92, metalness: 0 });
    if (kind === 'paper') Object.assign(options, { roughness: .95, metalness: 0 });
    if (kind === 'glass') Object.assign(options, { transparent: true, opacity: .44, roughness: .15, metalness: .18, depthWrite: false, side: T.DoubleSide });
    const value = kind === 'car' ? new T.MeshPhysicalMaterial({ ...options, roughness: .32, clearcoat: .7, clearcoatRoughness: .3 }) : new T.MeshStandardMaterial(options);
    materials.add(value); cache.set(key, value); return value;
  }
  function basic(color, { map = null, opacity = 1 } = {}) {
    const value = new T.MeshBasicMaterial({ color, map, transparent: opacity < 1 || Boolean(map), opacity, depthWrite: !map, toneMapped: false });
    materials.add(value); return value;
  }
  function mesh(geometry, color, position = [0, 0, 0], parent = root, name = '', kind = 'paint') {
    const item = new T.Mesh(geometry, typeof color === 'string' ? material(color, kind) : color);
    item.position.set(...position); item.name = name; item.castShadow = true; item.receiveShadow = true; parent.add(item); return item;
  }
  // The central face is stretched; the remaining samples describe a rounded edge.
  // This keeps genuine corner normals and a small geometry, including at close range.
  function roundedGeometry(size, radius = .035, segments = 5) {
    const r = Math.min(radius, ...size.map(v => v * .45)), half = size.map(v => v / 2 - r);
    const geometry = new T.BoxGeometry(1, 1, 1, segments, segments, segments);
    const position = geometry.attributes.position, normal = geometry.attributes.normal;
    for (let i = 0; i < position.count; i++) {
      const p = [position.getX(i), position.getY(i), position.getZ(i)];
      const n = p.map(v => v - Math.sign(v) * .5 / segments), length = Math.hypot(...n);
      for (let axis = 0; axis < 3; axis++) n[axis] /= length;
      position.setXYZ(i, ...p.map((v, axis) => Math.sign(v) * half[axis] + n[axis] * r));
      normal.setXYZ(i, ...n);
    }
    geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
  }
  function box(size, color, position, parent = root, name = '', kind = 'paint', radius = .025) {
    return mesh(roundedGeometry(size, radius), color, position, parent, name, kind);
  }
  function curve(points, color, radius = .012, parent = root, name = '', smooth = true, kind = 'paint') {
    const path = smooth && points.length > 2 ? new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p))) : new T.CurvePath();
    if (!smooth || points.length <= 2) for (let i = 1; i < points.length; i++) path.add(new T.LineCurve3(new T.Vector3(...points[i - 1]), new T.Vector3(...points[i])));
    const item = mesh(new T.TubeGeometry(path, Math.max(8, points.length * 9), radius, 8, false), color, [0, 0, 0], parent, name, kind);
    item.castShadow = false; return { item, path };
  }
  function obstacle(object, tag) {
    root.updateMatrixWorld(true); const extent = new T.Box3().setFromObject(object);
    obstacles.push({ minX: extent.min.x, maxX: extent.max.x, minZ: extent.min.z, maxZ: extent.max.z, tag });
  }
  function contact(position, size, opacity = .45, parent = root) {
    const value = basic('#51402F', { map: contactMap, opacity });
    const item = mesh(new T.PlaneGeometry(...size), value, position, parent, 'house-contact-shadow');
    item.rotation.x = -Math.PI / 2; item.castShadow = item.receiveShadow = false; item.renderOrder = 1; return item;
  }
  function roundedShape(width, height, radius) {
    const x = -width / 2, y = -height / 2, r = Math.min(radius, width / 2, height / 2), s = new T.Shape();
    s.moveTo(x + r, y); s.lineTo(x + width - r, y); s.quadraticCurveTo(x + width, y, x + width, y + r);
    s.lineTo(x + width, y + height - r); s.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    s.lineTo(x + r, y + height); s.quadraticCurveTo(x, y + height, x, y + height - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
  }

  // Continuous wall contours; door notches and window holes are real geometry.
  function wall(axis, fixed, from, to, openings, face) {
    const shape = new T.Shape(), doors = openings.filter(o => !o.bottom).sort((a, b) => a.from - b.from);
    shape.moveTo(from, .02);
    for (const door of doors) { shape.lineTo(door.from, .02); shape.lineTo(door.from, door.top); shape.lineTo(door.to, door.top); shape.lineTo(door.to, .02); }
    shape.lineTo(to, .02); shape.lineTo(to, 2.8); shape.lineTo(from, 2.8); shape.closePath();
    for (const opening of openings.filter(o => o.bottom)) {
      const hole = new T.Path(); hole.moveTo(opening.from, opening.bottom); hole.lineTo(opening.from, opening.top);
      hole.lineTo(opening.to, opening.top); hole.lineTo(opening.to, opening.bottom); hole.closePath(); shape.holes.push(hole);
    }
    const geometry = new T.ExtrudeGeometry(shape, { depth: .18, bevelEnabled: true, bevelSize: .02, bevelThickness: .02, bevelSegments: 2, curveSegments: 4, steps: 1 });
    geometry.translate(0, 0, -.09); if (axis === 'z') geometry.rotateY(-Math.PI / 2);
    const item = mesh(geometry, P.plaster, axis === 'x' ? [0, 0, fixed] : [fixed, 0, 0], root, 'house-wall-' + face, 'plaster');
    item.userData.houseFace = face; shell.push(item);
    let cursor = from - .02;
    for (const opening of [...openings].sort((a, b) => a.from - b.from)) {
      record(cursor, opening.from + .02); if (opening.bottom) record(opening.from + .02, opening.to - .02); cursor = opening.to - .02;
    }
    record(cursor, to + .02);
    function record(a, b) {
      if (b <= a) return;
      obstacles.push(axis === 'x' ? { minX: a, maxX: b, minZ: fixed - .11, maxZ: fixed + .11, tag: 'wall-' + face }
        : { minX: fixed - .11, maxX: fixed + .11, minZ: a, maxZ: b, tag: 'wall-' + face });
    }
  }
  function frame(axis, fixed, from, to, bottom, top) {
    const add = (size, along, y) => box(axis === 'x' ? size : [size[2], size[1], size[0]], P.frame,
      axis === 'x' ? [along, y, fixed] : [fixed, y, along], root, 'house-opening-frame', 'paint', .025);
    add([.09, top - bottom + .10, .29], from, (bottom + top) / 2); add([.09, top - bottom + .10, .29], to, (bottom + top) / 2);
    add([to - from + .09, .09, .29], (from + to) / 2, top);
    if (bottom) add([to - from + .09, .09, .31], (from + to) / 2, bottom);
  }
  function windowPane(axis, fixed, from, to, bottom, top) {
    const glass = box(axis === 'x' ? [to - from - .08, top - bottom - .08, .018] : [.018, top - bottom - .08, to - from - .08], P.glass,
      axis === 'x' ? [(from + to) / 2, (bottom + top) / 2, fixed] : [fixed, (bottom + top) / 2, (from + to) / 2], root, 'house-window', 'glass', .005);
    glass.castShadow = false; frame(axis, fixed, from, to, bottom, top);
  }

  box([12.8, .16, 11.5], '#C9C3AE', [0, -.18, 1.25], root, 'house-approach-ground', 'plaster', .075);
  box([10.65, .16, 7.25], P.frame, [0, -.09, 0], root, 'house-foundation', 'paint', .055);
  box([6.1, .06, 7.18], P.floor, [-2.25, -.01, 0], root, 'house-office-floor', 'wood', .018);
  box([4.5, .06, 7.18], P.garage, [3.05, -.01, 0], root, 'house-garage-floor', 'plaster', .018);
  box([1.4, .045, .42], '#7C806A', [-2.3, .015, 3.55], root, 'house-entry-threshold', 'paint', .018);
  box([3.9, .025, .22], '#7C806A', [3.05, .015, 3.52], root, 'house-garage-threshold', 'metal', .01);
  wall('x', -3.49, -5.3, 5.3, [], 'rear'); wall('z', 5.19, -3.6, 3.6, [], 'right');
  wall('z', -5.19, -3.6, 3.6, [{ from: -.65, to: .95, bottom: .95, top: 2.05 }], 'left');
  windowPane('z', -5.19, -.65, .95, .95, 2.05);
  wall('x', 3.49, -5.3, .8, [{ from: -4.85, to: -3.55, bottom: .95, top: 2.05 }, { from: -3, to: -1.6, top: 2.2 }], 'front-office');
  windowPane('x', 3.49, -4.85, -3.55, .95, 2.05); frame('x', 3.49, -3, -1.6, 0, 2.2);
  wall('x', 3.49, .8, 5.3, [{ from: 1.1, to: 5, top: 2.35 }], 'front-garage'); frame('x', 3.49, 1.1, 5, 0, 2.35);
  wall('z', .8, -3.6, 3.6, [{ from: 1, to: 2.2, top: 2.2 }], 'partition'); frame('z', .8, 1, 2.2, 0, 2.2);

  const entry = new T.Group(); entry.name = 'house-open-entry-door'; entry.position.set(-3, 0, 3.49); entry.rotation.y = -Math.PI / 2; root.add(entry);
  box([1.32, 2.12, .085], P.wood, [.66, 1.06, 0], entry, 'house-entry-door-leaf', 'wood', .03);
  const inner = new T.Group(); inner.name = 'house-open-inner-door'; inner.position.set(.8, 0, 1); inner.rotation.y = Math.PI / 2; root.add(inner);
  box([.085, 2.12, 1.12], '#C6AA7E', [0, 1.06, .56], inner, 'house-inner-door-leaf', 'wood', .03);
  for (const [parent, position, size] of [[entry, [1.10, 1.06, .07], [.20, .045, .055]], [inner, [.07, 1.06, .91], [.055, .045, .20]]])
    box(size, '#BEA56E', position, parent, 'house-door-lever', 'metal', .018);
  obstacle(entry, 'open-entry-door'); obstacle(inner, 'open-inner-door');
  box([3.88, .12, 1.10], '#C1C6AF', [3.05, 2.56, 2.94], root, 'house-open-garage-door', 'paint', .04);
  for (const x of [1.04, 5.05]) curve([[x, 2.5, 3.48], [x, 2.5, 2.3]], P.metal, .026, root, 'house-garage-door-guide');

  const pitch = Math.atan2(1.31, 3.30), length = Math.hypot(1.31, 3.30);
  const leftRoof = box([length, .18, 7.66], P.roof, [-3.90, 3.495, 0], roof, 'house-roof-left-slope', 'paint', .055); leftRoof.rotation.z = pitch;
  const rightRoof = box([length, .18, 7.66], P.roof, [-.60, 3.495, 0], roof, 'house-roof-right-slope', 'paint', .055); rightRoof.rotation.z = -pitch;
  curve([[-2.25, 4.16, 3.85], [-2.25, 4.16, -3.85]], '#657D62', .095, roof, 'house-roof-ridge');
  function gable(z) {
    const shape = new T.Shape(); shape.moveTo(-5.19, 2.78); shape.lineTo(.8, 2.78); shape.lineTo(-2.25, 4.03); shape.closePath();
    const geometry = new T.ExtrudeGeometry(shape, { depth: .16, bevelEnabled: true, bevelSize: .015, bevelThickness: .015, bevelSegments: 2, steps: 1 });
    geometry.translate(0, 0, -.08); mesh(geometry, P.plaster, [0, 0, z], roof, 'house-gable', 'plaster');
  }
  gable(3.49); gable(-3.49);
  box([4.85, .20, 7.66], P.roof, [3.08, 2.97, 0], roof, 'house-garage-roof', 'paint', .07);
  for (const z of [-3.82, 3.82]) {
    curve([[-5.55, 2.82, z], [-2.25, 4.15, z]], P.frame, .055, roof, 'house-roof-eave');
    curve([[-2.25, 4.15, z], [1.05, 2.82, z]], P.frame, .055, roof, 'house-roof-eave');
  }

  const desk = new T.Group(); desk.name = 'house-office-workbench'; root.add(desk);
  box([4.6, .13, 1.18], P.wood, [-2.8, .76, -2.65], desk, 'house-desk-top', 'wood', .055);
  for (const x of [-4.98, -.62]) for (const z of [-3.14, -2.16]) box([.09, .70, .09], P.frame, [x, .35, z], desk, 'house-desk-leg', 'metal', .022);
  contact([-2.8, .024, -2.65], [4.9, 1.9], .40);
  function keyboard(x) {
    box([.69, .035, .24], '#5D6D61', [x, .844, -2.21], desk, 'house-keyboard', 'paint', .025);
    const keys = new T.InstancedMesh(roundedGeometry([.052, .012, .043], .006, 3), material('#B8C2AE'), 36);
    keys.name = 'house-keycaps'; const matrix = new T.Matrix4(); let index = 0;
    for (let row = 0; row < 3; row++) for (let col = 0; col < 12; col++) {
      matrix.makeTranslation(x - .30 + col * .055, .868, -2.28 + row * .061); keys.setMatrixAt(index++, matrix);
    }
    keys.castShadow = false; keys.receiveShadow = true; desk.add(keys);
  }
  function screen(id, x) {
    box([.60, .045, .38], '#7A8B7D', [x, .85, -2.63], desk, 'house-' + id + '-screen-foot', 'metal', .035);
    box([.10, .29, .11], '#708477', [x, .99, -2.61], desk, 'house-' + id + '-screen-stand', 'metal', .03);
    box([1.54, 1.14, .135], P.frame, [x, 1.65, -2.57], desk, 'house-' + id + '-screen-frame', 'paint', .065);
    const face = mesh(new T.ShapeGeometry(roundedShape(1.4, 1, .035), 5), basic('#142D29'), [x, 1.65, -2.499], desk, 'house-' + id + '-screen');
    face.castShadow = face.receiveShadow = false;
    const idle = new T.Group(); idle.name = id + '-idle-drawing'; face.add(idle); face.userData.idle = idle;
    const accent = mesh(new T.PlaneGeometry(1.14, .008), basic(apps[id]?.color || '#6789CD'), [x, 1.125, -2.495], desk, 'house-' + id + '-active-edge'); accent.castShadow = false;
    previews[id] = { idle, accent }; screens[id] = face;
    surfaces[id] = { position: [x, 1.65, -2.475], width: 1.4, height: 1, rotationY: 0 };
    anchors[id] = { position: [...surfaces[id].position], normal: [0, 0, 1], label: [x, 2.34, -2.47], room: 'bureau' };
    keyboard(x);
    mesh(new T.CylinderGeometry(.24, .25, .075, 32), '#8A9B7E', [x, .445, -2.31], desk, 'house-tucked-seat');
    for (const dx of [-.15, .15]) for (const dz of [-.12, .12]) box([.04, .40, .04], P.frame, [x + dx, .20, -2.31 + dz], desk, 'house-seat-leg', 'metal', .012);
    return idle;
  }
  const finance = screen('finapp', -4), financeInk = basic('#89B9F1'), financeOther = basic('#C1DACB');
  const graphA = curve([[-.57, -.29, .01], [-.30, -.22, .01], [-.03, -.12, .01], [.22, .09, .01], [.57, .31, .01]], financeInk, .014, finance, 'house-finapp-scenario-a').item;
  curve([[-.57, -.29, .014], [-.30, -.17, .014], [-.03, -.07, .014], [.22, -.01, .014], [.57, .12, .014]], financeOther, .011, finance, 'house-finapp-scenario-b');
  curve([[-.60, .35, .005], [-.60, -.34, .005], [.60, -.34, .005]], basic('#55756A'), .004, finance, 'house-finapp-axis', false);
  previews.finapp.graph = graphA;
  const hardware = screen('branchlab', -1.7);
  for (const x of [-.42, .42]) {
    const symbol = mesh(new T.ShapeGeometry(roundedShape(.28, .23, .055), 5), basic('#ADB9CE'), [x, 0, .009], hardware, 'house-branchlab-device-symbol');
    symbol.castShadow = false;
    const centre = mesh(new T.ShapeGeometry(roundedShape(.24, .19, .04), 4), basic('#142D29'), [x, 0, .012], hardware); centre.castShadow = false;
  }
  curve([[-.28, 0, .014], [.28, 0, .014]], basic('#AC91D1'), .014, hardware, 'house-branchlab-screen-link');
  box([.34, .65, .48], '#4C6258', [-.83, 1.145, -2.78], desk, 'house-branchlab-computer', 'paint', .05);
  box([.09, .043, .027], '#1E302D', [-.83, 1.24, -2.528], desk, 'house-branchlab-port', 'metal', .009);
  const cable = curve([[-.83, 1.24, -2.505], [-.84, 1.08, -2.30], [-1.12, .89, -2.20], [-1.35, .91, -2.25], [-1.22, 1.16, -2.48]], '#9176B7', .019, desk, 'house-branchlab-real-cable');
  box([.075, .048, .075], '#AFAEAA', [-.83, 1.24, -2.50], desk, 'house-branchlab-cable-plug', 'metal', .012);
  const signal = mesh(new T.SphereGeometry(.027, 12, 8), basic('#DBC3FF'), [-.83, 1.24, -2.50], desk, 'house-branchlab-signal'); signal.visible = false;
  previews.branchlab.signal = signal; previews.branchlab.path = cable.path;
  obstacle(desk, 'office-workstations');

  // The vehicle's physical record is the garage support, not a separate pedestal.
  const record = new T.Group(); record.name = 'house-garapp-record'; root.add(record);
  box([.072, 1.10, 1.28], '#B38F5D', [.969, 1.55, 2.9], record, 'house-garapp-record-cover', 'wood', .033);
  box([.02, 1, 1.18], P.paper, [1.016, 1.55, 2.9], record, 'house-garapp-record-page', 'paper', .009);
  for (let row = 0; row < 4; row++) curve([[1.032, 1.82 - row * .18, 2.47], [1.032, 1.82 - row * .18, 3.30]], row ? '#B4AD93' : P.car, .005, record, 'house-garapp-record-rule');
  box([.035, .06, .26], '#7B8B7A', [1.04, 2.02, 2.9], record, 'house-garapp-record-clip', 'metal', .014);
  surfaces.garapp = { position: [1.045, 1.55, 2.9], width: 1.16, height: .96, rotationY: Math.PI / 2,
    camera: { position: [3.25, 1.65, 2.9], target: [1.045, 1.55, 2.9] } };
  anchors.garapp = { position: [...surfaces.garapp.position], normal: [1, 0, 0], label: [3.1, 1.8, 1.6], vehicle: [3.1, .9, -.3], room: 'garage' };

  // Profiled body panels, rounded corners and a continuous cabin silhouette.
  const car = new T.Group(); car.name = 'house-parked-car'; car.position.set(3.1, 0, -.3); root.add(car);
  function ring(halfWidth, bottom, top, radius, samples = 4) {
    const r = Math.min(radius, halfWidth, (top - bottom) / 2), points = [];
    const corners = [[halfWidth - r, top - r, 0], [-halfWidth + r, top - r, Math.PI / 2], [-halfWidth + r, bottom + r, Math.PI], [halfWidth - r, bottom + r, Math.PI * 1.5]];
    for (const [x, y, start] of corners) for (let i = 0; i < samples; i++) { const angle = start + i / (samples - 1) * Math.PI / 2; points.push([x + Math.cos(angle) * r, y + Math.sin(angle) * r]); }
    return points;
  }
  function loft(sections, color, name, kind = 'car') {
    const positions = [], indices = [], rings = sections.map(([z, w, bottom, top, r]) => ring(w, bottom, top, r || .12)), count = rings[0].length;
    for (let j = 0; j < sections.length; j++) for (const [x, y] of rings[j]) positions.push(x, y, sections[j][0]);
    for (let j = 0; j < sections.length - 1; j++) for (let i = 0; i < count; i++) {
      const a = j * count + i, b = j * count + (i + 1) % count, c = a + count, d = b + count;
      indices.push(a, b, c, b, d, c);
    }
    for (const [j, reverse] of [[0, true], [sections.length - 1, false]]) {
      const center = positions.length / 3, section = sections[j]; positions.push(0, (section[2] + section[3]) / 2, section[0]);
      for (let i = 0; i < count; i++) { const a = j * count + i, b = j * count + (i + 1) % count; indices.push(center, reverse ? b : a, reverse ? a : b); }
    }
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    return mesh(geometry, color, [0, 0, 0], car, name, kind);
  }
  loft([[-2.06, .66, .41, .68], [-1.89, .82, .34, .85], [-1.40, .88, .32, .91], [-.40, .90, .32, .94], [.70, .90, .32, .91], [1.45, .85, .34, .85], [1.92, .76, .40, .74], [2.06, .64, .43, .65]], P.car, 'car-sculpted-body');
  const cabin = loft([[-1.47, .72, .84, .89, .025], [-1.08, .68, .84, 1.36, .08], [-.74, .65, .85, 1.49, .10], [.03, .64, .86, 1.49, .10], [.73, .74, .85, .99, .06]], '#526F70', 'car-glazed-cabin', 'metal');
  cabin.material = new T.MeshPhysicalMaterial({ color: '#506A6A', roughness: .19, metalness: .25, clearcoat: .7, clearcoatRoughness: .2 }); materials.add(cabin.material);
  box([1.28, .105, .95], P.car, [0, 1.47, -.37], car, 'car-rounded-roof', 'car', .052);
  for (const side of [-1, 1]) {
    curve([[side * .73, .88, .75], [side * .61, 1.42, .06], [side * .61, 1.43, -.78], [side * .71, .89, -1.44]], P.car, .045, car, 'car-window-surround', true, 'car');
    curve([[side * .73, .89, -1.40], [side * .77, .89, .73]], '#B4533A', .018, car, 'car-window-sill');
    curve([[side * .73, .91, -.43], [side * .645, 1.44, -.43]], P.frame, .028, car, 'car-window-pillar');
    curve([[side * .90, .42, -.42], [side * .90, .80, -.42]], '#B65B40', .006, car, 'car-door-seam', false);
    box([.035, .035, .18], '#D8CBB2', [side * .902, .78, .13], car, 'car-door-handle', 'metal', .016);
    box([.16, .10, .20], P.car, [side * .85, .96, .62], car, 'car-mirror', 'car', .045);
    for (const z of [-1.27, 1.24]) {
      const arch = mesh(new T.TorusGeometry(.38, .032, 8, 24, Math.PI), P.tyre, [side * .89, .345, z], car, 'car-wheel-arch', 'rubber'); arch.rotation.y = Math.PI / 2;
      const tyre = mesh(new T.TorusGeometry(.255, .095, 12, 28), P.tyre, [side * .88, .35, z], car, 'car-tyre', 'rubber'); tyre.rotation.y = Math.PI / 2;
      const rim = mesh(new T.CylinderGeometry(.205, .205, .15, 24), '#A8B0A2', [side * .925, .35, z], car, 'car-wheel-rim', 'metal'); rim.rotation.z = Math.PI / 2;
      const hub = mesh(new T.CylinderGeometry(.084, .084, .16, 20), P.frame, [side * .93, .35, z], car, 'car-wheel-hub', 'metal'); hub.rotation.z = Math.PI / 2;
    }
  }
  box([1.42, .11, .16], '#53645A', [0, .43, 2.01], car, 'car-front-bumper', 'paint', .045);
  box([1.39, .10, .14], '#53645A', [0, .44, -2.01], car, 'car-rear-bumper', 'paint', .04);
  box([.65, .085, .03], '#42534B', [0, .58, 2.066], car, 'car-front-grille', 'metal', .025);
  const headlightMaterial = new T.MeshStandardMaterial({ color: '#F7E9BB', roughness: .25, emissive: '#FFE4A5', emissiveIntensity: .05 }); materials.add(headlightMaterial);
  for (const side of [-1, 1]) {
    const lamp = box([.29, .13, .045], headlightMaterial, [side * .50, .65, 2.03], car, 'car-headlight', 'paint', .055); lamp.castShadow = false;
    box([.26, .115, .035], '#A64C39', [side * .52, .66, -2.035], car, 'car-rear-light', 'paint', .04);
  }
  contact([3.1, .025, -.3], [2.4, 4.7], .62);
  obstacle(car, 'parked-car'); previews.garapp = { headlightMaterial };

  // Soft daylight and local bounce come from the existing architectural openings.
  const lights = world.scene.children.filter(item => item.isLight);
  const sun = lights.find(item => item.isDirectionalLight && item.position.y > 20);
  for (const light of lights) {
    if (light.isHemisphereLight) { light.color.set('#FFF1D6'); light.groundColor.set('#ADAA92'); light.intensity = 1.7; }
    else if (light.isDirectionalLight && light !== sun) { light.color.set('#CCD9DD'); light.intensity = .8; }
  }
  if (sun) {
    sun.position.set(-8, 13, 10); sun.color.set('#FFE5BE'); sun.intensity = 3.0; sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: .5, far: 45 });
    sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -.0004; sun.shadow.normalBias = .04;
  }
  const officeBounce = new T.PointLight('#FFE9C9', 8, 7, 2); officeBounce.position.set(-4.8, 2, 1.2); root.add(officeBounce);
  const garageBounce = new T.PointLight('#F3E8D1', 7, 7, 2); garageBounce.position.set(3, 2.2, 3.9); root.add(garageBounce);
  let environmentTarget = null, cube = null;
  if (world.renderer && globalThis.document) {
    world.renderer.shadowMap.enabled = true; world.renderer.shadowMap.type = T.PCFSoftShadowMap;
    world.renderer.toneMapping = T.ACESFilmicToneMapping; world.renderer.toneMappingExposure = 1.04;
    const faces = Array.from({ length: 6 }, (_, face) => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64; const ctx = canvas.getContext('2d');
      const gradient = ctx.createLinearGradient(0, 0, 0, 64); gradient.addColorStop(0, '#EAE2CC'); gradient.addColorStop(.5, '#D3D3C3'); gradient.addColorStop(1, '#747E72');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64); if (face === 0 || face === 4) { ctx.fillStyle = '#FFF8DF'; ctx.fillRect(14, 10, 25, 30); } return canvas;
    });
    cube = new T.CubeTexture(faces); cube.colorSpace = T.SRGBColorSpace; cube.needsUpdate = true;
    const generator = new T.PMREMGenerator(world.renderer); environmentTarget = generator.fromCubemap(cube); generator.dispose();
    world.scene.environment = environmentTarget.texture; world.scene.environmentIntensity = .55;
  }
  root.updateMatrixWorld(true);
  const previewState = { finapp: 0, branchlab: 0, garapp: 0 };
  function setPreview(app, strength, phase = 'hover') {
    if (!Object.hasOwn(previewState, app)) return;
    const amount = clamp(Number(strength) || 0, 0, 1); previewState[app] = amount;
    if (app === 'finapp') { previews.finapp.idle.scale.y = .96 + amount * .04; financeInk.color.set(amount ? '#B3DAFF' : '#89B9F1'); previews.finapp.accent.material.color.set(amount ? '#A5C8FF' : apps.finapp?.color || '#6789CD'); }
    if (app === 'branchlab') { previews.branchlab.signal.visible = amount > .03; previews.branchlab.signal.position.copy(previews.branchlab.path.getPoint(.1 + amount * .8)); previews.branchlab.accent.material.color.set(amount ? '#DBC3FF' : apps.branchlab?.color || '#9176B7'); }
    if (app === 'garapp') previews.garapp.headlightMaterial.emissiveIntensity = .05 + amount * (phase === 'opening' ? .7 : .4);
    world.requestRender?.();
  }
  world.cleanup?.(() => {
    for (const item of materials) item.dispose(); for (const texture of textures) texture.dispose();
    if (world.scene.environment === environmentTarget?.texture) world.scene.environment = null;
    environmentTarget?.dispose(); cube?.dispose();
  });
  return { roof, entry, car, screens, surfaces, shell, obstacles, anchors, setPreview,
    bounds: { minX: -6.4, maxX: 6.4, minZ: -4.5, maxZ: 7 },
    inspectPreview: () => ({ ...previewState }) };
}
