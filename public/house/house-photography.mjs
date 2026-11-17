// A depth-aware photographic finish, local to Plan. No continuous frame loop.
export function createHousePhotography(T, renderer) {
  const size = new T.Vector2(), resolution = new T.Vector2(1, 1);
  const beauty = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, samples: 2 });
  beauty.depthTexture = new T.DepthTexture(1, 1, T.UnsignedIntType);
  const occlusion = new T.WebGLRenderTarget(1, 1, { depthBuffer: false });
  const vertexShader = 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
  const ao = new T.ShaderMaterial({ name: 'HouseContactOcclusion', depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { depth: { value: beauty.depthTexture }, projectionInverse: { value: new T.Matrix4() }, projection: { value: new T.Matrix4() }, resolution: { value: resolution } },
    vertexShader, fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D depth;
      uniform mat4 projectionInverse, projection;
      uniform vec2 resolution;
      vec3 viewPosition(vec2 uv){vec4 p=projectionInverse*vec4(uv*2.-1.,textureLod(depth,uv,0.).r*2.-1.,1.);return p.xyz/p.w;}
      void main(){
        float d=texture2D(depth,vUv).r;
        vec3 p=viewPosition(vUv);
        vec3 n=normalize(cross(dFdx(p),dFdy(p)));
        if(d>.99998){gl_FragColor=vec4(1.);return;}
        float radius=clamp(projection[1][1]*.52/max(-p.z,.1),.002,.19);
        float sum=0.;
        for(int i=0;i<12;i++){
          float angle=float(i)*2.399963;
          float reach=.25+.75*(float(i)+.5)/12.;
          vec2 offset=vec2(cos(angle)*resolution.y/resolution.x,sin(angle))*radius*reach;
          vec2 uv=clamp(vUv+offset,vec2(.001),vec2(.999));
          vec3 delta=viewPosition(uv)-p;
          float distance=length(delta);
          float above=max(0.,dot(n,delta)/max(distance,.001)-.055);
          sum+=above*(1.-smoothstep(.08,.85,distance));
        }
        float visibility=clamp(1.-sum*.15,.38,1.);
        gl_FragColor=vec4(vec3(visibility),1.);
      }` });
  const finish = new T.ShaderMaterial({ name: 'HousePhotographicOutput', depthTest: false, depthWrite: false,
    uniforms: { image: { value: beauty.texture }, depth: { value: beauty.depthTexture }, ao: { value: occlusion.texture }, resolution: { value: resolution }, near: { value: .1 }, far: { value: 160 } },
    vertexShader, fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D image, depth, ao;
      uniform vec2 resolution;
      uniform float near, far;
      float linearDepth(vec2 uv){float d=textureLod(depth,uv,0.).r;return near*far/(far-d*(far-near));}
      void main(){
        vec3 color=texture2D(image,vUv).rgb;
        float z=linearDepth(vUv), visibility=0., weight=0.;
        for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
          vec2 uv=vUv+vec2(float(x),float(y))*2./resolution;
          float w=exp(-abs(linearDepth(uv)-z)*8.);
          visibility+=textureLod(ao,uv,0.).r*w;weight+=w;
        }
        color*=mix(.35,1.,visibility/max(weight,.001));
        // Restrained halation around truly bright glazing and light fittings.
        vec3 glow=vec3(0.);
        for(int i=0;i<8;i++){
          float a=float(i)*.785398;
          vec3 s=textureLod(image,vUv+vec2(cos(a),sin(a))*5./resolution,0.).rgb;
          glow+=max(s-vec3(1.5),vec3(0.));
        }
        color+=glow*.009;
        float vignette=smoothstep(.18,.85,length((vUv-.5)*vec2(1.,.8)));
        color*=1.-vignette*.16;
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        float grain=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5;
        gl_FragColor.rgb+=grain/420.;
      }` });
  const scene = new T.Scene(), camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new T.Mesh(new T.PlaneGeometry(2, 2), ao); quad.frustumCulled = false; scene.add(quad);
  let width = 0, height = 0;
  return {
    render(source, view) {
      renderer.getDrawingBufferSize(size);
      if (width !== size.x || height !== size.y) {
        width = size.x; height = size.y; resolution.set(width, height);
        beauty.samples = Math.min(2,renderer.capabilities.maxSamples);
        beauty.setSize(width, height); occlusion.setSize(Math.max(1, Math.ceil(width / 2)), Math.max(1, Math.ceil(height / 2)));
      }
      ao.uniforms.projectionInverse.value.copy(view.projectionMatrixInverse); ao.uniforms.projection.value.copy(view.projectionMatrix);
      finish.uniforms.near.value = view.near; finish.uniforms.far.value = view.far;
      renderer.setRenderTarget(beauty); renderer.render(source, view);
      const metrics = { triangles: renderer.info.render.triangles, drawCalls: renderer.info.render.calls };
      quad.material = ao; renderer.setRenderTarget(occlusion); renderer.render(scene, camera);
      quad.material = finish; renderer.setRenderTarget(null); renderer.render(scene, camera);
      return metrics;
    },
    dispose() { beauty.depthTexture.dispose(); beauty.dispose(); occlusion.dispose(); ao.dispose(); finish.dispose(); quad.geometry.dispose(); }
  };
}
