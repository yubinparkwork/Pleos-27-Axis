import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Execute the production GLSL itself: proves front/back/side walls exist,
// normals turn around the rim, and a ray really traverses the empty joint.
export async function testDetachedPanelGeometry(page, root) {
  const source = await readFile(root + '/src/optical-studio/optical.frag.glsl', 'utf8');
  const start = source.indexOf('float intersectRoundedBox(');
  const end = source.indexOf('float intersectRoundedExact(');
  const functions = source.slice(start, end);
  assert(start > 0 && end > start);
  assert(!source.includes('splitFaceAperture'), 'Clipped-fold implementation remains');
  const result = await page.evaluate(functions => {
    const canvas = document.createElement('canvas');canvas.width=9;canvas.height=1;
    const gl = canvas.getContext('webgl2');
    if(!gl?.getExtension('EXT_color_buffer_float'))throw Error('Geometry GPU test needs float targets');
    const shader=(type,source)=>{
      const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;
    };
    const vertex=shader(gl.VERTEX_SHADER,`#version 300 es
      void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0,1);}`);
    const fragment=shader(gl.FRAGMENT_SHADER,`#version 300 es
      precision highp float;precision highp int;
      #define AXIS_SPLIT
      const float uHalf=1.0,uBevel=.03,uAxisFaceGap=.08,uHybridOpening=1.0,EPS=.000002,FAR=100.0;
      const vec3 uCenters[3]=vec3[3](vec3(1),vec3(1),vec3(1));
      out vec4 value;
      ${functions}
      void main(){
        int sampleId=int(gl_FragCoord.x);float d=splitThickness(),s=splitInset();
        vec3 ro=vec3(-1,1,1),rd=vec3(1,0,0);
        if(sampleId==1||sampleId==6){ro=vec3(d+.1,1,1);rd=vec3(-1,0,0);}
        if(sampleId==2||sampleId==7){ro=vec3(d*.5,s-.2,1);rd=vec3(0,1,0);}
        if(sampleId==3){ro=vec3(-1,-1,1);rd=normalize(vec3(1,1,0));}
        if(sampleId==4){ro=vec3(-1,s-1.0,1);rd=normalize(vec3(1,1,0));}
        float t=sampleId>=6?splitFrontHit(ro,rd,0):splitHit(ro,rd,0);vec3 p=ro+t*rd;
        vec3 n=t<FAR?splitPanelNormal(p,0,splitPanelAt(p,0)):vec3(0);
        value=vec4(t,n);
        if(sampleId==5)value=vec4(splitImageEntry(vec3(0,s+.2,s+.3),0),1);
      }`);
    const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA32F,9,1);
    const framebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Incomplete geometry test framebuffer');
    gl.useProgram(program);gl.viewport(0,0,9,1);gl.drawArrays(gl.TRIANGLES,0,3);
    const values=new Float32Array(36);gl.readPixels(0,0,9,1,gl.RGBA,gl.FLOAT,values);
    gl.deleteFramebuffer(framebuffer);gl.deleteTexture(texture);gl.deleteProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return Array.from({length:9},(_,i)=>Array.from(values.slice(i*4,i*4+4)));
  },functions);
  const close=(a,b)=>assert(Math.abs(a-b)<.002,`${a} != ${b}`);
  close(result[0][0],1);close(result[0][1],-1);
  close(result[1][0],.1);close(result[1][1],1);
  close(result[2][0],.2);close(result[2][2],-1);
  close(result[3][0],100);
  assert(result[4][1]<-.5 && result[4][2]<-.5, 'Rounded rim has no turning normal');
  close(result[5][0],0);close(result[5][1],.2);close(result[5][2],.3);
  close(result[6][0],100);close(result[7][0],100);close(result[8][0],1);
  return {status:'pass',front:result[0],back:result[1],side:result[2],emptyJoint:result[3],roundedRim:result[4],transportedImage:result[5],cameraBack:result[6],cameraSide:result[7],cameraFront:result[8]};
}
