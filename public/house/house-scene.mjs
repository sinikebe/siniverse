import { createSurfaceLibrary, setMetreUV, smoothSurfaceNormals } from './house-materials.mjs';
import { buildLandscape } from './house-landscape.mjs';
import { buildNeighborhood } from './neighborhood.mjs';
import { createHousePhotography } from './house-photography.mjs';
import { buildGamingRoom } from './gaming-room.mjs';
import { buildConstructionSite } from './construction-site.mjs';

// A small, tangible house. All coordinates are metres; navigation belongs to Plan.
export function buildHouse(world, apps) {
  const T = world.THREE;
  const P = { plaster: '#F8F6EF', floor: '#FFFFFF', frame: '#273234', roof: '#344243',
    garage: '#C7CCCA', metal: '#9AA5A4', cream: '#D8DBD4', paper: '#FBF0D7',
    glass: '#B3CCD3', tyre: '#151C1E', car: '#758F89', wood: '#F8F1E6' };
  const root = new T.Group(); root.name = 'siniverse-house'; world.scene.add(root);
  const roof = new T.Group(); roof.name = 'house-roof'; root.add(roof);
  const shell = [], obstacles = [], textures = [], materials = new Set();
  const screens = {}, surfaces = {}, previews = {}, anchors = {};
  const surfaceLibrary = createSurfaceLibrary(T, () => world.requestRender?.(),world.quality);
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
  const contactMap = canvasTexture((ctx, n) => {
    const gradient = ctx.createRadialGradient(n / 2, n / 2, n * .08, n / 2, n / 2, n * .5);
    gradient.addColorStop(0, 'rgba(36,31,23,.65)'); gradient.addColorStop(.45, 'rgba(36,31,23,.33)');
    gradient.addColorStop(.8, 'rgba(36,31,23,.08)'); gradient.addColorStop(1, 'rgba(36,31,23,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, n, n);
  }, 128);
  function material(color, kind = 'paint') {
    return surfaceLibrary.get(color, kind);
  }
  function basic(color, { map = null, opacity = 1 } = {}) {
    const value = new T.MeshBasicMaterial({ color, map, transparent: opacity < 1 || Boolean(map), opacity, depthWrite: !map, toneMapped: false });
    materials.add(value); return value;
  }
  function mesh(geometry, color, position = [0, 0, 0], parent = root, name = '', kind = 'paint') {
    const item = new T.Mesh(geometry, typeof color === 'string' ? material(color, kind) : color);
    if (item.material.userData.metreUV) setMetreUV(geometry, item.material.userData.metreUV);
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
  function displayGeometry(width, height, radius) {
    const geometry = new T.ShapeGeometry(roundedShape(width, height, radius), 5);
    geometry.computeBoundingBox();
    const { min, max } = geometry.boundingBox;
    const { position, uv } = geometry.attributes;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (position.getX(i) - min.x) / (max.x - min.x), (position.getY(i) - min.y) / (max.y - min.y));
    }
    return geometry;
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
    return item;
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

  world.scene.background = new T.Color('#D8D6C6');
  world.scene.fog = new T.FogExp2('#D8D6C6', .013);
  const landscape = buildLandscape(T, world.scene, surfaceLibrary,world.quality);
  const neighborhood = buildNeighborhood(T, world.scene, surfaceLibrary, { ...world.quality, heightAt: landscape.heightAt });
  const construction = buildConstructionSite(world, { root: landscape.root, mesh, curve, material, canvasTexture, roundedGeometry, contact, materials, heightAt: landscape.heightAt });
  box([11.1, .19, 7.7], '#D8DDD8', [0, -.16, 0], root, 'house-approach-ground', 'stone', .025);
  box([4.45,.09,2.8], '#D5D9D4', [3.05,-.13,4.92],root,'house-driveway','stone',.025);
  for(const z of [4.18,4.98,5.78,6.58])box([1.34,.10,.66],'#DEE0D8',[-2.3,-.11,z],root,'house-entry-paving','stone',.018);
  box([10.65, .16, 7.25], P.frame, [0, -.09, 0], root, 'house-foundation', 'paint', .055);
  box([6.1, .06, 7.18], P.floor, [-2.25, -.01, 0], root, 'house-office-floor', 'floor', .018);
  box([4.5, .06, 7.18], P.garage, [3.05, -.01, 0], root, 'house-garage-floor', 'stone', .018);
  box([1.4, .045, .42], '#7C806A', [-2.3, .015, 3.55], root, 'house-entry-threshold', 'paint', .018);
  box([3.9, .025, .22], '#7C806A', [3.05, .015, 3.52], root, 'house-garage-threshold', 'metal', .01);
  wall('x', -3.49, -5.3, 5.3, [], 'rear'); wall('z', 5.19, -3.6, 3.6, [], 'right');
  wall('z', -5.19, -3.6, 3.6, [{ from: -.65, to: .95, bottom: .95, top: 2.05 },{from:1.2,to:2.5,top:2.2}], 'left');
  windowPane('z', -5.19, -.65, .95, .95, 2.05);
  wall('x', 3.49, -5.3, .8, [{ from: -4.85, to: -3.55, bottom: .95, top: 2.05 }, { from: -3, to: -1.6, top: 2.2 }], 'front-office');
  windowPane('x', 3.49, -4.85, -3.55, .95, 2.05); frame('x', 3.49, -3, -1.6, 0, 2.2);
  wall('x', 3.49, .8, 5.3, [{ from: 1.1, to: 5, top: 2.35 }], 'front-garage'); frame('x', 3.49, 1.1, 5, 0, 2.35);
  wall('z', .8, -3.6, 3.6, [{ from: 1, to: 2.2, top: 2.2 }], 'partition'); frame('z', .8, 1, 2.2, 0, 2.2);
  // Sills, skirting and lintels describe the construction, without furnishing it.
  box([5.84, .105, .06], '#D0BDA0', [-2.25, .065, -3.37], root, 'house-office-skirting', 'wood', .015);
  box([.06, .105, 4.45], '#D0BDA0', [-5.07, .065, -1.125], root, 'house-office-skirting', 'wood', .015);
  box([.06, .105, .8], '#D0BDA0', [-5.07, .065, 2.96], root, 'house-office-skirting', 'wood', .015);
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
  const deskLight=new T.PointLight('#FFE4BE',8,5,2);deskLight.position.set(-2.8,2.4,-2.4);roof.add(deskLight);
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

  // Cedar rainscreen, recessed joinery, drainage and warm fixtures give the shell scale.
  const siding = new T.InstancedMesh(roundedGeometry([.038, 2.64, .105], .006, 3), material('#EEE7D9', 'wood'), 60);
  siding.name = 'house-wall-cedar-rainscreen'; siding.castShadow = false;siding.receiveShadow = true;
  setMetreUV(siding.geometry, .55);
  const verticalGrain=geometry=>{const uv=geometry.attributes.uv;for(let i=0;i<uv.count;i++){const u=uv.getX(i);uv.setXY(i,uv.getY(i),u);}};
  verticalGrain(siding.geometry);
  const sidingMatrix = new T.Matrix4();
  for (let i = 0; i < 60; i++) siding.setMatrixAt(i, sidingMatrix.makeTranslation(5.325, 1.42, -3.43 + i * .116));
  root.add(siding);
  const gableSlats = [];
  for (let x = -5.09; x < .71; x += .125) { const h = 1.18 - Math.abs(x + 2.25) * .403; if (h > .03) gableSlats.push([x, h]); }
  const cladding = new T.InstancedMesh(roundedGeometry([.112, 1, .045], .005, 3), material('#F8F1E6', 'wood'), gableSlats.length);
  setMetreUV(cladding.geometry, .55);verticalGrain(cladding.geometry); cladding.name = 'house-gable-cedar'; cladding.castShadow = false;cladding.receiveShadow = true;
  gableSlats.forEach(([x, h], i) => { sidingMatrix.compose(new T.Vector3(x, 2.83 + h / 2, 3.605), new T.Quaternion(), new T.Vector3(1, h, 1)); cladding.setMatrixAt(i, sidingMatrix); }); roof.add(cladding);
  for (const x of [-5.56, 1.07]) {
    curve([[x, 2.79, -3.81], [x, 2.79, 3.84]], '#526162', .065, roof, 'house-zinc-gutter', false, 'metal');
    curve([[x, 2.79, 3.76], [x, 2.57, 3.76], [x - .05, 2.42, 3.62], [x - .05, .13, 3.62]], '#566568', .038, root, 'house-rainwater-downpipe', false, 'metal');
  }
  for (const x of [-3.3, -1.32, 5.12]) {
    box([.09,.29,.11],P.frame,[x,1.84,3.65],root,'house-exterior-sconce','metal',.013);
    const glow = new T.MeshStandardMaterial({color:'#FFF3DC',emissive:'#FFD69A',emissiveIntensity:2.5,roughness:.25});materials.add(glow);
    box([.058,.21,.012],glow,[x,1.84,3.711],root,'house-sconce-diffuser','paint',.01).castShadow=false;
  }
  for (const x of [1.12, 3.05, 4.98]) box([.008,.002,2.75],'#6C7776',[x,-.082,4.92],root,'house-driveway-expansion-joint','rubber',.001);
  const drain = new T.InstancedMesh(new T.BoxGeometry(.025,.012,.16),material('#4B5858','metal'),50);drain.name='house-garage-drain';
  for(let i=0;i<50;i++)drain.setMatrixAt(i,sidingMatrix.makeTranslation(1.18+i*.076,-.034,3.72));root.add(drain);

  const desk = new T.Group(); desk.name = 'house-office-workbench'; root.add(desk);
  box([4.6, .13, 1.18], P.wood, [-2.8, .76, -2.65], desk, 'house-desk-top', 'wood', .055);
  for (const x of [-4.98, -.62]) for (const z of [-3.14, -2.16]) box([.09, .70, .09], P.frame, [x, .35, z], desk, 'house-desk-leg', 'metal', .022);
  contact([-2.8, .024, -2.65], [4.9, 1.9], .40);
  function keyboard(x) {
    box([1.08,.008,.51], '#3D4A4A', [x,.831,-2.34],desk,'house-felt-desk-mat','rubber',.04);
    box([.69, .035, .24], '#2E4550', [x, .844, -2.21], desk, 'house-keyboard', 'paint', .025);
    const keys = new T.InstancedMesh(roundedGeometry([.052, .012, .043], .006, 3), material('#E1D9C8'), 36);
    keys.name = 'house-keycaps'; const matrix = new T.Matrix4(); let index = 0;
    for (let row = 0; row < 3; row++) for (let col = 0; col < 12; col++) {
      matrix.makeTranslation(x - .30 + col * .055, .868, -2.28 + row * .061); keys.setMatrixAt(index++, matrix);
    }
    keys.castShadow = false; keys.receiveShadow = true; desk.add(keys);
  }
  const officeX=-2.8;
  box([.72,.032,.42],'#9BA6A5',[officeX,.85,-2.63],desk,'house-office-screen-foot','metal',.025);
  box([.085,.31,.10],'#9BA6A5',[officeX,1.00,-2.61],desk,'house-office-screen-stand','metal',.02);
  box([2.25,1.35,.085],'#343F42',[officeX,1.62,-2.55],desk,'house-office-screen-frame','metal',.035);
  box([2.17,1.27,.014],'#101A20',[officeX,1.62,-2.50],desk,'house-display-inner-bezel','rubber',.02);
  const desktopMap=canvasTexture((ctx,n)=>{
    ctx.scale(n/512,n/288);
    const background=ctx.createLinearGradient(0,288,512,0);background.addColorStop(0,'#132D38');background.addColorStop(1,'#32344C');ctx.fillStyle=background;ctx.fillRect(0,0,512,288);
    ctx.fillStyle='#A1BAC9';ctx.font='11px sans-serif';ctx.fillText('SINIVERSE / BUREAU',25,28);
    ctx.fillStyle='#D6E3E8';ctx.font='24px sans-serif';ctx.fillText('Vos outils. Un seul PC.',25,67);
    for(const [x,id,color]of [[113,'FINAPP','#477EAF'],[290,'BRANCHLAB','#8572A4']]){
      ctx.fillStyle='#D9EBFF12';ctx.fillRect(x-28,91,140,130);ctx.fillStyle=color;ctx.fillRect(x+14,111,52,52);
      ctx.strokeStyle='#E4EFF3';ctx.lineWidth=3;ctx.beginPath();
      if(id==='FINAPP'){ctx.moveTo(x+23,150);ctx.lineTo(x+33,139);ctx.lineTo(x+42,142);ctx.lineTo(x+55,124);}else{ctx.moveTo(x+25,125);ctx.lineTo(x+25,149);ctx.lineTo(x+52,149);ctx.moveTo(x+42,137);ctx.lineTo(x+54,137);}
      ctx.stroke();ctx.fillStyle='#E1E9EE';ctx.font='14px sans-serif';ctx.fillText(id,x+(id==='FINAPP'?13:0),193);
    }
    ctx.fillStyle='#A3BCCB';ctx.font='10px sans-serif';ctx.fillText('OUVRIR LE BUREAU →',25,264);
  },512);
  const screenGeometry=displayGeometry(2.08,1.17,.025);
  const officeScreen=mesh(screenGeometry,basic('#FFFFFF',{map:desktopMap}),[officeX,1.62,-2.485],desk,'house-office-screen');officeScreen.castShadow=officeScreen.receiveShadow=false;
  const officeAccent=mesh(new T.PlaneGeometry(1.86,.006),basic('#8CB9C5'),[officeX,1.01,-2.48],desk,'house-office-active-edge');officeAccent.castShadow=false;
  const officeSurface={position:[officeX,1.62,-2.46],width:2.08,height:1.17,rotationY:0};
  // Both semantic app destinations refer to this one physical monitor.
  for(const id of ['finapp','branchlab']){screens[id]=officeScreen;surfaces[id]=officeSurface;anchors[id]={position:[...officeSurface.position],normal:[0,0,1],room:'bureau'};}
  keyboard(officeX);
  box([.58,.09,.48],'#6B7871',[officeX,.46,-1.83],desk,'house-chair-seat','rubber',.08);
  const officeBack=box([.57,.44,.065],'#6B7871',[officeX,.85,-1.63],desk,'house-chair-back','rubber',.07);officeBack.rotation.x=-.12;
  for(const dx of [-.22,.22])for(const dz of [-.17,.17])box([.035,.42,.035],P.frame,[officeX+dx,.21,-1.83+dz],desk,'house-chair-leg','metal',.01);
  const officeMouse=mesh(new T.SphereGeometry(.075,16,10),'#D1D3C8',[officeX+.48,.87,-2.23],desk,'house-mouse','paint');officeMouse.scale.set(.85,.43,1.4);
  const computer=new T.Group();computer.name='house-office-computer';computer.position.set(-1.02,.825,-2.77);desk.add(computer);
  box([.39,.74,.64],'#526875',[0,.37,0],computer,'house-office-computer-case','paint',.045);
  box([.31,.57,.018],'#26373E',[0,.37,.328],computer,'house-office-computer-front','paint',.015);
  for(let row=0;row<10;row++)box([.24,.012,.006],'#667A80',[0,.19+row*.032,.341],computer,'house-computer-vent','metal',.003);
  const power=mesh(new T.CircleGeometry(.016,16),basic('#A6D8E4'),[0,.65,.341],computer,'house-office-power');power.castShadow=false;
  curve([[-1.02,.89,-3.08],[-1.4,.84,-3.12],[-2.6,.87,-3.12],[officeX,1.0,-2.62]],'#35494D',.012,desk,'house-office-display-cable');
  const office={screen:officeScreen,computer,surface:officeSurface};
  const pot=mesh(new T.CylinderGeometry(.115,.085,.18,24),'#A69C87',[-4.9,.92,-2.91],desk,'house-stoneware-pot','stone');
  mesh(new T.CylinderGeometry(.098,.098,.005,24),'#393E30',[-4.9,1.015,-2.91],desk,'house-pot-soil','rubber');
  for(let i=0;i<9;i++){
    const a=i*2.4,h=.12+hash(i)*.18;
    const leaf=mesh(new T.SphereGeometry(.045,8,6),'#536950',[-4.9+Math.cos(a)*.055,1.06+h/2,-2.91+Math.sin(a)*.055],desk,'house-plant-leaf');
    leaf.scale.set(.4,h/.045,.9);leaf.rotation.z=Math.cos(a)*.4;
  }
  for(let i=0;i<3;i++)box([.24,.018,.30],['#C1C7BB','#707F7C','#E0D7C3'][i],[-4.2,.848+i*.02,-2.84],desk,'house-stacked-notebook','paper',.008);
  mesh(new T.CylinderGeometry(.055,.045,.095,24),'#CFCDC1',[-4.05,.882,-2.25],desk,'house-ceramic-cup','paint');
  curve([[-3.99,.92,-2.25],[-3.95,.91,-2.25],[-3.95,.87,-2.25],[-3.99,.86,-2.25]],'#CFCDC1',.009,desk,'house-cup-handle');
  obstacle(desk, 'office-workstations');

  // The service display faces the clear floor in front of the parked vehicle.
  const monitor = new T.Group();
  monitor.name = 'house-garage-wall-monitor';
  monitor.position.set(4.99, 1.59, 2.30);
  monitor.rotation.y = -Math.PI / 2;
  root.add(monitor);
  box([.52, .38, .08], '#41494A', [0, 0, -.043], monitor, 'house-garage-monitor-mount', 'metal');
  const housingWidth = 2.04;
  box([housingWidth, 1.33, .082], '#606C6B', [0, -.008, .046], monitor, 'house-garage-monitor-case', 'metal', .032);
  box([2.024, 1.314, .018], '#202A2D', [0, -.008, .089], monitor, 'house-garage-monitor-bezel', 'rubber', .021);
  const garageArt = canvasTexture((ctx, size) => {
    ctx.scale(size / 640, size / 400);
    const gradient = ctx.createLinearGradient(0, 0, 640, 400);
    gradient.addColorStop(0, '#293B3D');
    gradient.addColorStop(1, '#152326');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 640, 400);
    ctx.fillStyle = '#F6E9D8';
    ctx.font = '600 64px system-ui, sans-serif';
    ctx.fillText('Garapp', 41, 95);
    ctx.fillStyle = '#B8CAC3';
    ctx.font = '22px system-ui, sans-serif';
    ctx.fillText('Carnet du véhicule', 45, 139);
    // Side elevation, in the sage paint and warm copper of the garage.
    ctx.strokeStyle = '#99B9AD';
    ctx.lineWidth = 3;
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(217, 274);
    ctx.lineTo(208, 268);
    ctx.quadraticCurveTo(206, 243, 220, 233);
    ctx.lineTo(267, 223);
    ctx.bezierCurveTo(291, 197, 309, 180, 343, 180);
    ctx.bezierCurveTo(390, 175, 424, 188, 458, 216);
    ctx.quadraticCurveTo(527, 223, 557, 246);
    ctx.lineTo(562, 266);
    ctx.quadraticCurveTo(555, 273, 534, 274);
    ctx.moveTo(287, 274);
    ctx.lineTo(476, 274);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(283, 222);
    ctx.quadraticCurveTo(310, 192, 340, 191);
    ctx.quadraticCurveTo(400, 183, 439, 217);
    ctx.lineTo(283, 222);
    ctx.moveTo(355, 191);
    ctx.lineTo(348, 220);
    ctx.stroke();
    for (const x of [254, 504]) {
      ctx.beginPath();
      ctx.arc(x, 268, 24, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, 268, 11, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.fillStyle = '#F2AC87';
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.fillText('Ouvrir  →', 45, 351);
  }, 512);
  const garageWidth = 1.92, garageHeight = 1.20;
  const display = mesh(displayGeometry(garageWidth, garageHeight, .014), basic('#FFFFFF', { map: garageArt }),
    [0, 0, .101], monitor, 'house-garage-display');
  display.castShadow = display.receiveShadow = false;
  const indicator = mesh(new T.CircleGeometry(.007, 12), basic('#AECDBC'), [.93, -.638, .099], monitor, 'house-garage-monitor-led');
  indicator.castShadow = indicator.receiveShadow = false;
  box([.036, .95, .026], '#ADAEA1', [.37, -1.11, -.059], monitor, 'house-garage-cable-channel', 'paint', .006);
  obstacle(monitor, 'garage-wall-monitor');
  const garageSurface = {
    position: display.getWorldPosition(new T.Vector3()).toArray(),
    width: garageWidth, height: garageHeight, rotationY: monitor.rotation.y,
  };
  const garageCamera = { position: [3.10, 1.65, monitor.position.z], target: [...garageSurface.position] };
  const garage = {
    monitor, surface: garageSurface, label: [4.79, 2.24, monitor.position.z],
    camera: garageCamera,
    cameraForViewport(aspect, verticalFovDegrees) {
      const [surfaceX] = garageSurface.position;
      const horizontalTangent = aspect * Math.tan(verticalFovDegrees * Math.PI / 360);
      // Frame the metal housing, keeping a margin on both sides and staying inside the garage.
      const distance = housingWidth / (2 * .90 * horizontalTangent) + .04;
      const x = clamp(surfaceX - distance, 1.24, garageCamera.position[0]);
      return { position: [x, garageCamera.position[1], monitor.position.z], target: [...garageSurface.position] };
    },
  };

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
  smoothSurfaceNormals(T,bodyGeometry);mesh(bodyGeometry,P.car,[0,0,0],car,'car-sculpted-body','car');
  const cabin=loft([[-1.49,.73,.94,.97,.025],[-1.18,.68,.95,1.37,.07],[-.83,.65,.96,1.53,.09],[.04,.65,.96,1.53,.09],[.82,.75,.95,1.06,.05]],'#294B57','car-glazed-cabin','metal');
  cabin.material=new T.MeshPhysicalMaterial({color:'#3A5054',roughness:.10,metalness:.25,clearcoat:1,clearcoatRoughness:.08,transparent:true,opacity:.62,depthWrite:false});cabin.castShadow=false;materials.add(cabin.material);
  box([1.12,.09,.26],'#273435',[0,1.025,.38],car,'car-dashboard','rubber',.035);
  for(const x of [-.34,.34]){
    box([.39,.10,.43],'#394744',[x,.91,-.15],car,'car-seat-cushion','rubber',.055);
    const seat=box([.38,.39,.11],'#394744',[x,1.12,-.43],car,'car-seat-back','rubber',.05);seat.rotation.x=-.1;
    box([.22,.13,.10],'#394744',[x,1.37,-.46],car,'car-seat-headrest','rubber',.04);
  }
  const steering=mesh(new T.TorusGeometry(.135,.018,8,28),'#263431',[-.34,1.145,.25],car,'car-steering-wheel','rubber');steering.rotation.x=-.42;
  box([1.34,.10,1.04],P.cream,[0,1.53,-.39],car,'car-contrast-roof','car',.05);
  for(const side of [-1,1]){
    curve([[side*.74,.99,.82],[side*.63,1.48,.06],[side*.63,1.49,-.84],[side*.73,.99,-1.48]],P.cream,.033,car,'car-window-surround',true,'car');
    curve([[side*.73,1.0,-1.43],[side*.76,1.0,.78]],P.frame,.014,car,'car-window-sill');
    curve([[side*.75,1.01,-.40],[side*.65,1.49,-.40]],P.frame,.038,car,'car-window-pillar');
    curve([[side*.864,.44,-.37],[side*.866,.89,-.37],[side*.77,.97,-.37]],'#3B5552',.004,car,'car-door-seam',false);
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
    curve([[side*.48,.975,.94],[side*.49,.949,1.44],[side*.46,.883,1.86]],'#8FA7A0',.005,car,'car-bonnet-crease',true,'car');
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
  const headlightMaterial=new T.MeshPhysicalMaterial({color:'#C5D4D0',roughness:.10,metalness:.15,clearcoat:1,clearcoatRoughness:.08,emissive:'#FFD99B',emissiveIntensity:.05});materials.add(headlightMaterial);
  for(const side of [-1,1]){
    box([.34,.16,.048],P.frame,[side*.55,.77,2.18],car,'car-lamp-housing','metal',.055);
    const lamp=box([.27,.065,.018],headlightMaterial,[side*.55,.80,2.211],car,'car-headlight','paint',.028);lamp.castShadow=false;
    box([.035,.09,.019],headlightMaterial,[side*.67,.745,2.211],car,'car-running-light','paint',.015);
    box([.27,.10,.027],'#9A3E2A',[side*.55,.80,-2.17],car,'car-rear-light','paint',.035);
  }
  contact([3.1, .025, -.3], [2.4, 4.7], .62);
  obstacle(car, 'parked-car'); previews.garapp = { headlightMaterial };
  const gaming=buildGamingRoom(world,{root,roof,box,mesh,curve,wall,frame,windowPane,material,basic,canvasTexture,roundedGeometry,obstacle,contact,materials});

  // Soft daylight and local bounce come from the existing architectural openings.
  const lights = world.scene.children.filter(item => item.isLight);
  const sun = lights.find(item => item.isDirectionalLight && item.position.y > 20);
  for (const light of lights) {
    if (light.isHemisphereLight) { light.color.set('#BCCED8'); light.groundColor.set('#756F5B'); light.intensity = .36; }
    else if (light.isDirectionalLight && light !== sun) { light.color.set('#C0D7E3'); light.intensity = .35; }
  }
  if (sun) {
    sun.position.set(-12, 10, 8); sun.color.set('#FFEBCC'); sun.intensity = 3.4; sun.castShadow = true;
    const shadowSize=world.quality?.software?512:2048;sun.shadow.mapSize.set(shadowSize,shadowSize); Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: .5, far: 50 });
    sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -.00012; sun.shadow.normalBias = .015; sun.shadow.radius = 5.5;
  }
  const officeBounce = new T.PointLight('#D2E5EC', 4, 7, 2); officeBounce.position.set(-4.8, 2, 1.2); root.add(officeBounce);
  const garageBounce = new T.PointLight('#FFE7C8', 8, 7, 2); garageBounce.position.set(3, 2.2, 3.9); root.add(garageBounce);
  let environmentTarget = null, environmentSource = null, carEnvironment = null, carCapture = null;
  if (world.renderer && globalThis.document) {
    const sky = canvasTexture((ctx,n) => {
      const gradient=ctx.createLinearGradient(0,0,0,n);
      gradient.addColorStop(0,'#809FAC');
      gradient.addColorStop(.34,'#9CB8C1');
      gradient.addColorStop(.46,'#C6CFCA');
      gradient.addColorStop(.50,'#D8D6C6');
      gradient.addColorStop(1,'#D8D6C6');
      ctx.fillStyle=gradient;ctx.fillRect(0,0,n,n);
    },256);
    sky.mapping=T.EquirectangularReflectionMapping;
    world.scene.background=sky;
    world.renderer.shadowMap.enabled = true; world.renderer.shadowMap.type = T.PCFShadowMap;
    world.renderer.toneMapping = T.ACESFilmicToneMapping; world.renderer.toneMappingExposure = 1.06;
    world.renderer.shadowMap.autoUpdate=false;world.renderer.shadowMap.needsUpdate=true;
    // Linear HDR radiance, rather than clipped painted highlights. The sky lights every material.
    const w=512,h=256,radiance=new Float32Array(w*h*4);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const elevation=Math.cos(y/h*Math.PI),angle=x/w*Math.PI*2;
      const horizon=Math.exp(-Math.abs(elevation)*5),sky=Math.max(0,elevation);
      const sunGlow=Math.pow(Math.max(0,Math.cos(angle-2.55)),48)*Math.exp(-Math.pow((elevation-.35)*8,2));
      const i=(y*w+x)*4;
      radiance[i]=.18+sky*.38+horizon*.45+sunGlow*5;
      radiance[i+1]=.20+sky*.50+horizon*.43+sunGlow*4.2;
      radiance[i+2]=.20+sky*.67+horizon*.40+sunGlow*3.0;radiance[i+3]=1;
    }
    environmentSource=new T.DataTexture(radiance,w,h,T.RGBAFormat,T.FloatType);environmentSource.mapping=T.EquirectangularReflectionMapping;environmentSource.needsUpdate=true;
    const generator=new T.PMREMGenerator(world.renderer);environmentTarget=generator.fromEquirectangular(environmentSource);
    world.scene.environment=environmentTarget.texture;world.scene.environmentIntensity=.72;
    if(!world.quality?.software){
      carCapture=new T.WebGLCubeRenderTarget(128,{type:T.HalfFloatType});
      const reflectionCamera=new T.CubeCamera(.1,90,carCapture);reflectionCamera.position.set(3.1,1.05,-.3);
      car.visible=false;reflectionCamera.update(world.renderer,world.scene);car.visible=true;
      carEnvironment=generator.fromCubemap(carCapture.texture);
      car.traverse(node=>{if(node.isMesh&&node.material.isMeshPhysicalMaterial&&node.material.metalness>.1){node.material.envMap=carEnvironment.texture;node.material.envMapIntensity=1.15;}});
      world.setRenderEffect?.(createHousePhotography(T,world.renderer));
    }
    generator.dispose();
    world.renderer.shadowMap.needsUpdate=true;
  }
  function invalidateShadow(){if(world.renderer?.shadowMap)world.renderer.shadowMap.needsUpdate=true;}
  let nextShadowUpdate=0, excavatorShadowDirty=false;
  function updateAmbient(seconds){
    landscape.updateAmbient(seconds);
    if(construction.updateAmbient(seconds))excavatorShadowDirty=true;
    if(excavatorShadowDirty&&seconds>=nextShadowUpdate){
      invalidateShadow();
      nextShadowUpdate=seconds+(world.quality?.software ? 1 : .25);
      excavatorShadowDirty=false;
    }
  }
  root.updateMatrixWorld(true);
  const roofMaterials = [];
  roof.traverse(node => { if (!node.isMesh) return; node.material = node.material.clone(); node.material.transparent = true; materials.add(node.material);surfaceLibrary.track(node.material); roofMaterials.push(node.material); });
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
  const previewState = { finapp: 0, branchlab: 0, garapp: 0 };
  function setPreview(app, strength, phase = 'hover') {
    if (!Object.hasOwn(previewState, app)) return;
    const amount = clamp(Number(strength) || 0, 0, 1); previewState[app] = amount;
    const selected=previewState.finapp>=previewState.branchlab?'finapp':'branchlab',accentStrength=Math.max(previewState.finapp,previewState.branchlab);
    officeAccent.material.color.set(accentStrength>.02?(apps[selected]?.color||'#8CB9C5'):'#8CB9C5');
    if (app === 'garapp') previews.garapp.headlightMaterial.emissiveIntensity = .05 + amount * (phase === 'opening' ? .7 : .4);
    world.requestRender?.();
  }
  world.cleanup?.(() => {
    for (const item of materials) item.dispose(); for (const texture of textures) texture.dispose();
    neighborhood.dispose();landscape.dispose();surfaceLibrary.dispose();
    if (world.scene.environment === environmentTarget?.texture) world.scene.environment = null;
    environmentTarget?.dispose();environmentSource?.dispose();carEnvironment?.dispose();carCapture?.dispose();
  });
  return { roof, entry, car, record, screens, surfaces, shell, obstacles, anchors, gaming, office, garage, construction, updateAmbient, setPreview, setCutaway, setNotebook,
    bounds: { minX: -10.7, maxX: 6.4, minZ: -4.5, maxZ: 7 },
    inspectObjects: () => ({ roofAmount, notebookAmount, materialsReady:surfaceLibrary.ready() }),
    inspectConstruction: () => ({ excavator: world.projectBounds?.(construction.excavator,{includeDecor:true,precise:true}), crane: world.projectBounds?.(construction.crane,{includeDecor:true,precise:true}) }),
    inspectPreview: () => ({ ...previewState }) };
}
