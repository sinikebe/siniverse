import { GARAGE_VIEWS } from './garage-views.mjs';
import { EYE_HEIGHT } from './house-navigation.mjs';
import { setMetreUV } from './house-materials.mjs';

// The gallery is a rear workshop. Its shoulder only widens beyond the garden
// reserved for the house extension; the street frontage and garage doors stay put.
export function buildGarageGallery({ T, root, roof, mesh, box, basic, material, displayGeometry, canvasTexture, obstacle }) {
  const centreX=2.28, back=-11.86, shoulder=-6.71, front=-3.48, left=-1.72, right=6.28;
  const sideTop=z=>4.40+(6.64-4.40)*(front-z)/(front-back);
  function solid(size,colour,position,name,kind='plaster') {
    const part=box(size,colour,position,root,name,kind,.013);
    obstacle(part,name);
  }
  function sideWall(x,z1,z2) {
    const shape=new T.Shape();
    shape.moveTo(z1,.02);shape.lineTo(z2,.02);shape.lineTo(z2,sideTop(z2));shape.lineTo(z1,sideTop(z1));shape.closePath();
    const geometry=new T.ExtrudeGeometry(shape,{depth:.18,bevelEnabled:false});
    geometry.translate(0,0,-.09);geometry.rotateY(-Math.PI/2);
    const part=mesh(geometry,'#ECEAE1',[x,0,0],root,'house-gallery-side-wall','plaster');
    obstacle(part,'gallery-side-wall');
  }
  sideWall(left,back,front);sideWall(5.19,shoulder,front);sideWall(right,back,shoulder);
  solid([right-left+.18,sideTop(back),.18],'#DDDCD3',[centreX,sideTop(back)/2,back],'house-gallery-back-wall');
  // The lower part is the existing office wall shared with the new bay.
  const returnHeight=sideTop(front)-2.8;
  solid([.8-left,returnHeight,.18],'#ECEAE1',[(.8+left)/2,2.8+returnHeight/2,front],'house-gallery-front-return');
  solid([right-5.19,sideTop(shoulder),.18],'#ECEAE1',[(right+5.19)/2,sideTop(shoulder)/2,shoulder],'house-gallery-garden-return');
  // Two roof plates follow the genuine step in the floor plan.
  const sections=[[back,shoulder,right],[shoulder,front,5.19]];
  for(const [z1,z2,x2] of sections) {
    box([x2-left+.22,.16,z2-z1+.17],'#B4BCB8',[(x2+left)/2,-.07,(z1+z2)/2],root,'house-gallery-floor','stone',.018);
    const dz=z2-z1,dy=sideTop(z2)-sideTop(z1),length=Math.hypot(dz,dy);
    const deck=box([x2-left+.36,.15,length+.17],'#485454',[(x2+left)/2,(sideTop(z1)+sideTop(z2))/2+.07,(z1+z2)/2],roof,'house-gallery-roof','metal',.022);
    deck.rotation.x=-Math.atan2(dy,dz);
    const fascia=box([.08,.14,length+.18],'#46534F',[x2+.14,(sideTop(z1)+sideTop(z2))/2+.045,(z1+z2)/2],roof,'house-gallery-eaves','metal',.014);
    fascia.rotation.x=deck.rotation.x;
  }
  // The lower lining continues the cedar cladding on the street-side bay.
  const battens=[];
  for(const [z1,z2,x] of sections)for(let z=z1+.06;z<z2-.04;z+=.117)battens.push([x+.108,1.41,z]);
  const cedarGeometry=new T.BoxGeometry(.039,2.64,.102);
  setMetreUV(cedarGeometry,.55);
  const uv=cedarGeometry.attributes.uv;
  for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getY(i),uv.getX(i));
  const cedar=new T.InstancedMesh(cedarGeometry,material('#EEE7D9','wood'),battens.length);
  const matrix=new T.Matrix4();cedar.name='house-gallery-cedar-rainscreen';cedar.receiveShadow=true;
  battens.forEach(([x,y,z],i)=>cedar.setMatrixAt(i,matrix.makeTranslation(x,y,z)));root.add(cedar);
  for(const z of [-6.95,-9.35])
    box([right-left-.08,.12,.09],'#866D54',[centreX,sideTop(z)-.06,z],roof,'house-gallery-timber-beam','wood',.014);
  solid([right-left-.22,.16,.25],'#65736E',[centreX,.08,back+.20],'house-gallery-service-plinth','metal');
  const screenZ=back+.235, pitch=2.55;
  const layout = {
    garage:         [centreX,5.65,4.18,1.63],
    interventions:  [centreX-pitch,3.94,2.41,1.45],
    composants:     [centreX,3.94,2.41,1.45],
    assurance:      [centreX+pitch,3.94,2.41,1.45],
    depenses:       [centreX-pitch,2.34,2.41,1.45],
    statistiques:   [centreX,2.34,2.41,1.45],
    graphiques:     [centreX+pitch,2.34,2.41,1.45],
  };
  const displays = GARAGE_VIEWS.map(({ id, label: title }) => {
    const [x,y,width,height] = layout[id];
    const z=screenZ,rotationY=0;
    const monitor = new T.Group();
    monitor.name = 'house-garage-monitor-' + id;
    monitor.position.set(x,y,z); monitor.rotation.y = rotationY; root.add(monitor);
    box([width*.82,.12,.13],'#515A55',[0,0,-.09],monitor,'house-gallery-wall-mount','metal',.014);
    box([width+.086,height+.088,.073], '#53615E', [0,0,0], monitor, 'house-garage-monitor-case', 'metal', .025);
    box([width+.061,height+.064,.027], '#1B2929', [0,0,.041], monitor, 'house-garage-monitor-bezel', 'rubber', .014);
    // The standby glass remains part of the actual 3D scene, including its reflections.
    const art = canvasTexture((ctx,n) => {
      ctx.scale(n/800,n/450);
      const gradient=ctx.createLinearGradient(0,0,800,450);
      gradient.addColorStop(0,'#173D3A');gradient.addColorStop(1,'#2B514A');
      ctx.fillStyle=gradient;ctx.fillRect(0,0,800,450);
      ctx.fillStyle='#BADACD';ctx.font='500 29px system-ui, sans-serif';ctx.fillText('Garapp',42,69);
      ctx.fillStyle='#FAF6EB';ctx.font='600 53px system-ui, sans-serif';ctx.fillText(title,40,252,720);
    },256);
    const glass=mesh(displayGeometry(width,height,.014), basic('#FFFFFF',{map:art}), [0,0,.059], monitor, 'house-garage-display-'+id);
    glass.castShadow=glass.receiveShadow=false;
    const centre=glass.getWorldPosition(new T.Vector3()).toArray();
    return {
      id, monitor, surface:{ position:centre, width,height,rotationY },
      label:centre,
      cameraForViewport(aspect,fov) {
        const tangent=Math.tan(fov*Math.PI/360);
        const distance=Math.max(width/(1.70*aspect*tangent),height/(1.68*tangent),(centre[1]-EYE_HEIGHT)*1.25,1.65);
        return {position:[centre[0],EYE_HEIGHT,Math.min(screenZ+distance,front-.43)],target:[...centre]};
      }
    };
  });
  let portrait=false;
  function setViewport(aspect) {
    const next=aspect<1;
    if(next===portrait)return false;
    portrait=next;
    for(const [index,display] of displays.entries()){
      let [x,y]=layout[display.id];
      if(portrait&&index>0){
        x=centreX+((index-1)%2-.5)*pitch;
        y=4.04-Math.floor((index-1)/2)*1.57;
      }
      display.monitor.position.set(x,y,screenZ);
      display.monitor.updateMatrixWorld(true);
      display.surface.position[0]=x;
      display.surface.position[1]=y;
    }
    return true;
  }
  function overviewForViewport(aspect,fov) {
    // Both vantage points are on the workshop floor, beyond the parked car.
    const tangent=Math.tan(fov*Math.PI/360);
    const distance=aspect<1?Math.max(5.05/(1.76*aspect*tangent),6.35/(1.74*tangent),4.8)
      :Math.max(7.65/(1.73*aspect*tangent),4.95/(1.58*tangent),5.85);
    return {position:[centreX,EYE_HEIGHT,Math.min(-2.92,screenZ+distance)],target:[centreX,aspect<1?3.06:4.00,screenZ]};
  }
  return {
    displays,setViewport,overviewForViewport,
    contains:([x,,z])=>z>=back&&z<=6.78&&x>(z<front?left:.81)&&x<(z<shoulder?right:5.21),
  };
}
