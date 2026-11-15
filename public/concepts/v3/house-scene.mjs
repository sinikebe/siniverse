// A small, tangible house. All coordinates are metres; navigation belongs to Plan.
export function buildHouse(world, apps) {
  const T = world.THREE;
  const P = { plaster: '#EADAC3', floor: '#B88F63', frame: '#263E49', roof: '#304B58',
    garage: '#9BA9A4', metal: '#A5AFAC', cream: '#F8EAD3', paper: '#FBF0D7',
    glass: '#9CBCC6', tyre: '#202D33', car: '#C96945', wood: '#B88B5A' };
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
  const floorboards = canvasTexture((ctx, n) => {
    ctx.fillStyle = '#EFE4CC'; ctx.fillRect(0, 0, n, n);
    for (let plank = 0; plank < 8; plank++) {
      const y = plank * n / 8, h = n / 8;
      ctx.fillStyle = plank % 3 ? '#E9DBC0' : '#F5E8D0'; ctx.fillRect(0, y, n, h);
      ctx.strokeStyle = '#A99A7F55'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(n, y + .5); ctx.stroke();
      const joint = (plank % 3 + 1) * n / 4;
      ctx.beginPath(); ctx.moveTo(joint, y); ctx.lineTo(joint, y + h); ctx.stroke();
      ctx.strokeStyle = '#B8A18122';
      for (let row = 6; row < h; row += 7) {
        ctx.beginPath(); ctx.moveTo(0, y + row);
        ctx.bezierCurveTo(n * .3, y + row - 3, n * .7, y + row + 3, n, y + row); ctx.stroke();
      }
    }
  }, 512);
  function material(color, kind = 'paint') {
    const key = color + ':' + kind;
    if (cache.has(key)) return cache.get(key);
    const options = { color, roughness: .64, metalness: .02 };
    if (kind === 'plaster') Object.assign(options, { roughness: .91, bumpMap: grain, bumpScale: .018 });
    if (kind === 'wood') Object.assign(options, { map: wood, roughness: .43, bumpMap: grain, bumpScale: .009 });
    if (kind === 'metal') Object.assign(options, { metalness: .65, roughness: .30 });
    if (kind === 'rubber') Object.assign(options, { roughness: .92, metalness: 0 });
    if (kind === 'paper') Object.assign(options, { roughness: .95, metalness: 0 });
    if (kind === 'glass') Object.assign(options, { transparent: true, opacity: .24, roughness: .08, metalness: .30, depthWrite: false, side: T.DoubleSide });
    const value = kind === 'car' || kind === 'wood' ? new T.MeshPhysicalMaterial({ ...options, roughness: kind === 'car' ? .27 : .43, clearcoat: kind === 'car' ? .85 : .12, clearcoatRoughness: .22 }) : new T.MeshStandardMaterial(options);
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
    const geometry = new T.ExtrudeGeometry(shape, { depth: .22, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 2, curveSegments: 4, steps: 1 });
    geometry.translate(0, 0, -.11); if (axis === 'z') geometry.rotateY(-Math.PI / 2);
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
    box(axis === 'x' ? [.035, top - bottom, .075] : [.075, top - bottom, .035], P.frame,
      axis === 'x' ? [(from + to) / 2, (bottom + top) / 2, fixed] : [fixed, (bottom + top) / 2, (from + to) / 2], root, 'house-window-mullion', 'metal', .01);
  }

  world.scene.background = new T.Color('#E8DFCF');
  if(world.scene.fog)world.scene.fog.color.set('#E8DFCF');
  const groundMaterial = new T.ShadowMaterial({color:'#263E49',opacity:.20,depthWrite:false}); materials.add(groundMaterial);
  const ground = mesh(new T.PlaneGeometry(200,200),groundMaterial,[0,-.385,0],root,'house-studio-ground');
  ground.rotation.x=-Math.PI/2;ground.castShadow=false;ground.userData.pickThrough=true;
  contact([0,-.382,.6],[18,15],.32);
  box([12.8, .30, 11.5], '#D1BE9F', [0, -.20, 1.25], root, 'house-approach-ground', 'plaster', .20);
  box([12.65,.045,11.35], '#E0D0B6', [0,-.033,1.25],root,'house-paving-surface','plaster',.02);
  for(const z of [4.18,4.90,5.62])box([1.34,.028,.57],'#BEB7A7',[-2.3,.001,z],root,'house-entry-paving','plaster',.045);
  box([10.65, .16, 7.25], P.frame, [0, -.09, 0], root, 'house-foundation', 'paint', .055);
  const officeFloor = box([6.1, .06, 7.18], P.floor, [-2.25, -.01, 0], root, 'house-office-floor', 'wood', .018);
  officeFloor.material = officeFloor.material.clone(); officeFloor.material.map = floorboards; floorboards.repeat.set(1.7, 2.4); materials.add(officeFloor.material);
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
  // Sills, skirting and lintels describe the construction, without furnishing it.
  box([5.84, .105, .06], '#D0BDA0', [-2.25, .065, -3.37], root, 'house-office-skirting', 'wood', .015);
  box([.06, .105, 6.7], '#D0BDA0', [-5.07, .065, 0], root, 'house-office-skirting', 'wood', .015);
  box([.06, .105, 4.25], '#D0BDA0', [.68, .065, -1.2], root, 'house-office-skirting', 'wood', .015);
  box([1.48, .075, .39], '#D7C9AF', [-4.2, .91, 3.49], root, 'house-window-sill', 'plaster', .024);
  box([.39, .075, 1.76], '#D7C9AF', [-5.19, .91, .15], root, 'house-window-sill', 'plaster', .024);

  const wallShade = canvasTexture((ctx,n)=>{const g=ctx.createLinearGradient(0,0,0,n);g.addColorStop(0,'rgba(28,48,58,0)');g.addColorStop(.55,'rgba(28,48,58,.04)');g.addColorStop(1,'rgba(28,48,58,.38)');ctx.fillStyle=g;ctx.fillRect(0,0,n,n);},128);
  for(const [x,z,width,rotation]of [[-2.25,-3.345,5.8,0],[-5.045,0,6.7,Math.PI/2],[.655,-1.25,4.3,-Math.PI/2],[3,-3.345,4.1,0],[5.045,0,6.7,-Math.PI/2]]){
    const mat=basic('#FFFFFF',{map:wallShade});
    const shade=mesh(new T.PlaneGeometry(width,.72),mat,[x,.36,z],root,'house-wall-contact');shade.rotation.y=rotation;shade.castShadow=shade.receiveShadow=false;shade.userData.pickThrough=true;
  }
  const canopy = box([1.88,.12,.87],P.roof,[-2.3,2.48,3.81],root,'house-entry-canopy','metal',.04);
  box([1.74,.045,.72],P.wood,[-2.3,2.397,3.81],root,'house-entry-canopy-lining','wood',.02);
  for(const x of [-3.15,-1.45])box([.055,.41,.055],P.frame,[x,2.22,3.61],root,'house-entry-canopy-bracket','metal',.018);

  const entry = new T.Group(); entry.name = 'house-open-entry-door'; entry.position.set(-3, 0, 3.49); entry.rotation.y = -Math.PI / 2; root.add(entry);
  box([1.32, 2.12, .085], P.wood, [.66, 1.06, 0], entry, 'house-entry-door-leaf', 'wood', .03);
  for (const y of [.62, 1.52]) box([1.05, .63, .016], '#B88C5E', [.66, y, .049], entry, 'house-entry-door-panel', 'wood', .04);
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
  curve([[-2.25, 4.16, 3.85], [-2.25, 4.16, -3.85]], '#3A5864', .095, roof, 'house-roof-ridge');
  function gable(z) {
    const shape = new T.Shape(); shape.moveTo(-5.19, 2.78); shape.lineTo(.8, 2.78); shape.lineTo(-2.25, 4.03); shape.closePath();
    const geometry = new T.ExtrudeGeometry(shape, { depth: .16, bevelEnabled: true, bevelSize: .015, bevelThickness: .015, bevelSegments: 2, steps: 1 });
    geometry.translate(0, 0, -.08); mesh(geometry, P.plaster, [0, 0, z], roof, 'house-gable', 'plaster');
  }
  gable(3.49); gable(-3.49);
  for(const [x,angle]of [[-3.90,pitch],[-.60,-pitch]]){const lining=box([length-.06,.035,7.28],'#E0D6BF',[x,3.365,0],roof,'house-ceiling-lining','plaster',.014);lining.rotation.z=angle;}
  box([3.05,.055,.15],P.frame,[-2.8,2.68,-2.4],roof,'house-desk-light-housing','metal',.025);
  const stripMaterial=new T.MeshStandardMaterial({color:'#FFF0CD',emissive:'#FFE3AD',emissiveIntensity:1.3,roughness:.5});materials.add(stripMaterial);
  const strip=box([2.88,.018,.105],stripMaterial,[-2.8,2.642,-2.4],roof,'house-desk-light-diffuser','paint',.008);strip.castShadow=false;
  const deskLight=new T.PointLight('#FFE4BE',5,5,2);deskLight.position.set(-2.8,2.4,-2.4);roof.add(deskLight);
  box([4.85, .20, 7.66], P.roof, [3.08, 2.97, 0], roof, 'house-garage-roof', 'paint', .07);
  // A folded metal roof: thin standing seams follow the slope and catch daylight.
  const seamPoses=[];for(let z=-3.4;z<3.6;z+=.62)for(const [x,slope]of [[-3.90,pitch],[-.60,-pitch]])seamPoses.push({x,z,slope});
  const seams=new T.InstancedMesh(roundedGeometry([length-.06,.035,.026],.01,3),material('#52707A','metal'),seamPoses.length);
  seams.name='house-roof-standing-seams';seams.castShadow=true;seams.receiveShadow=true;
  const seamMatrix=new T.Matrix4();seamPoses.forEach((p,i)=>{seamMatrix.compose(new T.Vector3(p.x,3.60,p.z),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),p.slope),new T.Vector3(1,1,1));seams.setMatrixAt(i,seamMatrix);});roof.add(seams);
  for (const x of [-5.55, 1.05]) box([.075, .15, 7.55], P.frame, [x, 2.83, 0], roof, 'house-roof-fascia', 'paint', .025);
  box([4.78, .12, .06], P.frame, [3.08, 2.94, 3.82], roof, 'house-garage-fascia', 'paint', .02);
  for (const z of [-3.82, 3.82]) {
    curve([[-5.55, 2.82, z], [-2.25, 4.15, z]], P.frame, .055, roof, 'house-roof-eave');
    curve([[-2.25, 4.15, z], [1.05, 2.82, z]], P.frame, .055, roof, 'house-roof-eave');
  }

  for(const x of [1,5.16])box([.11,.18,7.55],P.frame,[x,2.82,0],roof,'house-garage-roof-edge','metal',.03);
  const desk = new T.Group(); desk.name = 'house-office-workbench'; root.add(desk);
  box([4.6, .13, 1.18], P.wood, [-2.8, .76, -2.65], desk, 'house-desk-top', 'wood', .055);
  for (const x of [-4.98, -.62]) for (const z of [-3.14, -2.16]) box([.09, .70, .09], P.frame, [x, .35, z], desk, 'house-desk-leg', 'metal', .022);
  contact([-2.8, .024, -2.65], [4.9, 1.9], .40);
  function keyboard(x) {
    box([.69, .035, .24], '#2E4550', [x, .844, -2.21], desk, 'house-keyboard', 'paint', .025);
    const keys = new T.InstancedMesh(roundedGeometry([.052, .012, .043], .006, 3), material('#E1D9C8'), 36);
    keys.name = 'house-keycaps'; const matrix = new T.Matrix4(); let index = 0;
    for (let row = 0; row < 3; row++) for (let col = 0; col < 12; col++) {
      matrix.makeTranslation(x - .30 + col * .055, .868, -2.28 + row * .061); keys.setMatrixAt(index++, matrix);
    }
    keys.castShadow = false; keys.receiveShadow = true; desk.add(keys);
  }
  function screen(id, x) {
    box([.60, .045, .38], '#7A8B7D', [x, .85, -2.63], desk, 'house-' + id + '-screen-foot', 'metal', .035);
    box([.10, .29, .11], '#708477', [x, .99, -2.61], desk, 'house-' + id + '-screen-stand', 'metal', .03);
    box([1.54, 1.14, .135], '#D5D3C5', [x, 1.65, -2.57], desk, 'house-' + id + '-screen-frame', 'metal', .055);
    const displayMap = canvasTexture((ctx,n)=>{
      ctx.fillStyle=id==='finapp'?'#132D37':'#25273C';ctx.fillRect(0,0,n,n);
      const glow=ctx.createRadialGradient(n*.75,n*.2,0,n*.75,n*.2,n*.9);glow.addColorStop(0,id==='finapp'?'#264C60':'#414061');glow.addColorStop(1,'#142A3200');ctx.fillStyle=glow;ctx.fillRect(0,0,n,n);
      ctx.fillStyle='#D5E3E6';ctx.font='600 13px sans-serif';ctx.fillText(id.toUpperCase(),15,25);
      ctx.strokeStyle='#B5CDD51A';ctx.lineWidth=1;for(let y=60;y<230;y+=35){ctx.beginPath();ctx.moveTo(16,y);ctx.lineTo(n-16,y);ctx.stroke();}
      ctx.fillStyle='#C4D6DB';ctx.font='8px sans-serif';ctx.fillText(id==='finapp'?'DEUX CHOIX. UN HORIZON.':'DE LA SOURCE À L’ÉCRAN.',15,n-14);
    },256);
    const screenGeometry = new T.ShapeGeometry(roundedShape(1.4, 1, .035), 5);
    const screenPosition = screenGeometry.attributes.position, screenUv = screenGeometry.attributes.uv;
    for (let i = 0; i < screenUv.count; i++) screenUv.setXY(i, screenPosition.getX(i) / 1.4 + .5, screenPosition.getY(i) + .5);
    const face = mesh(screenGeometry, basic('#FFFFFF', {map: displayMap}), [x, 1.65, -2.499], desk, 'house-' + id + '-screen');
    face.castShadow = face.receiveShadow = false;
    const idle = new T.Group(); idle.name = id + '-idle-drawing'; face.add(idle); face.userData.idle = idle;
    const accent = mesh(new T.PlaneGeometry(1.14, .008), basic(apps[id]?.color || '#6789CD'), [x, 1.125, -2.495], desk, 'house-' + id + '-active-edge'); accent.castShadow = false;
    previews[id] = { idle, accent }; screens[id] = face;
    surfaces[id] = { position: [x, 1.65, -2.475], width: 1.4, height: 1, rotationY: 0 };
    anchors[id] = { position: [...surfaces[id].position], normal: [0, 0, 1], label: [x, 2.34, -2.47], room: 'bureau' };
    keyboard(x);
    box([.52,.10,.46],'#627F80',[x,.46,-2.15],desk,'house-chair-seat','rubber',.11);
    const back=box([.51,.42,.065],'#627F80',[x,.86,-1.97],desk,'house-chair-back','rubber',.10);back.rotation.x=-.12;
    for(const dx of [-.20,.20])for(const dz of [-.15,.15])box([.035,.42,.035],P.frame,[x+dx,.21,-2.15+dz],desk,'house-chair-leg','metal',.01);
    const mouse=mesh(new T.SphereGeometry(.075,16,10),'#D1D3C8',[x+.46,.87,-2.23],desk,'house-mouse','paint');mouse.scale.set(.85,.43,1.4);
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
  box([.34, .65, .48], '#526875', [-.83, 1.145, -2.78], desk, 'house-branchlab-computer', 'paint', .05);
  box([.09, .043, .027], '#1E302D', [-.83, 1.24, -2.528], desk, 'house-branchlab-port', 'metal', .009);
  const cable = curve([[-.83, 1.24, -2.505], [-.84, 1.08, -2.30], [-1.12, .89, -2.20], [-1.35, .91, -2.25], [-1.22, 1.16, -2.48]], '#9176B7', .019, desk, 'house-branchlab-real-cable');
  const plug = box([.075, .048, .075], '#AFAEAA', [-.83, 1.24, -2.50], desk, 'house-branchlab-cable-plug', 'metal', .012);
  const signal = mesh(new T.SphereGeometry(.027, 12, 8), basic('#DBC3FF'), [-.83, 1.24, -2.50], desk, 'house-branchlab-signal'); signal.visible = false; signal.castShadow=false;
  previews.branchlab.signal = signal; previews.branchlab.path = cable.path;
  obstacle(desk, 'office-workstations');

  // The vehicle's physical record is the garage support, not a separate pedestal.
  const record = new T.Group(); record.name = 'house-garapp-record'; root.add(record);
  box([.072, 1.10, 1.28], '#B38F5D', [.969, 1.55, 2.9], record, 'house-garapp-record-cover', 'wood', .033);
  box([.02, 1, 1.18], P.paper, [1.016, 1.55, 2.9], record, 'house-garapp-record-page', 'paper', .009);
  for (let row = 0; row < 4; row++) curve([[1.032, 1.82 - row * .18, 2.47], [1.032, 1.82 - row * .18, 3.30]], row ? '#B4AD93' : P.car, .005, record, 'house-garapp-record-rule');
  box([.035, .06, .26], '#7B8B7A', [1.04, 2.02, 2.9], record, 'house-garapp-record-clip', 'metal', .014);
  const cover = new T.Group(); cover.name = 'house-garapp-notebook-hinge'; cover.position.set(1.055, 1.55, 3.49); record.add(cover);
  box([.028, 1.065, 1.18], '#AF7653', [0, 0, -.59], cover, 'house-garapp-notebook-cover', 'wood', .025);
  const coverInk = canvasTexture((ctx,n)=>{
    ctx.fillStyle='#D9B88D';ctx.strokeStyle='#D9B88D';ctx.lineWidth=1;
    ctx.strokeRect(18,18,n-36,n-36);
    ctx.font='600 28px sans-serif';ctx.fillText('GARAPP',35,82);
    ctx.font='11px sans-serif';ctx.fillText('CARNET DU',35,109);ctx.fillText('VÉHICULE',35,125);
    ctx.fillRect(35,146,42,2);ctx.font='8px monospace';ctx.fillText('ENTRETIEN · HISTORIQUE',35,n-38);
  },256);
  const coverPrint = mesh(new T.PlaneGeometry(1.12,1),basic('#FFFFFF',{map:coverInk}),[.017,0,-.59],cover,'house-garapp-notebook-title');
  coverPrint.rotation.y=Math.PI/2;coverPrint.castShadow=coverPrint.receiveShadow=false;coverPrint.userData.pickThrough=true;
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
  // The lower silhouette includes real wheel openings, rather than a box behind the tyres.
  const sideProfile=new T.Shape();
  sideProfile.moveTo(-2.05,.40);sideProfile.lineTo(-1.675,.40);sideProfile.absarc(-1.27,.40,.405,Math.PI,0,true);
  sideProfile.lineTo(.835,.40);sideProfile.absarc(1.24,.40,.405,Math.PI,0,true);sideProfile.lineTo(2.02,.40);
  sideProfile.quadraticCurveTo(2.15,.48,2.10,.69);sideProfile.quadraticCurveTo(2.03,.84,1.79,.91);
  sideProfile.quadraticCurveTo(1.37,.99,.73,1.0);sideProfile.lineTo(-1.34,1.0);
  sideProfile.quadraticCurveTo(-1.95,.98,-2.10,.79);sideProfile.quadraticCurveTo(-2.17,.57,-2.05,.40);sideProfile.closePath();
  const bodyGeometry=new T.ExtrudeGeometry(sideProfile,{depth:1.64,bevelEnabled:true,bevelSize:.055,bevelThickness:.055,bevelSegments:3,curveSegments:12,steps:1});
  bodyGeometry.translate(0,0,-.82);
  const bodyPosition=bodyGeometry.attributes.position;
  for(let i=0;i<bodyPosition.count;i++){const z=bodyPosition.getX(i),y=bodyPosition.getY(i),x=bodyPosition.getZ(i);bodyPosition.setXYZ(i,-x*(1-.08*Math.pow(Math.abs(z)/2.2,2)),y,z);}
  bodyGeometry.computeVertexNormals();mesh(bodyGeometry,P.car,[0,0,0],car,'car-sculpted-body','car');
  const cabin=loft([[-1.49,.73,.94,.97,.025],[-1.18,.68,.95,1.37,.07],[-.83,.65,.96,1.53,.09],[.04,.65,.96,1.53,.09],[.82,.75,.95,1.06,.05]],'#294B57','car-glazed-cabin','metal');
  cabin.material=new T.MeshPhysicalMaterial({color:'#274752',roughness:.10,metalness:.45,clearcoat:1,clearcoatRoughness:.12});materials.add(cabin.material);
  box([1.34,.10,1.04],P.cream,[0,1.53,-.39],car,'car-contrast-roof','car',.05);
  for(const side of [-1,1]){
    curve([[side*.74,.99,.82],[side*.63,1.48,.06],[side*.63,1.49,-.84],[side*.73,.99,-1.48]],P.cream,.033,car,'car-window-surround',true,'car');
    curve([[side*.73,1.0,-1.43],[side*.76,1.0,.78]],P.frame,.014,car,'car-window-sill');
    curve([[side*.75,1.01,-.40],[side*.65,1.49,-.40]],P.frame,.038,car,'car-window-pillar');
    curve([[side*.864,.44,-.37],[side*.866,.89,-.37],[side*.77,.97,-.37]],'#9A472E',.006,car,'car-door-seam',false);
    box([.025,.03,.17],'#D7DBD0',[side*.86,.87,.12],car,'car-door-handle','metal',.014);
    box([.17,.10,.23],P.car,[side*.91,1.02,.60],car,'car-mirror','car',.045);
    box([.018,.065,.17],'#334D58',[side*1.002,1.025,.60],car,'car-mirror-glass','metal',.02);
    box([.055,.075,1.35],P.frame,[side*.87,.405,-.02],car,'car-lower-sill','rubber',.028);
    for(const z of [-1.27,1.24]){
      const arch=mesh(new T.TorusGeometry(.417,.027,8,32,Math.PI),P.tyre,[side*.858,.40,z],car,'car-wheel-arch','rubber');arch.rotation.y=Math.PI/2;
      const tyre=mesh(new T.TorusGeometry(.263,.096,12,32),P.tyre,[side*.89,.36,z],car,'car-tyre','rubber');tyre.rotation.y=Math.PI/2;
      const sidewall=mesh(new T.TorusGeometry(.275,.014,6,32),'#3D4A4F',[side*.977,.36,z],car,'car-tyre-sidewall','rubber');sidewall.rotation.y=Math.PI/2;
      const rim=mesh(new T.CylinderGeometry(.222,.222,.16,32),'#3C515B',[side*.925,.36,z],car,'car-wheel-rim','metal');rim.rotation.z=Math.PI/2;
      const hub=mesh(new T.CylinderGeometry(.066,.066,.165,20),'#C3C8BF',[side*.93,.36,z],car,'car-wheel-hub','metal');hub.rotation.z=Math.PI/2;
    }
    curve([[side*.48,.975,.94],[side*.49,.949,1.44],[side*.46,.883,1.86]],'#D77F57',.009,car,'car-bonnet-crease',true,'car');
  }
  const spokes=new T.InstancedMesh(roundedGeometry([.025,.265,.046],.012,3),material('#BAC5C4','metal'),20);spokes.name='car-alloy-spokes';
  const spokeMatrix=new T.Matrix4();let spokeIndex=0;
  for(const side of [-1,1])for(const z of [-1.27,1.24])for(let i=0;i<5;i++){
    const angle=i/5*Math.PI*2;spokeMatrix.compose(new T.Vector3(side*.992,.36+Math.cos(angle)*.075,z+Math.sin(angle)*.075),new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),angle),new T.Vector3(1,1,1));spokes.setMatrixAt(spokeIndex++,spokeMatrix);
  }car.add(spokes);
  box([1.47,.14,.14],P.frame,[0,.46,2.20],car,'car-front-bumper','rubber',.05);
  box([1.38,.105,.13],P.frame,[0,.48,-2.18],car,'car-rear-bumper','rubber',.04);
  box([.72,.13,.025],'#253A43',[0,.655,2.225],car,'car-front-grille','rubber',.03);
  for(let x=-.27;x<.30;x+=.09)box([.018,.085,.016],'#779093',[x,.66,2.246],car,'car-grille-blade','metal',.008);
  box([.45,.075,.012],'#E6E2D4',[0,.46,2.28],car,'car-registration-plate','paint',.008);
  const headlightMaterial=new T.MeshStandardMaterial({color:'#FFF1D5',roughness:.18,metalness:.12,emissive:'#FFD99B',emissiveIntensity:.05});materials.add(headlightMaterial);
  for(const side of [-1,1]){
    box([.34,.16,.048],P.frame,[side*.55,.77,2.18],car,'car-lamp-housing','metal',.055);
    const lamp=box([.27,.065,.018],headlightMaterial,[side*.55,.80,2.211],car,'car-headlight','paint',.028);lamp.castShadow=false;
    box([.035,.09,.019],headlightMaterial,[side*.67,.745,2.211],car,'car-running-light','paint',.015);
    box([.27,.10,.027],'#9A3E2A',[side*.55,.80,-2.17],car,'car-rear-light','paint',.035);
  }
  contact([3.1, .025, -.3], [2.4, 4.7], .62);
  obstacle(car, 'parked-car'); previews.garapp = { headlightMaterial };

  // Soft daylight and local bounce come from the existing architectural openings.
  const lights = world.scene.children.filter(item => item.isLight);
  const sun = lights.find(item => item.isDirectionalLight && item.position.y > 20);
  for (const light of lights) {
    if (light.isHemisphereLight) { light.color.set('#BFD7E3'); light.groundColor.set('#B59C7B'); light.intensity = .95; }
    else if (light.isDirectionalLight && light !== sun) { light.color.set('#B0CADA'); light.intensity = .5; }
  }
  if (sun) {
    sun.position.set(-11, 13, 9); sun.color.set('#FFE0AC'); sun.intensity = 3.8; sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: .5, far: 45 });
    sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -.00015; sun.shadow.normalBias = .025;
  }
  const officeBounce = new T.PointLight('#D2E5EC', 5, 7, 2); officeBounce.position.set(-4.8, 2, 1.2); root.add(officeBounce);
  const garageBounce = new T.PointLight('#FFE7C8', 8, 7, 2); garageBounce.position.set(3, 2.2, 3.9); root.add(garageBounce);
  let environmentTarget = null, cube = null;
  if (world.renderer && globalThis.document) {
    world.renderer.shadowMap.enabled = true; world.renderer.shadowMap.type = T.PCFSoftShadowMap;
    world.renderer.toneMapping = T.ACESFilmicToneMapping; world.renderer.toneMappingExposure = .98;
    world.renderer.shadowMap.autoUpdate=false;world.renderer.shadowMap.needsUpdate=true;
    // Large luminous rectangles behave like architectural windows in reflections.
    const faces = Array.from({length:6},(_,face)=>{
      const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');
      const gradient=ctx.createLinearGradient(0,0,0,256);gradient.addColorStop(0,face===3?'#8B9D9F':'#BBD4DF');gradient.addColorStop(.50,'#CFCDBB');gradient.addColorStop(1,'#8F9D93');ctx.fillStyle=gradient;ctx.fillRect(0,0,256,256);
      if(face===0||face===4){ctx.fillStyle='#FFF7DD';ctx.fillRect(25,22,98,178);ctx.fillStyle='#E4F3F2';ctx.fillRect(137,22,63,178);ctx.fillStyle='#9AABA6';ctx.fillRect(25,114,175,5);}
      if(face===2){ctx.fillStyle='#FFF6DE';ctx.fillRect(55,55,146,146);}return canvas;
    });
    cube = new T.CubeTexture(faces); cube.colorSpace = T.SRGBColorSpace; cube.needsUpdate = true;
    const generator = new T.PMREMGenerator(world.renderer); environmentTarget = generator.fromCubemap(cube); generator.dispose();
    world.scene.environment = environmentTarget.texture; world.scene.environmentIntensity = .85;
  }
  function invalidateShadow(){if(world.renderer?.shadowMap)world.renderer.shadowMap.needsUpdate=true;}
  root.updateMatrixWorld(true);
  const roofMaterials = [];
  roof.traverse(node => { if (!node.isMesh) return; node.material = node.material.clone(); node.material.transparent = true; materials.add(node.material); roofMaterials.push(node.material); });
  let roofAmount = 0, roofRevision = 0, notebookAmount = 0;
  function setCutaway(open, { instant = false } = {}) {
    const end = open ? 1 : 0, from = roofAmount, token = ++roofRevision;
    if (from === end) return Promise.resolve();
    roof.visible = true;
    return world.animate(instant ? 0 : 620, t => {
      if (token !== roofRevision) return;
      const s = t * t * (3 - 2 * t); roofAmount = from + (end - from) * s;
      roof.position.y = roofAmount * 2.4;
      for (const material of roofMaterials) { material.opacity = 1 - roofAmount; material.depthWrite = roofAmount < .5; }
      roof.traverse(node => { if (node.isMesh) node.castShadow = roofAmount < .1; });
      roof.visible = roofAmount < 1;invalidateShadow();
    });
  }
  function setNotebook(amount) {
    notebookAmount = clamp(Number(amount) || 0, 0, 1); cover.rotation.y = -notebookAmount * 2.45;invalidateShadow(); world.requestRender?.();
  }
  function setInteraction(app, value = null) {
    invalidateShadow();
    if (app === 'finapp' || app === 'branchlab') previews[app].idle.visible = !value;
    if (app === 'branchlab') {
      const connected = !value || value.connected;
      plug.position.z = connected ? -2.50 : -2.30;
      cable.item.position.z = connected ? 0 : .20;
      signal.visible = Boolean(value?.connected);
    }
    world.requestRender?.();
  }
  function signalAt(progress) { signal.position.copy(cable.path.getPoint(clamp(progress, 0, 1))); world.requestRender?.(); }
  const previewState = { finapp: 0, branchlab: 0, garapp: 0 };
  function setPreview(app, strength, phase = 'hover') {
    if (!Object.hasOwn(previewState, app)) return;
    const amount = clamp(Number(strength) || 0, 0, 1); previewState[app] = amount;
    if (app === 'finapp') { previews.finapp.idle.scale.y = .96 + amount * .04; financeInk.color.set(amount ? '#B3DAFF' : '#89B9F1'); previews.finapp.accent.material.color.set(amount ? '#A5C8FF' : apps.finapp?.color || '#6789CD'); }
    if (app === 'branchlab') {
      if (previews.branchlab.idle.visible) { previews.branchlab.signal.visible = amount > .03; previews.branchlab.signal.position.copy(previews.branchlab.path.getPoint(.1 + amount * .8)); }
      previews.branchlab.accent.material.color.set(amount ? '#DBC3FF' : apps.branchlab?.color || '#9176B7');
    }
    if (app === 'garapp') previews.garapp.headlightMaterial.emissiveIntensity = .05 + amount * (phase === 'opening' ? .7 : .4);
    world.requestRender?.();
  }
  world.cleanup?.(() => {
    for (const item of materials) item.dispose(); for (const texture of textures) texture.dispose();
    if (world.scene.environment === environmentTarget?.texture) world.scene.environment = null;
    environmentTarget?.dispose(); cube?.dispose();
  });
  return { roof, entry, car, record, screens, surfaces, shell, obstacles, anchors, setPreview, setCutaway, setNotebook, setInteraction, signalAt,
    bounds: { minX: -6.4, maxX: 6.4, minZ: -4.5, maxZ: 7 },
    inspectObjects: () => ({ roofAmount, notebookAmount, connected: plug.position.z === -2.50 }),
    inspectPreview: () => ({ ...previewState }) };
}
