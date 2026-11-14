import * as THREE from './vendor/three.module.min.js';
import { cleanPose } from './camera-math.mjs';
export { THREE };
export function createWorld(host,{reducedMotion=false,onContextLost=()=>{},cartoon=false,minCameraHeight=2,minCameraDistance=2,mobileFov=62,desktopFov=43}={}){
  const canvas=document.createElement('canvas');canvas.className='plan-canvas';canvas.tabIndex=0;
  canvas.setAttribute('aria-label','Monde 3D Siniverse. Glisser pour regarder ; W A S D ou flèches pour se déplacer.');
  host.append(canvas);
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});
  const gl=renderer.getContext();
  if(!(gl instanceof WebGL2RenderingContext))throw new Error('WebGL2 est nécessaire au monde 3D.');
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
  renderer.setClearColor(cartoon?'#dce9e5':'#ece9dc');
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.15;
  const scene=new THREE.Scene();scene.background=new THREE.Color(cartoon?'#dce9e5':'#ece9dc');scene.fog=new THREE.Fog(cartoon?'#dce9e5':'#ece9dc',65,115);
  const camera=new THREE.PerspectiveCamera(43,1,.1,160);
  const initial={position:[33,29,39],target:[0,0,2]};
  let target=new THREE.Vector3(...initial.target),destroyed=false,lost=false,frameId=0,last=0,flight=null;
  camera.position.set(...initial.position);camera.lookAt(target);
  scene.add(new THREE.HemisphereLight('#fff9df','#68726b',2.5));
  const sun=new THREE.DirectionalLight('#fff9e8',3.4);sun.position.set(-22,34,18);scene.add(sun);
  if(cartoon){renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-14,right:14,top:14,bottom:-14,near:1,far:80});sun.shadow.bias=-.0004;}
  const fill=new THREE.DirectionalLight('#a6b5cf',.9);fill.position.set(26,10,-25);scene.add(fill);
  const labelLayer=document.createElement('div');labelLayer.className='world-labels';host.append(labelLayer);
  const labels=[],surfaces=[],picks=[],animations=new Set(),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  const materials=new Map(),cleanups=[];
  const gradient=new THREE.DataTexture(new Uint8Array([55,140,215,255]),4,1,THREE.RedFormat);gradient.colorSpace=THREE.NoColorSpace;gradient.minFilter=gradient.magFilter=THREE.NearestFilter;gradient.needsUpdate=true;
  const material=(color,metalness=0)=>{const key=color+':'+metalness;if(!materials.has(key))materials.set(key,cartoon?new THREE.MeshToonMaterial({color,gradientMap:gradient}):new THREE.MeshStandardMaterial({color,roughness:.73,metalness}));return materials.get(key);};
  function mesh(geometry,color,position=[0,0,0],parent=scene,metalness=0){
    const item=new THREE.Mesh(geometry,material(color,metalness));item.position.set(...position);item.castShadow=cartoon;item.receiveShadow=cartoon;parent.add(item);return item;
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
      const inFront=projected.z<1&&projected.z>-1&&(item.clamp||(Math.abs(projected.x)<.98&&Math.abs(projected.y)<.97))&&(!item.occlusion||visiblePoint(item.position));
      item.element.hidden=!inFront||item.disabled;
      if(!inFront||item.disabled)continue;
      const width=item.element.offsetWidth,height=item.element.offsetHeight;
      let x=(projected.x*.5+.5)*rect.width,y=(-projected.y*.5+.5)*rect.height;
      if(!item.clamp&&(x-width/2<5||x+width/2>rect.width-5||y-height/2<5||y+height/2>rect.height-8)){item.element.hidden=true;continue;}
      if(item.clamp){x=Math.max(width/2+10,Math.min(rect.width-width/2-10,x));y=Math.max(height/2+12,Math.min(rect.height-height/2-item.bottom,y));}
      item.element.style.transform='translate('+Math.round(x)+'px,'+Math.round(y)+'px) translate(-50%,-50%)';
      item.element.style.zIndex=String(100-Math.round(projected.z*40));
    }
    for(const item of surfaces)projectSurface(item,rect);
  }
  function visibleObject(object){for(let node=object;node;node=node.parent)if(!node.visible)return false;return object.isMesh&&!object.userData.pickThrough&&!(object.material?.opacity<=.02);}
  function intersections(){return raycaster.intersectObjects(scene.children,true).filter(hit=>visibleObject(hit.object));}
  function pickedRoot(object){return picks.find(p=>{for(let node=object;node;node=node.parent)if(node===p.mesh)return true;return false;});}
  function visiblePoint(point){const direction=point.clone().sub(camera.position),distance=direction.length();raycaster.set(camera.position,direction.normalize());raycaster.near=0;raycaster.far=Math.max(0,distance-.035);const clear=intersections().length===0;raycaster.far=Infinity;return clear;}
  function projectSurface(item,rect){
    const {element,position,quaternion,width,height}=item;
    const normal=new THREE.Vector3(0,0,1).applyQuaternion(quaternion);
    const front=normal.dot(camera.position.clone().sub(position))>.05;
    const projected=position.clone().project(camera);
    element.hidden=item.disabled||!front||projected.z>=1||projected.z<=-1||!visiblePoint(position);
    if(element.hidden)return;
    const scale=width/element.offsetWidth,right=new THREE.Vector3(1,0,0).applyQuaternion(quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(quaternion);
    const corners=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,y])=>position.clone().addScaledVector(right,x*width/2).addScaledVector(up,y*height/2).project(camera));
    if(corners.every(p=>p.x<-1)||corners.every(p=>p.x>1)||corners.every(p=>p.y<-1)||corners.every(p=>p.y>1)){element.hidden=true;return;}
    const origin=position.clone().addScaledVector(right,-width/2).addScaledVector(up,height/2),matrix=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    const a=new THREE.Vector4(right.x*scale,right.y*scale,right.z*scale,0).applyMatrix4(matrix),b=new THREE.Vector4(-up.x*scale,-up.y*scale,-up.z*scale,0).applyMatrix4(matrix),c=new THREE.Vector4(origin.x,origin.y,origin.z,1).applyMatrix4(matrix),f=1/c.w;
    element.style.transform='matrix3d('+[rect.width/2*(a.x+a.w)*f,rect.height/2*(-a.y+a.w)*f,0,a.w*f,rect.width/2*(b.x+b.w)*f,rect.height/2*(-b.y+b.w)*f,0,b.w*f,0,0,1,0,rect.width/2*(c.x+c.w)*f,rect.height/2*(-c.y+c.w)*f,0,1].join(',')+')';
    element.style.zIndex=String(150-Math.round(c.w));
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
  function setPose(value){const pose=cleanPose(value,initial,{minHeight:minCameraHeight,minDistance:minCameraDistance});camera.position.set(...pose.position);target.set(...pose.target);camera.lookAt(target);request();}
  function flyTo(value,{instant=false,duration=850}={}){
    cancelFlight();const start=getPose(),end=cleanPose(value,initial,{minHeight:minCameraHeight,minDistance:minCameraDistance});
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
  function label(position,element,{clamp=true,bottom=12,occlusion=true}={}){
    element.classList.add('world-label');labelLayer.append(element);
    const item={position:new THREE.Vector3(...position),element,clamp,bottom,occlusion,disabled:false};labels.push(item);request();
    return {element,setPosition(next){item.position.set(...next);request();},setEnabled(enabled){item.disabled=!enabled;request();},remove(){item.disabled=true;element.remove();}};
  }
  function surface(spec,element){
    const quaternion=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),spec.rotationY||0),normal=new THREE.Vector3(0,0,1).applyQuaternion(quaternion);
    const position=new THREE.Vector3(...spec.position).addScaledVector(normal,.025);
    element.classList.add('world-surface');element.style.width='360px';element.style.height=String(360*spec.height/spec.width)+'px';labelLayer.append(element);
    const item={element,position,quaternion,width:spec.width,height:spec.height,disabled:false};surfaces.push(item);request();
    return {element,setEnabled(enabled){item.disabled=!enabled;request();},remove(){item.disabled=true;element.remove();}};
  }
  function pick(clientX,clientY){
    const rect=canvas.getBoundingClientRect();pointer.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(pointer,camera);
    const hit=intersections()[0],item=hit&&pickedRoot(hit.object);
    if(item){item.action();return item.mesh.name||true;}
    return null;
  }
  function probe(clientX,clientY){
    const r=canvas.getBoundingClientRect();
    pointer.set((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1);
    raycaster.setFromCamera(pointer,camera);
    return {client:[clientX,clientY],rect:{x:r.x,y:r.y,width:r.width,height:r.height},scroll:[scrollX,scrollY],ndc:pointer.toArray(),
      cameraAspect:camera.aspect,intersections:intersections().slice(0,5).map(hit=>{
        const index=picks.indexOf(pickedRoot(hit.object));
        return {index,rootType:picks[index]?.mesh.type,objectType:hit.object.type,geometry:hit.object.geometry?.type,distance:hit.distance,point:hit.point.toArray()};
      })};
  }
  const resize=()=>{const rect=host.getBoundingClientRect();renderer.setSize(Math.max(1,rect.width),Math.max(1,rect.height),false);camera.aspect=rect.width/Math.max(1,rect.height);camera.fov=rect.width<760?mobileFov:desktopFov;camera.updateProjectionMatrix();request();};
  const observer=new ResizeObserver(resize);observer.observe(host);
  const visibility=()=>{if(document.hidden){cancelAnimationFrame(frameId);frameId=0;}else request();};
  const contextLost=event=>{event.preventDefault();lost=true;cancelAnimationFrame(frameId);frameId=0;for(const a of animations)a.resolve();animations.clear();onContextLost();};
  canvas.addEventListener('webglcontextlost',contextLost);
  document.addEventListener('visibilitychange',visibility);resize();
  return {THREE,scene,camera,canvas,renderer,mesh,box,line,material,label,surface,visiblePoint,requestRender:request,animate,getPose,setPose,flyTo,cancelFlight,pick,
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
      gradient.dispose();
      renderer.dispose();renderer.forceContextLoss();canvas.remove();labelLayer.remove();
    }};
}
