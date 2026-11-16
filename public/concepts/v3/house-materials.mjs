// Authored, seamless surface maps. Distances in the scene and texture repeats are metres.
export function createSurfaceLibrary(T, onLoad = () => {}) {
  const textures = [], materials = new Set(), tracked = new Set(), cache = new Map();let disposed=false;
  const hash = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
  const smooth = t => t * t * (3 - 2 * t);
  function noise(x, y, period = 64) {
    const ix = Math.floor(x), iy = Math.floor(y), u = smooth(x - ix), v = smooth(y - iy);
    const h = (a, b) => hash(((a % period) + period) % period, ((b % period) + period) % period);
    return (h(ix, iy) * (1 - u) + h(ix + 1, iy) * u) * (1 - v) + (h(ix, iy + 1) * (1 - u) + h(ix + 1, iy + 1) * u) * v;
  }
  function texture(bytes, n, color = false) {
    const t = new T.DataTexture(bytes, n, n, T.RGBAFormat);
    t.colorSpace = color ? T.SRGBColorSpace : T.NoColorSpace;
    t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.LinearFilter;
    t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8;
    t.needsUpdate = true; textures.push(t); return t;
  }
  function maps(kind, n = 512) {
    const color = new Uint8Array(n * n * 4), relief = new Uint8Array(n * n * 4), rough = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const u = x / n, v = y / n, fine = hash(x, y), broad = noise(u * 8, v * 8, 8), mid = noise(u * 64, v * 64);
      let c, height, r;
      if (kind === 'oak' || kind === 'oak-floor') {
        const warp = Math.sin(u * Math.PI * 2) * .7 + noise(u * 8, v * 2, 8) * 1.6;
        const grain = Math.pow(.5 + .5 * Math.sin(v * Math.PI * 192 + warp * 4), 8);
        const pores = noise(u * 16, v * 128, 128), value = broad * 14 + mid * 5 - grain * 21 - pores * 7 + fine * 4;
        const seam = kind === 'oak-floor' && (y % (n / 8) < 1 || ((x + Math.floor(y / (n / 8)) * n / 3) % n < 1)) ? 28 : 0;
        c = [157 + value - seam, 121 + value * .85 - seam, 83 + value * .65 - seam]; height = 130 + grain * 26 + pores * 13 - seam; r = 158 + grain * 26;
      } else if (kind === 'stone') {
        const vein = Math.pow(Math.max(0, Math.sin((u + v * .3 + broad * .13) * Math.PI * 10)), 18);
        const value = broad * 18 + mid * 14 + fine * 7 - vein * 11;
        c = [143 + value, 147 + value, 140 + value]; height = 95 + mid * 65 + fine * 20; r = 204 + mid * 28;
      } else if (kind === 'gravel') {
        const value = mid * 48 + broad * 14 + fine * 16;
        c = [76 + value, 80 + value, 72 + value * .9]; height = 65 + mid * 135 + fine * 20; r = 220;
      } else {
        const pores = fine < .06 ? -18 : 0, value = broad * 10 + mid * 6 + fine * 5;
        c = [208 + value, 203 + value, 189 + value]; height = 118 + fine * 19 + mid * 8 + pores; r = 225 + fine * 18;
      }
      const i = (y * n + x) * 4;
      for (let k = 0; k < 3; k++) { color[i + k] = c[k]; relief[i + k] = height; rough[i + k] = r; }
      color[i + 3] = relief[i + 3] = rough[i + 3] = 255;
    }
    return { map: texture(color, n, true), bumpMap: texture(relief, n), roughnessMap: texture(rough, n) };
  }
  const oak = maps('oak'), floor = maps('oak-floor'), stone = maps('stone'), plaster = maps('plaster'), gravel = maps('gravel');
  const captured = {};
  if (globalThis.document) {
    const loader = new T.TextureLoader();
    for (const [kind, asset] of Object.entries({ rock: 'rock_boulder_dry', gravel: 'gravel_ground_01', floor: 'oak_wood_planks', wood: 'oak_wood_planks', plaster: 'grey_plaster' })) {
      captured[kind] = {maps:{},ready:false};let loaded=0;const required=kind==='plaster'?1:2;
      for (const [slot, suffix] of [['map', 'color'], ['normalMap', 'normal']]) {
        if(kind==='plaster'&&slot==='map')continue;
        const map = loader.load(new URL('../../assets/house/' + asset + '-' + suffix + '.webp', import.meta.url).href,loadedTexture=>{
          if(disposed){loadedTexture.dispose();return;}
          if(++loaded!==required)return;captured[kind].ready=true;
          for(const value of tracked)if(value.userData.surfaceKind===kind){Object.assign(value,capturedOptions(kind));value.needsUpdate=true;}
          onLoad();
        });
        map.colorSpace = slot === 'map' ? T.SRGBColorSpace : T.NoColorSpace;
        map.wrapS = map.wrapT = T.RepeatWrapping; map.anisotropy = 8;
        textures.push(map); captured[kind].maps[slot] = map;
      }
    }
  }
  function capturedOptions(kind){const strength=kind==='plaster'?.1:kind==='floor'||kind==='wood'?.35:.8;return {...captured[kind].maps,normalScale:new T.Vector2(strength,strength),bumpMap:null};}
  function get(color, kind = 'paint') {
    const key = color + ':' + kind;
    if (cache.has(key)) return cache.get(key);
    const options = { color, roughness: .56, metalness: 0 };
    if (kind === 'plaster') Object.assign(options, plaster, { roughness: 1, bumpScale: .006 });
    if (kind === 'stone') Object.assign(options, stone, { roughness: 1, bumpScale: .021 });
    if (kind === 'rock') Object.assign(options, stone, { roughness: 1, bumpScale: .015 });
    if (kind === 'gravel') Object.assign(options, gravel, { roughness: 1, bumpScale: .048 });
    if (kind === 'wood') Object.assign(options, oak, { roughness: .75, bumpScale: .006 });
    if (kind === 'floor') Object.assign(options, floor, { roughness: .72, bumpScale: .009 });
    if (kind === 'metal') Object.assign(options, { metalness: .88, roughness: .31 });
    if (kind === 'rubber') Object.assign(options, { roughness: .91 });
    if (kind === 'paper') Object.assign(options, { roughness: .96 });
    if (kind === 'glass') Object.assign(options, { transparent: true, opacity: .16, roughness: .07, metalness: .12, depthWrite: false, side: T.DoubleSide });
    if (captured[kind]?.ready) Object.assign(options, capturedOptions(kind));
    const value = new T.MeshPhysicalMaterial({ ...options,
      clearcoat: kind === 'car' ? 1 : kind === 'wood' ? .16 : 0,
      clearcoatRoughness: kind === 'car' ? .09 : .4,
      ...(kind === 'car' ? { metalness: .42, roughness: .25 } : {}) });
    if (options.map) value.userData.metreUV = kind === 'wood' ? .55 : kind === 'floor' ? .35 : kind === 'gravel' ? 1.2 : .8;
    value.userData.surfaceKind=kind;
    cache.set(key, value); materials.add(value);tracked.add(value); return value;
  }
  return { get, textures, materials,track:value=>tracked.add(value),ready:()=>Object.values(captured).every(item=>item.ready),
    dispose() { disposed=true;for (const t of textures) t.dispose(); for (const m of materials) m.dispose(); } };
}

