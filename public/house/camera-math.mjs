export const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
export function finiteTriplet(value,fallback) {
  return Array.isArray(value)&&value.length===3&&value.every(Number.isFinite)?value.map(n=>clamp(n,-100,100)):[...fallback];
}
export function cleanPose(value,fallback,{minHeight=2,minDistance=2}={}) {
  const position=finiteTriplet(value?.position,fallback.position);
  const target=finiteTriplet(value?.target,fallback.target);
  position[1]=clamp(position[1],minHeight,45);
  if(Math.hypot(...position.map((n,i)=>n-target[i]))<minDistance)return {position:[...fallback.position],target:[...fallback.target]};
  return {position,target};
}
export function orbitPose(pose,dx,dy) {
  const [x,y,z]=pose.position.map((n,i)=>n-pose.target[i]);
  const radius=Math.hypot(x,y,z),yaw=Math.atan2(x,z)+dx,pitch=clamp(Math.acos(y/radius)+dy,.2,1.43);
  return {target:[...pose.target],position:[pose.target[0]+radius*Math.sin(pitch)*Math.sin(yaw),pose.target[1]+radius*Math.cos(pitch),pose.target[2]+radius*Math.sin(pitch)*Math.cos(yaw)]};
}
export function zoomPose(pose,factor) {
  const offset=pose.position.map((n,i)=>n-pose.target[i]),radius=Math.hypot(...offset);
  const distance=clamp(radius*factor,6,65);
  return {target:[...pose.target],position:pose.target.map((n,i)=>n+offset[i]/radius*distance)};
}
export function dragTracker(threshold=6) {
  let start=null,moved=false;
  return {start(x,y){start=[x,y];moved=false},move(x,y){if(start&&Math.hypot(x-start[0],y-start[1])>threshold)moved=true;return moved},
    end(){const dragged=moved;start=null;return dragged},get moved(){return moved}};
}

// Precise mode projects each mesh/instance rather than the empty corners of a group box.
export function projectedBounds(object,camera,rect,{precise=false,includeDecor=false}={}) {
  if(!object)return null;
  object.updateWorldMatrix(true,true);
  const points=[];let combined=null;
  function projectBox(box,matrix=null){
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
      const p=box.min.clone().set(x,y,z);if(matrix)p.applyMatrix4(matrix);p.project(camera);
      if(p.z>-1&&p.z<1)points.push({x:rect.left+(p.x*.5+.5)*rect.width,y:rect.top+(-p.y*.5+.5)*rect.height});
    }
  }
  object.traverse(node=>{
    if(!node.isMesh||!node.geometry||(!includeDecor&&node.userData.pickThrough)||node.material?.opacity<=.02)return;
    for(let parent=node;parent;parent=parent.parent)if(!parent.visible)return;
    node.geometry.computeBoundingBox();
    if(precise){
      if(node.isInstancedMesh){
        const instance=node.matrix.clone(),matrix=node.matrixWorld.clone();
        for(let i=0;i<node.count;i++){node.getMatrixAt(i,instance);matrix.multiplyMatrices(node.matrixWorld,instance);projectBox(node.geometry.boundingBox,matrix);}
      }else projectBox(node.geometry.boundingBox,node.matrixWorld);
    }else{
      if(node.isInstancedMesh)node.computeBoundingBox();
      const box=(node.isInstancedMesh?node.boundingBox:node.geometry.boundingBox).clone().applyMatrix4(node.matrixWorld);
      if(combined)combined.union(box);else combined=box;
    }
  });
  if(!precise&&combined&&!combined.isEmpty())projectBox(combined);
  if(!points.length)return null;
  const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));
  return {x,y,width:Math.max(...points.map(p=>p.x))-x,height:Math.max(...points.map(p=>p.y))-y};
}
