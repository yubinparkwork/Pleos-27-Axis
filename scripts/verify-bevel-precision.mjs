import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const shader=await readFile('src/optical-studio/optical.frag.glsl','utf8');
const helper=shader.slice(shader.indexOf('float intersectRoundedBox('),shader.indexOf('float intersectRoundedAt('));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--use-angle=metal']});
try {
 const page=await browser.newPage();
 const report=await page.evaluate(source=>{
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=1;
  const gl=canvas.getContext('webgl2');if(!gl||!gl.getExtension('EXT_color_buffer_float'))throw Error('Float WebGL2 unavailable');
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,128,1,0,gl.RGBA,gl.FLOAT,null);
  const fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);gl.viewport(0,0,128,1);
  function compile(type,text){const sh=gl.createShader(type);gl.shaderSource(sh,text);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;}
  function run(fixed){
   const program=gl.createProgram();
   gl.attachShader(program,compile(gl.VERTEX_SHADER,'#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0.,1.);}'));
   gl.attachShader(program,compile(gl.FRAGMENT_SHADER,'#version 300 es\n'+(fixed?'#define HYBRID_AB\n':'')+'precision highp float;const float EPS=.000002;const float FAR=100.;out vec4 colour;\n'+source+'\nvoid main(){float a=.35+gl_FragCoord.x/128.*.85;vec3 n=vec3(cos(a),sin(a),0.);vec3 hit=vec3(.97,.97,.2)+n*.03;vec3 rd=normalize(-n+vec3(-n.y,n.x,0.)*.3);vec3 ro=hit-rd*12.;float t=intersectRoundedBox(ro,rd,vec3(0),vec3(1),.03);vec3 actual=normalize(max(abs(ro+t*rd)-vec3(.97),vec3(0)))*sign(ro+t*rd);colour=vec4(abs(t-12.),length(actual-n),0.,1.);}'));
   gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);gl.drawArrays(gl.TRIANGLES,0,3);
   const pixels=new Float32Array(512);gl.readPixels(0,0,128,1,gl.RGBA,gl.FLOAT,pixels);let hitError=0,normalError=0;for(let i=0;i<128;i++){hitError+=pixels[i*4];normalError+=pixels[i*4+1];}return {hitError:hitError/128,normalError:normalError/128};
  }
  return {before:run(false),after:run(true)};
 },helper);
 assert(report.after.hitError<report.before.hitError*.25,'Bevel hit precision did not improve');
 assert(report.after.normalError<report.before.normalError*.25,'Bevel normal precision did not improve');
 await mkdir('artifacts/axis-64spp-diagnosis',{recursive:true});await writeFile('artifacts/axis-64spp-diagnosis/precision.json',JSON.stringify(report,null,2));console.log(report);
} finally {await browser.close();}
