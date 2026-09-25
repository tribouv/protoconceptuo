// Only known retailers and their media hosts are fetched by this prototype.
export const retailerHosts=['ikea.com','leroymerlin.fr','castorama.fr','maisonsdumonde.com','laredoute.fr','alinea.com','conforama.fr','but.fr','tikamoon.com'];
export const mediaHosts=[...retailerHosts,'media.adeo.com','cdn.laredoute.com'];
export function permittedUrl(value:string,hosts:string[]){
 const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))throw new Error('Ce domaine n’est pas pris en charge. Utilisez une photo et les dimensions du produit.');return u;
}
export async function boundedBytes(response:Response,max:number){
 if(Number(response.headers.get('content-length'))>max){await response.body?.cancel();throw new Error('Fichier trop volumineux.');}
 const reader=response.body?.getReader();if(!reader)throw new Error('Réponse vide.');let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max)throw new Error('Fichier trop volumineux.');chunks.push(value)}}catch(e){await reader.cancel();throw e}finally{reader.releaseLock()}
 const out=new Uint8Array(size);let at=0;for(const c of chunks){out.set(c,at);at+=c.byteLength}return out;
}
export async function fetchTrusted(url:string,hosts:string[],max:number){
 let next=permittedUrl(url,hosts);for(let i=0;i<4;i++){
  const response=await fetch(next.href,{redirect:'manual',headers:{'User-Agent':'Conceptuo/0.1 (product preview)','Accept-Language':'fr-FR,fr;q=0.9','Accept':'text/html,image/*,*/*;q=0.8'},signal:AbortSignal.timeout(20000)});
  if(response.status>=300&&response.status<400){const location=response.headers.get('location');await response.body?.cancel();if(!location)throw new Error('Redirection invalide.');next=permittedUrl(new URL(location,next).href,hosts);continue}
  if(!response.ok){await response.body?.cancel();throw new Error('Le revendeur ne permet pas de lire cette page automatiquement. Ajoutez une photo et les dimensions manuellement.');}
  return {bytes:await boundedBytes(response,max),type:response.headers.get('content-type')??'',url:next.href};
 }
 throw new Error('Trop de redirections.');
}
export function sameOrigin(request:Request){const origin=request.headers.get('origin');return !origin||origin===new URL(request.url).origin;}
export async function jsonBody(request:Request,max=8_000_000){if(Number(request.headers.get('content-length'))>max)throw new Error('Requête trop volumineuse.');const bytes=await boundedBytes(new Response(request.body),max);return JSON.parse(new TextDecoder().decode(bytes));}
