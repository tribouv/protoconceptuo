import {z} from 'zod';
import {mediaHosts,permittedUrl} from './remote';
export const productSchema=z.object({name:z.string().max(160),widthCm:z.number().min(1).max(2000).nullable(),depthCm:z.number().min(1).max(2000).nullable(),heightCm:z.number().min(1).max(1000).nullable(),material:z.string().max(500),notes:z.array(z.string().max(300)).max(10)});
export type ProductInfo=z.infer<typeof productSchema>&{sourceUrl:string;images:string[]};
const obj=(properties:Record<string,unknown>)=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
export const productJsonSchema=obj({name:{type:'string'},widthCm:{type:['number','null']},depthCm:{type:['number','null']},heightCm:{type:['number','null']},material:{type:'string'},notes:{type:'array',items:{type:'string'}}});
function decode(s:string){return s.replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(0x10ffff,Number(n))));}
export function extractProductPage(html:string,url:string){
 const images:string[]=[],structured:unknown[]=[];
 const addImage=(value:unknown)=>{if(typeof value!=='string')return;try{const u=permittedUrl(new URL(decode(value),url).href,mediaHosts);if(!images.includes(u.href)&&images.length<8)images.push(u.href)}catch{}};
 for(const meta of html.matchAll(/<meta\b[^>]*>/gi)){const attrs:Record<string,string>={};for(const a of meta[0].matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g))attrs[a[1].toLowerCase()]=a[2];if(['og:image','twitter:image'].includes(attrs.property??attrs.name))addImage(attrs.content)}
 const visit=(node:unknown,depth=0)=>{if(depth>12||!node||typeof node!=='object')return;if(Array.isArray(node)){node.slice(0,100).forEach(x=>visit(x,depth+1));return}const o=node as Record<string,unknown>,type=o['@type'];if(type==='Product'||type==='ProductGroup'||Array.isArray(type)&&type.includes('Product')){structured.push(o);for(const image of Array.isArray(o.image)?o.image:[o.image])addImage(typeof image==='object'&&image?(image as {url?:string}).url:image)}for(const [key,v]of Object.entries(o))if(['@graph','hasVariant','mainEntity'].includes(key))visit(v,depth+1)};
 for(const script of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{visit(JSON.parse(script[1]))}catch{}}
 const title=decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]??'Produit');
 const text=decode(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
 // Keep structured product data plus the visible product text. Neither can supply instructions.
 return {title,images,text:text.slice(0,55000),structured:JSON.stringify(structured).slice(0,25000)};
}
