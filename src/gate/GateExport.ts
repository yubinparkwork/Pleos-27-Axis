import { createSink, encodingSettings, selectEncoder } from '../optical-studio/OpticalVideoExporter';
import { GateRenderer } from './GateRenderer';
import type { GateState } from './GateState';
export async function exportGateVideo(state:GateState,width:number,height:number,start:number,end:number,
  signal:AbortSignal,progress:(text:string,value:number)=>void):Promise<Blob>{
  if(!globalThis.isSecureContext||typeof VideoEncoder!=='function')throw new Error('MP4 출력은 최신 Chrome에서 localhost 또는 HTTPS로 열어 주세요.');
  if(![width,height].every(n=>Number.isInteger(n)&&n>=16&&n<=5248&&n%2===0)||
    ![start,end].every(Number.isFinite)||start<0||end<=start||end-start>120)throw new Error('출력 크기·시간 범위를 확인해 주세요.');
  const fps=30,frames=Math.ceil((end-start)*fps),options={width,height,fps,samples:4,start,end};
  const mb=await import('mediabunny');
  const bitrate=encodingSettings(options).bitrate;
  const quality=new mb.Quality({bitrate,bitrateMode:'variable'});
  const encoder=await selectEncoder(mb,options,quality,signal);
  const sink=await createSink(mb,bitrate/8*(end-start)*1.4+8*1024*1024,signal);
  let renderer:GateRenderer|undefined,output:InstanceType<typeof mb.Output>|undefined,success=false;
  const abort=()=>{if(output&&output.state!=='finalized'&&output.state!=='finalizing')void output.cancel().catch(()=>undefined);};
  signal.addEventListener('abort',abort,{once:true});
  try{
    renderer=new GateRenderer();
    const source=new mb.CanvasSource(renderer.canvas,{codec:encoder.codec,fullCodecString:encoder.fullCodecString,
      quality,hardwareAcceleration:encoder.hardwareAcceleration,latencyMode:'quality',alpha:'discard'});
    // Set dimensions before encoder starts. No live-preview resolution reuse.
    renderer.render(state,start,width,height);
    output=new mb.Output({format:new mb.Mp4OutputFormat({fastStart:'reserve'}),target:sink.target});
    output.addVideoTrack(source,{frameRate:fps,maximumPacketCount:frames});await output.start();
    for(let frame=0;frame<frames;frame++){
      if(signal.aborted)throw new DOMException('내보내기를 취소했습니다.','AbortError');
      renderer.render(state,start+frame/fps,width,height);await source.add(frame/fps,1/fps);
      progress(`영상 생성 ${frame+1}/${frames} · ${width}×${height} · ${encoder.label}`,(frame+1)/frames*.98);
      await new Promise<void>(resolve=>setTimeout(resolve,0));
    }
    await output.finalize();const blob=await sink.complete();success=true;return blob;
  }finally{
    signal.removeEventListener('abort',abort);renderer?.dispose();
    if(!success){abort();await sink.cancel();}
  }
}
export function download(blob:Blob,name:string){
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