export function setMetreUV(geometry, scale) {
  const p = geometry.attributes.position, normals = geometry.attributes.normal;
  if (!p || !normals) return;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(normals.getX(i)), ny = Math.abs(normals.getY(i)), nz = Math.abs(normals.getZ(i));
    uv[i * 2] = (nx > ny && nx > nz ? p.getZ(i) : p.getX(i)) * scale;
    uv[i * 2 + 1] = (ny > nx && ny > nz ? p.getZ(i) : p.getY(i)) * scale;
  }
  geometry.setAttribute('uv', new geometry.attributes.position.constructor(uv, 2));
}

// Extruded panels duplicate vertices at triangle edges. Average their shared normals.
export function smoothSurfaceNormals(T, geometry) {
  geometry.computeVertexNormals();
  const p=geometry.attributes.position,n=geometry.attributes.normal,averaged=new Map();
  const keyAt=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*100000)).join(':');
  for(let i=0;i<p.count;i++){const key=keyAt(i),sum=averaged.get(key)||new T.Vector3();sum.add(new T.Vector3().fromBufferAttribute(n,i));averaged.set(key,sum);}
  for(let i=0;i<p.count;i++){const sum=averaged.get(keyAt(i)).normalize();n.setXYZ(i,sum.x,sum.y,sum.z);}
}
