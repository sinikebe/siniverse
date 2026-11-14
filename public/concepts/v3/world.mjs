import * as THREE from './vendor/three.module.min.js';
import { cleanPose } from './camera-math.mjs';
export { THREE };
export function createWorld(host,{reducedMotion=false,onContextLost=()=>{}}={}){
  const canvas=document.createElement('canvas');canvas.className='plan-canvas';canvas.tabIndex=0;
  canvas.setAttribute('aria-label','Monde 3D Siniverse. Glisser pour regarder ; W A S D ou flèches pour se déplacer.');
  host.append(canvas);
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});
  const gl=renderer.getContext();
  if(!(gl instanceof WebGL2RenderingContext))throw new Error('WebGL2 est nécessaire au monde 3D.');
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
  renderer.setClearColor('#ece9dc');
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.15;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#ece9dc');scene.fog=new THREE.Fog('#ece9dc',65,115);
  const camera=new THREE.PerspectiveCamera(43,1,.1,160);
  const initial={position:[33,29,39],target:[0,0,2]};
  let target=new THREE.Vector3(...initial.target),destroyed=false,lost=false,frameId=0,last=0,flight=null;
  camera.position.set(...initial.position);camera.lookAt(target);
  scene.add(new THREE.HemisphereLight('#fff9df','#68726b',2.5));
  const sun=new THREE.DirectionalLight('#fff9e8',3.4);sun.position.set(-22,34,18);scene.add(sun);
  const fill=new THREE.DirectionalLight('#a6b5cf',.9);fill.position.set(26,10,-25);scene.add(fill);
  const labelLayer=document.createElement('div');labelLayer.className='world-labels';host.append(labelLayer);
  const labels=[],picks=[],animations=new Set(),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  const materials=new Map(),cleanups=[];
  const material=(color,metalness=0)=>{const key=color+':'+metalness;if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,roughness:.73,metalness}));return materials.get(key);};
  function mesh(geometry,color,position=[0,0,0],parent=scene,metalness=0){
    const item=new THREE.Mesh(geometry,material(color,metalness));item.position.set(...position);parent.add(item);return item;
  }
  const box=(size,color,position,parent=scene,metalness=0)=>mesh(new THREE.BoxGeometry(...size),color,position,parent,metalness);
  function line(points,color,radius=.07,parent=scene){
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    return mesh(new THREE.TubeGeometry(curve,56,radius,7,false),color,[0,0,0],parent);
  }
  function updateLabels(){
    const rect=canvas.getBoundingClientRect();
    for(const item of labels){
      const projected=item.position.clone().project(camera);
      const inFront=projected.z<1&&projected.z>-1&&(item.clamp||(Math.abs(projected.x)<.98&&Math.abs(projected.y)<.97));
      item.element.hidden=!inFront||item.disabled;
      if(!inFront||item.disabled)continue;
      const width=item.element.offsetWidth,height=item.element.offsetHeight;
      let x=(projected.x*.5+.5)*rect.width,y=(-projected.y*.5+.5)*rect.height;
      if(!item.clamp&&(x-width/2<5||x+width/2>rect.width-5||y-height/2<5||y+height/2>rect.height-8)){item.element.hidden=true;continue;}
      if(item.clamp){x=Math.max(width/2+10,Math.min(rect.width-width/2-10,x));y=Math.max(height/2+12,Math.min(rect.height-height/2-item.bottom,y));}
      item.element.style.transform='translate('+Math.round(x)+'px,'+Math.round(y)+'px) translate(-50%,-50%)';
      item.element.style.zIndex=String(100-Math.round(projected.z*40));
    }
  }
  function render(){if(destroyed||lost)return;renderer.render(scene,camera);updateLabels();}
  function tick(now){
    frameId=0;if(destroyed||lost||document.hidden)return;
    for(const animation of [...animations]){
      const t=reducedMotion?1:Math.min(1,(now-animation.start)/animation.duration);
      animation.update(t,Math.min(.05,last?(now-last)/1000:0));
      if(t===1){animations.delete(animation);animation.resolve();}
    }
    last=now;render();
    if(animations.size)request();
  }
  function request(){if(!destroyed&&!lost&&!document.hidden&&!frameId)frameId=requestAnimationFrame(tick);}
  function animate(duration,update){
    if(destroyed||lost)return Promise.resolve();
    if(reducedMotion||duration===0){update(1,0);render();return Promise.resolve();}
    return new Promise(resolve=>{animations.add({start:performance.now(),duration,update,resolve});request();});
  }
  function cancelFlight(){if(flight){animations.delete(flight);flight.resolve();flight=null;}}
  function getPose(){return {position:camera.position.toArray(),target:target.toArray()};}
  function setPose(value){const pose=cleanPose(value,initial);camera.position.set(...pose.position);target.set(...pose.target);camera.lookAt(target);request();}
  function flyTo(value,{instant=false,duration=850}={}){
    cancelFlight();const start=getPose(),end=cleanPose(value,initial);
    if(instant||reducedMotion){setPose(end);return Promise.resolve();}
    return new Promise(resolve=>{
      flight={start:performance.now(),duration,resolve:()=>{flight=null;resolve();},update:t=>{
        const s=t*t*(3-2*t),lift=Math.sin(Math.PI*t)*1.4;
        camera.position.set(...start.position.map((n,i)=>n+(end.position[i]-n)*s+(i===1?lift:0)));
        target.set(...start.target.map((n,i)=>n+(end.target[i]-n)*s));camera.lookAt(target);
      }};
      animations.add(flight);request();
    });
  }
  function label(position,element,{clamp=true,bottom=12}={}){
    element.classList.add('world-label');labelLayer.append(element);
    const item={position:new THREE.Vector3(...position),element,clamp,bottom,disabled:false};labels.push(item);request();
    return {element,setPosition(next){item.position.set(...next);request();},setEnabled(enabled){item.disabled=!enabled;request();},remove(){item.disabled=true;element.remove();}};
  }
  function pick(clientX,clientY){
    const rect=canvas.getBoundingClientRect();pointer.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(pointer,camera);
    const hits=raycaster.intersectObjects(picks.map(item=>item.mesh),true);
    for(const hit of hits){
      const item=picks.find(p=>p.mesh===hit.object||p.mesh.children.includes(hit.object)||p.mesh===hit.object.parent);
      if(item){item.action();return item.mesh.name||true;}
    }
    return null;
  }
  function probe(clientX,clientY){
    const r=canvas.getBoundingClientRect();
    pointer.set((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1);
    raycaster.setFromCamera(pointer,camera);
    return {client:[clientX,clientY],rect:{x:r.x,y:r.y,width:r.width,height:r.height},scroll:[scrollX,scrollY],ndc:pointer.toArray(),
      cameraAspect:camera.aspect,intersections:raycaster.intersectObjects(picks.map(item=>item.mesh),true).slice(0,5).map(hit=>{
        const index=picks.findIndex(p=>p.mesh===hit.object||p.mesh.children.includes(hit.object)||p.mesh===hit.object.parent);
        return {index,rootType:picks[index]?.mesh.type,objectType:hit.object.type,geometry:hit.object.geometry?.type,distance:hit.distance,point:hit.point.toArray()};
      })};
  }
  const resize=()=>{const rect=host.getBoundingClientRect();renderer.setSize(Math.max(1,rect.width),Math.max(1,rect.height),false);camera.aspect=rect.width/Math.max(1,rect.height);camera.fov=rect.width<760?62:43;camera.updateProjectionMatrix();request();};
  const observer=new ResizeObserver(resize);observer.observe(host);
  const visibility=()=>{if(document.hidden){cancelAnimationFrame(frameId);frameId=0;}else request();};
  const contextLost=event=>{event.preventDefault();lost=true;cancelAnimationFrame(frameId);frameId=0;for(const a of animations)a.resolve();animations.clear();onContextLost();};
  canvas.addEventListener('webglcontextlost',contextLost);
  document.addEventListener('visibilitychange',visibility);resize();
  return {THREE,scene,camera,canvas,renderer,mesh,box,line,material,label,requestRender:request,animate,getPose,setPose,flyTo,cancelFlight,
    probe,
    addPick(mesh,action){picks.push({mesh,action});},
    cleanup(fn){cleanups.push(fn);},
    project(point){const p=point.clone().project(camera),r=canvas.getBoundingClientRect();return {x:r.left+(p.x*.5+.5)*r.width,y:r.top+(-p.y*.5+.5)*r.height,z:p.z};},
    inspect(){
      if(lost)return {kind:'contextlost',pose:getPose(),triangles:0,pixelColors:0};
      render();
      const sample=new Uint8Array(4),colors=new Set();
      for(let y=1;y<5;y++)for(let x=1;x<6;x++){gl.readPixels(Math.floor(canvas.width*x/6),Math.floor(canvas.height*y/5),1,1,gl.RGBA,gl.UNSIGNED_BYTE,sample);colors.add([...sample].join(','));}
      return {kind:lost?'contextlost':'webgl2',pose:getPose(),triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,
        pixelColors:colors.size,objects:scene.children.length,dpr:renderer.getPixelRatio(),animationCount:animations.size,threeRevision:THREE.REVISION};
    },
    destroy(){
      destroyed=true;cancelAnimationFrame(frameId);observer.disconnect();document.removeEventListener('visibilitychange',visibility);
      canvas.removeEventListener('webglcontextlost',contextLost);for(const fn of cleanups)fn();
      for(const a of animations)a.resolve();animations.clear();
      scene.traverse(node=>{if(node.geometry)node.geometry.dispose();});
      for(const item of materials.values())item.dispose();
      renderer.dispose();renderer.forceContextLoss();canvas.remove();labelLayer.remove();
    }};
}
