import fragment from './gate.frag.glsl?raw';
import opticalSource from '../optical-studio/optical.frag.glsl?raw';
import type { GateState } from './GateState';
// Reuse studio emitters. Cube body-diagonal black flags do not belong to an
// uninterrupted gate contour; omit that final mask only in this adapter.
const profileStart=opticalSource.indexOf('vec3 environmentProfile(');
const profileEnd=opticalSource.indexOf('\nvec3 environment(',profileStart);
if(profileStart<0||profileEnd<profileStart)throw new Error('기존 광원 계산을 찾을 수 없습니다.');
const profile=opticalSource.slice(profileStart,profileEnd).replace('return result * negativeFill * uLightIntensity;','return result * uLightIntensity;');
const gateFragment=fragment.replace('// STUDIO_PROFILE_SOURCE',profile);
const vertex=`#version 300 es
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0.,1.);}`;
export class GateRenderer{
  readonly canvas=document.createElement('canvas');
  private gl:WebGL2RenderingContext;private program:WebGLProgram;private vao:WebGLVertexArrayObject;
  private uniforms=new Map<string,WebGLUniformLocation>();
  constructor(){
    const gl=this.canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:true});
    if(!gl)throw new Error('WebGL2가 필요합니다. Chrome 하드웨어 가속을 확인해 주세요.');this.gl=gl;
    const shaders:WebGLShader[]=[];
    try{
      for(const [type,source]of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,gateFragment]]as const){
        const s=gl.createShader(type)!;shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);
        if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(`게이트 셰이더 오류: ${gl.getShaderInfoLog(s)}`);}
      this.program=gl.createProgram()!;for(const s of shaders)gl.attachShader(this.program,s);gl.linkProgram(this.program);
      if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error('게이트 셰이더 연결 실패');
      this.vao=gl.createVertexArray()!;
      for(const name of ['uResolution','uTime','uStructure','uWidth','uShape','uLight','uTiming','uFade','uRed','uGreen','uBlue','uMaterial','uOptics','uRig','uFace'])this.uniforms.set(name,gl.getUniformLocation(this.program,name)!);
    }catch(error){gl.getExtension('WEBGL_lose_context')?.loseContext();throw error;}
    finally{for(const s of shaders)gl.deleteShader(s);}
  }
  render(s:GateState,time:number,width:number,height:number){
    const gl=this.gl;if(gl.isContextLost())throw new Error('GPU 연결이 중단되었습니다. 페이지를 다시 열어 주세요.');
    const max=gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    if(width>max[0]||height>max[1])throw new Error('GPU 출력 크기 한도를 초과했습니다.');
    if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
    gl.viewport(0,0,width,height);gl.useProgram(this.program);gl.bindVertexArray(this.vao);
    const u=(n:string)=>this.uniforms.get(n)!;
    gl.uniform2f(u('uResolution'),width,height);gl.uniform1f(u('uTime'),time);
    gl.uniform4f(u('uStructure'),s.layers,s.depth,s.speed,s.softness);
    gl.uniform2f(u('uWidth'),s.frontWidth,s.widthTaper);
    gl.uniform2f(u('uShape'),s.cornerRadius,s.bloomDirection);
    gl.uniform4f(u('uMaterial'),s.hybridDistortion,s.hybridDensity,s.hybridColorMix,s.subPercent/100);
    gl.uniform4f(u('uOptics'),s.ior,s.roughness,s.reflection,s.absorption);
    gl.uniform2f(u('uRig'),s.lightSpread,s.exposure);
    gl.uniform3f(u('uFace'),s.faceReflection,s.faceWidth,s.refractionOverlap);
    gl.uniform4f(u('uLight'),s.brightness,s.falloff,s.dispersion,s.introduction);
    gl.uniform4f(u('uTiming'),s.stagger,s.holdRed,s.holdGreen,s.holdBlue);gl.uniform1f(u('uFade'),s.colorFade);
    for(const[name,hex]of [['uRed',s.red],['uGreen',s.green],['uBlue',s.blue]]){
      const v=parseInt(hex.slice(1),16),linear=(n:number)=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4;
      gl.uniform3f(u(name),linear((v>>16)/255),linear(((v>>8)&255)/255),linear((v&255)/255));}
    gl.drawArrays(gl.TRIANGLES,0,3);
  }
  dispose(){this.gl.deleteProgram(this.program);this.gl.deleteVertexArray(this.vao);this.gl.getExtension('WEBGL_lose_context')?.loseContext();}
}
