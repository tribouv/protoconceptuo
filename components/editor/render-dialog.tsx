"use client";
import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {Download,Pause,Play,Loader2} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {buildScene,disposeObject} from '@/lib/editor/scene';
import type {Project} from '@/lib/editor/model';
export type Viewpoint={position:[number,number,number];target:[number,number,number];fov:number};
export default function RenderDialog({open,onOpenChange,project,viewpoint}:{open:boolean;onOpenChange:(v:boolean)=>void;project:Project;viewpoint:Viewpoint|null}){
 const [host,setHost]=useState<HTMLDivElement|null>(null);const canvas=useRef<HTMLCanvasElement|null>(null),paused=useRef(false);
 const [quality,setQuality]=useState('64'),[light,setLight]=useState('day'),[samples,setSamples]=useState(0),[phase,setPhase]=useState('Préparation des matériaux…'),[error,setError]=useState(''),[isPaused,setPaused]=useState(false),[fallback,setFallback]=useState(false);
 useEffect(()=>{
  if(!open||!viewpoint)return;let cancelled=false,frame=0,root:THREE.Group|null=null,environment:THREE.Texture|null=null,renderer:THREE.WebGLRenderer|null=null,tracer:import('three-gpu-pathtracer').WebGLPathTracer|null=null;
  setSamples(0);setError('');setPhase('Préparation des matériaux…');paused.current=false;setPaused(false);
  (async()=>{
   const el=host;if(!el)return;
   renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1280,800);renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=light==='day'?1:.9;renderer.outputColorSpace=THREE.SRGBColorSpace;
   canvas.current=renderer.domElement;el.replaceChildren(renderer.domElement);
   const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(viewpoint.fov,1.6,.05,500);camera.position.fromArray(viewpoint.position);camera.lookAt(new THREE.Vector3().fromArray(viewpoint.target));camera.updateMatrixWorld();scene.background=new THREE.Color('#e9e6df');
   root=await buildScene(project);if(cancelled){disposeObject(root);root=null;return}scene.add(root);
   const ground=new THREE.Mesh(new THREE.PlaneGeometry(500,500),new THREE.MeshStandardMaterial({color:'#e4dfd5',roughness:.78}));ground.rotation.x=-Math.PI/2;ground.position.y=-.12;root.add(ground);
   if(fallback){const sun=new THREE.DirectionalLight('#fff0d8',3);sun.position.set(-6,12,8);scene.add(sun,new THREE.HemisphereLight('#fff9ee','#aba28e',2));renderer.render(scene,camera);setSamples(1);setPhase('Rendu standard prêt');return;}
   if(!renderer.extensions.has('EXT_color_buffer_float'))throw new Error('Le rendu avancé n’est pas compatible avec ce navigateur. Vous pouvez exporter un rendu standard.');
   setPhase('Préparation de l’éclairage…');
   const {WebGLPathTracer,GradientEquirectTexture}=await import('three-gpu-pathtracer');if(cancelled)return;
   const sky=new GradientEquirectTexture(256);sky.topColor.set(light==='day'?'#e3efff':'#ffe0ba');sky.bottomColor.set('#a89c86');sky.exponent=1.2;sky.update();sky.mapping=THREE.EquirectangularReflectionMapping;environment=sky;scene.environment=sky;scene.environmentIntensity=.85;
   const key=new THREE.RectAreaLight(light==='day'?'#ffeed2':'#ffc382',9,7,7);key.position.set(viewpoint.target[0]-5,9,viewpoint.target[2]+3);key.lookAt(viewpoint.target[0],0,viewpoint.target[2]);scene.add(key);
   tracer=new WebGLPathTracer(renderer);tracer.bounces=5;tracer.filterGlossyFactor=.5;tracer.tiles.set(2,2);tracer.textureSize.set(1024,1024);tracer.renderDelay=0;tracer.minSamples=1;tracer.fadeDuration=0;tracer.setScene(scene,camera);setPhase('Calcul de la lumière et des ombres…');
   const tick=()=>{if(cancelled||!tracer)return;frame=requestAnimationFrame(tick);if(paused.current||tracer.samples>=Number(quality))return;try{tracer.renderSample();const count=Math.floor(tracer.samples);setSamples(count);if(count>=Number(quality))setPhase('Rendu terminé')}catch(e){setError(e instanceof Error?e.message:'Le rendu a échoué.');cancelAnimationFrame(frame)}};tick();
  })().catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'Rendu indisponible sur cet appareil.')});
  return()=>{cancelled=true;cancelAnimationFrame(frame);tracer?.dispose();if(root)disposeObject(root);environment?.dispose();renderer?.dispose();renderer?.domElement.remove();canvas.current=null};
 },[open,viewpoint,project,quality,light,fallback,host]);
 const done=fallback?samples>0:samples>=Number(quality);
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="render-dialog"><DialogTitle>Rendu de votre projet</DialogTitle><DialogDescription>Le cadrage reprend votre vue 3D. Les matériaux et textures du projet sont conservés. Le rendu se précise progressivement.</DialogDescription><div className="render-options"><Select value={quality} onValueChange={setQuality}><SelectTrigger aria-label="Qualité du rendu"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="32">Rapide · 32 passes</SelectItem><SelectItem value="64">Standard · 64 passes</SelectItem><SelectItem value="128">Fin · 128 passes</SelectItem></SelectContent></Select><Select value={light} onValueChange={setLight}><SelectTrigger aria-label="Ambiance lumineuse"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="day">Lumière du jour</SelectItem><SelectItem value="warm">Lumière chaude</SelectItem></SelectContent></Select><span>1 280 × 800 px</span></div><div ref={setHost} className="render-canvas"/>{error?<div className="render-error" role="alert"><p>{error}</p><button className="outline-button" onClick={()=>setFallback(true)}>Essayer le rendu standard</button></div>:<><div className="render-progress"><span>{!done&&<Loader2 className="animate-spin"/>}{phase}</span><span>{fallback?'Rendu standard':`${samples} / ${quality} passes`}</span></div><progress value={fallback?1:samples} max={fallback?1:Number(quality)} /></>}<div className="dialog-actions">{!fallback&&!done&&<button className="outline-button" onClick={()=>{paused.current=!paused.current;setPaused(paused.current)}}>{isPaused?<Play/>:<Pause/>}{isPaused?'Reprendre':'Pause'}</button>}<button className="primary-button" disabled={samples<1||!!error} onClick={()=>canvas.current?.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${project.name}-rendu.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)},'image/png')}><Download/>{done?'Télécharger le rendu':'Télécharger l’aperçu'}</button></div></DialogContent></Dialog>
}
