import {z} from 'zod';
import {sameOrigin,jsonBody,fetchTrusted} from '@/lib/editor/remote';
const bodySchema=z.object({action:z.enum(['start','status','download']),key:z.string().min(5).max(300),id:z.string().regex(/^[a-zA-Z0-9-]{1,100}$/).optional(),image:z.string().max(8_000_000).regex(/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/).optional()});
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Origine non autorisée.'},{status:403});
 try{const {action,key,id,image}=bodySchema.parse(await jsonBody(request,8_100_000));if(action==='start'&&!image||action!=='start'&&!id)throw new Error('Photo ou identifiant manquant.');
 const response=await fetch(`https://api.meshy.ai/openapi/v1/image-to-3d${action==='start'?'':'/'+id}`,{method:action==='start'?'POST':'GET',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(45000),...(action==='start'?{body:JSON.stringify({image_url:image,ai_model:'meshy-6',should_texture:true,enable_pbr:true,should_remesh:true,target_polycount:30000,topology:'triangle',target_formats:['glb'],texture_resolution:'2k',image_enhancement:false,remove_lighting:true})}:{})});
 if(!response.ok)throw new Error(response.status===401?'Clé Meshy refusée.':response.status===402?'Crédits Meshy insuffisants.':response.status===429?'Limite Meshy atteinte. Réessayez plus tard.':'Meshy n’a pas pu traiter la demande.');
 const data=await response.json() as {result?:string;status?:string;progress?:number;model_urls?:{glb?:string};task_error?:{message?:string}};
 if(action==='start'){if(!data.result)throw new Error('Meshy n’a pas renvoyé d’identifiant. Ne relancez pas avant de vérifier votre tableau de bord Meshy.');return Response.json({id:data.result},{headers:{'Cache-Control':'no-store'}})}
 if(action==='status')return Response.json({id,status:data.status,progress:data.progress??0,error:data.status==='FAILED'?'La génération a échoué chez Meshy. Consultez votre tableau de bord.':null},{headers:{'Cache-Control':'no-store'}});
 if(data.status!=='SUCCEEDED'||!data.model_urls?.glb)throw new Error('Le modèle 3D n’est pas encore disponible.');
 const glb=await fetchTrusted(data.model_urls.glb,['assets.meshy.ai'],24*1024*1024);return new Response(glb.bytes,{headers:{'Content-Type':'model/gltf-binary','Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof Error&&e.name!=='ZodError'?e.message:'Demande de génération invalide.'},{status:422})}
}
