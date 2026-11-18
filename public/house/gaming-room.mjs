// The games wing shares the house's metre-based architecture and collision helpers.
export function buildGamingRoom(world, kit) {
  const T=world.THREE;
  const {root,roof,box,mesh,curve,wall,frame,windowPane,material,basic,canvasTexture,roundedGeometry,obstacle,contact,materials}=kit;
  const room=new T.Group();room.name='house-gaming-room';root.add(room);
  const dark='#1B2639',metal='#19212C',wood='#9FA5A4';
  box([4.62,.19,7.7],'#D8DDD8',[-7.42,-.16,0],root,'house-gaming-foundation','stone',.025);
  box([4.32,.06,7.18],'#6D7781',[-7.42,-.01,0],room,'house-gaming-floor','floor',.018);
  const rear=wall('x',-3.49,-9.66,-5.19,[],'gaming-rear');rear.material=material(dark,'plaster');
  const west=wall('z',-9.55,-3.6,3.6,[],'gaming-west');west.material=material(dark,'plaster');
  const front=wall('x',3.49,-9.66,-5.19,[{from:-9.10,to:-5.85,bottom:.55,top:2.32}],'gaming-front');
  windowPane('x',3.49,-9.10,-5.85,.55,2.32);
  box([4.78,.20,7.66],'#344243',[-7.43,2.97,0],roof,'house-gaming-roof','paint',.045);
  box([4.43,.045,7.25],'#202B3D',[-7.43,2.84,0],roof,'house-gaming-ceiling','paint',.012);
  for(const x of [-9.79,-5.08])box([.08,.16,7.62],metal,[x,2.93,0],roof,'house-gaming-roof-fascia','metal',.015);
  frame('z',-5.19,1.2,2.5,0,2.2);
  const door=new T.Group();door.name='house-open-gaming-door';door.position.set(-5.19,0,2.5);door.rotation.y=Math.PI/2;root.add(door);
  box([.075,2.12,1.24],'#303A4B',[0,1.06,-.62],door,'house-gaming-door-leaf','paint',.02);
  box([.055,.04,.18],'#A1AEB9',[.065,1.05,-1.05],door,'house-gaming-door-handle','metal',.012);
  obstacle(door,'open-gaming-door');
  for(const x of [-9.43,-5.32])box([.035,.10,6.75],'#283349',[x,.07,0],room,'house-gaming-skirting','paint',.008);
  box([4.07,.10,.035],'#283349',[-7.42,.07,-3.35],room,'house-gaming-skirting','paint',.008);

  function luminous(color,intensity=3){const value=new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:intensity,roughness:.35});materials.add(value);return value;}
  const cyan=luminous('#44D9F4'),pink=luminous('#D84ED9'),blue=luminous('#7673FF');
  for(const [x,m]of [[-9.37,cyan],[-5.4,pink]])box([.022,.026,6.46],m,[x,2.66,0],room,'house-gaming-rgb-cove','paint',.004).castShadow=false;
  box([3.95,.026,.022],blue,[-7.42,2.66,-3.31],room,'house-gaming-rgb-cove','paint',.004).castShadow=false;
  const glow=canvasTexture((ctx,n)=>{const g=ctx.createRadialGradient(n/2,n/2,0,n/2,n/2,n*.5);g.addColorStop(0,'rgba(255,255,255,.7)');g.addColorStop(.4,'rgba(255,255,255,.17)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,n,n);},128);
  for(const [x,color]of [[-8.8,'#23A7DB'],[-6.1,'#A435D1']]){
    const wash=mesh(new T.PlaneGeometry(2.8,2.6),basic(color,{map:glow,opacity:.35}),[x,1.5,-3.345],room,'house-gaming-light-wash');wash.castShadow=wash.receiveShadow=false;wash.userData.pickThrough=true;
  }
  if(!world.quality?.software){
    const cool=new T.PointLight('#45C8FF',12,4.4,2);cool.position.set(-8.65,1.85,-1.7);room.add(cool);
    const warm=new T.PointLight('#BD47F3',9,4.2,2);warm.position.set(-6.1,1.5,-2.2);room.add(warm);
  }
  // Acoustic fins and shallow illuminated hexagons, rather than a glowing wall.
  const fins=new T.InstancedMesh(roundedGeometry([.065,1.68,.07],.008,3),material('#28354B'),32);fins.name='house-gaming-acoustic-fins';
  const matrix=new T.Matrix4();for(let i=0;i<32;i++)fins.setMatrixAt(i,matrix.makeTranslation(-9.26+i*.115,1.69,-3.31));room.add(fins);
  for(const [x,y,m]of [[-8.8,2.1,cyan],[-8.43,2.31,blue],[-8.06,2.1,pink]]){
    const tile=mesh(new T.CylinderGeometry(.205,.205,.026,6),m,[x,y,-3.24],room,'house-gaming-hex-light');tile.rotation.x=Math.PI/2;tile.castShadow=false;
    const inset=mesh(new T.CylinderGeometry(.185,.185,.028,6),'#273349',[x,y,-3.222],room,'house-gaming-hex-inset');inset.rotation.x=Math.PI/2;
  }

  const desk=new T.Group();desk.name='house-gaming-workstation';room.add(desk);
  box([3.35,.10,1.08],wood,[-7.45,.77,-2.56],desk,'house-gaming-desk','wood',.035);
  for(const x of [-8.94,-5.96])for(const z of [-2.98,-2.16])box([.055,.72,.055],metal,[x,.36,z],desk,'house-gaming-desk-leg','metal',.012);
  box([3.10,.012,.021],pink,[-7.45,.724,-2.04],desk,'house-gaming-desk-rgb','paint',.004).castShadow=false;
  box([1.55,.009,.47],'#182536',[-7.83,.826,-2.25],desk,'house-gaming-desk-mat','rubber',.035);
  box([.52,.025,.20],'#172334',[-7.94,.847,-2.21],desk,'house-gaming-keyboard','metal',.018);
  const keys=new T.InstancedMesh(roundedGeometry([.033,.009,.031],.004,3),material('#9CADC6'),42);keys.name='house-gaming-keycaps';
  for(let row=0,index=0;row<3;row++)for(let col=0;col<14;col++)keys.setMatrixAt(index++,matrix.makeTranslation(-8.18+col*.036,.867,-2.27+row*.046));desk.add(keys);
  box([.48,.004,.009],cyan,[-7.94,.837,-2.101],desk,'house-gaming-keyboard-rgb','paint',.002).castShadow=false;
  const mouse=mesh(new T.SphereGeometry(.065,16,10),'#25364C',[-7.34,.849,-2.20],desk,'house-gaming-mouse','paint');mouse.scale.set(.8,.40,1.35);
  curve([[-7.34,.872,-2.26],[-7.34,.874,-2.17]],cyan,.0025,desk,'house-gaming-mouse-rgb');
  box([.46,.028,.30],'#253346',[-7.88,.842,-2.59],desk,'house-gaming-monitor-foot','metal',.02);
  box([.065,.34,.065],'#35465B',[-7.88,1.015,-2.61],desk,'house-gaming-monitor-stand','metal',.014);
  box([1.88,.89,.065],'#111B29',[-7.88,1.55,-2.52],desk,'house-gaming-monitor-frame','metal',.028);
  const screenMap=canvasTexture((ctx,n)=>{
    ctx.scale(1,1.76/.78);
    const height=n/(1.76/.78);
    ctx.fillStyle='#091423';ctx.fillRect(0,0,n,n);
    const gradient=ctx.createLinearGradient(0,0,n,height);gradient.addColorStop(0,'#164F68');gradient.addColorStop(.5,'#16243C');gradient.addColorStop(1,'#492B68');ctx.fillStyle=gradient;ctx.fillRect(6,6,n-12,height-12);
    ctx.strokeStyle='#65DCED24';ctx.lineWidth=1;for(let x=18;x<n;x+=24){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,n);ctx.stroke();}
    ctx.fillStyle='#67D8F0';ctx.font='9px monospace';ctx.fillText('SINIVERSE / PLAY',28,25);
    ctx.fillStyle='#EDF5FF';ctx.font='600 26px sans-serif';ctx.fillText('Les jeux prennent vie ici.',27,63);
    ctx.fillStyle='#AEBAD2';ctx.font='10px sans-serif';ctx.fillText('LE BUREAU GAMING',28,88);
    ctx.fillStyle='#5EE0EF';ctx.fillRect(28,height-18,n-56,1);
  },512);
  const monitor=mesh(new T.PlaneGeometry(1.76,.78),basic('#FFFFFF',{map:screenMap}),[-7.88,1.55,-2.482],desk,'house-gaming-screen');monitor.castShadow=monitor.receiveShadow=false;
  const glass=new T.MeshPhysicalMaterial({color:'#7293AF',transparent:true,opacity:.17,roughness:.07,metalness:.18,depthWrite:false});materials.add(glass);
  const pc=new T.Group();pc.name='house-gaming-desktop-pc';pc.position.set(-6.25,.83,-2.58);desk.add(pc);
  box([.47,.82,.65],'#0E1724',[0,.41,0],pc,'house-gaming-pc-chassis','metal',.025);
  // A real opening in the side of the tower exposes the motherboard, GPU and cooler.
  const chassis=pc.getObjectByName('house-gaming-pc-chassis');chassis.visible=false;
  for(const y of [.015,.805])box([.47,.03,.65],'#101A29',[0,y,0],pc,'house-gaming-pc-shell','metal',.01);
  box([.025,.76,.65],'#142035',[.225,.41,0],pc,'house-gaming-pc-motherboard-side','metal',.008);
  box([.45,.76,.022],'#142035',[0,.41,-.314],pc,'house-gaming-pc-back','metal',.008);
  box([.45,.76,.022],'#142035',[0,.41,.314],pc,'house-gaming-pc-front','metal',.008);
  box([.012,.755,.61],glass,[-.236,.41,0],pc,'house-gaming-pc-glass','paint',.006).castShadow=false;
  box([.025,.43,.44],'#243246',[.185,.48,-.04],pc,'house-gaming-motherboard','paint',.008);
  box([.31,.065,.44],'#334055',[0,.28,-.02],pc,'house-gaming-graphics-card','metal',.012);
  box([.012,.009,.39],cyan,[-.17,.305,-.02],pc,'house-gaming-gpu-rgb','paint',.002).castShadow=false;
  for(const z of [-.12,-.06])box([.035,.27,.023],pink,[.14,.52,z],pc,'house-gaming-rgb-memory','paint',.004).castShadow=false;
  function fan(parent,position,color,side=false){
    const hub=mesh(new T.CylinderGeometry(.031,.031,.02,16),'#4C5E74',position,parent,'house-gaming-fan-hub','metal');hub.rotation.x=Math.PI/2;if(side)hub.rotation.z=Math.PI/2;
    const ring=mesh(new T.TorusGeometry(.085,.007,8,32),color,position,parent,'house-gaming-rgb-fan');if(side)ring.rotation.y=-Math.PI/2;ring.castShadow=false;
    for(let i=0;i<7;i++){const a=i*Math.PI*2/7;const blade=box([.025,.067,.007],'#3D526A',[position[0]+(side?0:Math.cos(a)*.046),position[1]+Math.sin(a)*.046,position[2]+(side?Math.cos(a)*.046:0)],parent,'house-gaming-fan-blade','paint',.007);if(side)blade.rotation.y=Math.PI/2;blade.rotation.z=-a+.6;blade.castShadow=false;}
  }
  for(const [y,m]of [[.17,cyan],[.41,blue],[.65,pink]])fan(pc,[0,y,.334],m);
  fan(pc,[-.12,.55,.08],blue,true);
  box([.28,.13,.58],'#152031',[0,.085,0],pc,'house-gaming-power-supply','metal',.014);
  box([.014,.005,.045],cyan,[.15,.827,.22],pc,'house-gaming-power-button','paint',.002).castShadow=false;
  curve([[.04,.32,.05],[.10,.37,.18],[.10,.66,.18],[-.10,.68,.12]],'#384D64',.012,pc,'house-gaming-pc-cable');
  for(const x of [-8.98,-6.72]){
    box([.16,.25,.18],'#1C293B',[x,.95,-2.58],desk,'house-gaming-speaker','paint',.02);
    const cone=mesh(new T.CylinderGeometry(.052,.052,.012,24),'#667B8D',[x,.97,-2.48],desk,'house-gaming-speaker-cone','rubber');cone.rotation.x=Math.PI/2;
  }
  const chair=new T.Group();chair.name='house-gaming-chair';chair.position.set(-7.82,0,-1.57);desk.add(chair);
  box([.58,.11,.55],'#283449',[0,.48,0],chair,'house-gaming-chair-seat','rubber',.08);
  const back=box([.54,.77,.13],'#283449',[0,.95,.22],chair,'house-gaming-chair-back','rubber',.07);back.rotation.x=-.12;
  box([.28,.16,.10],'#40475D',[0,1.25,.12],chair,'house-gaming-chair-headrest','rubber',.045);
  for(const x of [-.35,.35]){box([.08,.045,.33],'#3A465A',[x,.70,.02],chair,'house-gaming-chair-arm','rubber',.015);box([.035,.24,.035],metal,[x,.57,.08],chair,'house-gaming-chair-arm-support','metal',.008);}
  mesh(new T.CylinderGeometry(.045,.055,.35,16),metal,[0,.23,0],chair,'house-gaming-chair-piston','metal');
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5;curve([[0,.10,0],[Math.cos(a)*.31,.065,Math.sin(a)*.31]],metal,.022,chair,'house-gaming-chair-spoke',false,'metal');const wheel=mesh(new T.SphereGeometry(.045,10,8),metal,[Math.cos(a)*.31,.045,Math.sin(a)*.31],chair,'house-gaming-chair-caster','rubber');wheel.scale.set(1,.8,1);}
  contact([-7.45,.025,-2.10],[3.8,2.9],.6);
  obstacle(desk,'gaming-workstation');
  return {room,monitor,pc,door,surface:{position:[-7.88,1.55,-2.46],width:1.76,height:.78,rotationY:0},doorway:[-5.19,1.85],view:{position:[-7.55,1.65,.9],target:[-7.65,1.45,-2.5]},screenView:{position:[-7.88,1.65,-.3],target:[-7.88,1.55,-2.48]}};
}
