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
export function panPose(pose,forward,side) {
  const x=pose.target[0]-pose.position[0],z=pose.target[2]-pose.position[2],length=Math.hypot(x,z)||1;
  const dx=(x*forward-z*side)/length,dz=(z*forward+x*side)/length;
  const nextTarget=[clamp(pose.target[0]+dx,-30,30),pose.target[1],clamp(pose.target[2]+dz,-25,30)];
  const shift=[nextTarget[0]-pose.target[0],0,nextTarget[2]-pose.target[2]];
  return {target:nextTarget,position:pose.position.map((n,i)=>n+shift[i])};
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
