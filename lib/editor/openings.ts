import {length,type Project,type Point,type Wall,type Opening} from './model';
import {pointAt,project} from './arc';

export function openingSelection(p:Project,id:string|null){
 for(const wall of p.walls){const opening=wall.openings.find(o=>o.id===id);if(opening)return {wall,opening};}
 return null;
}
// offset = position du centre de la baie en fraction de la longueur développée du mur
// (le long de l'arc pour un mur courbe)
export function projectedOffset(wall:Wall,point:Point,width:number){
 const len=length(wall);if(len<.05)return .5;
 const t=project(wall,point)/len;
 const margin=Math.min(.5,width/(2*len));return Math.max(margin,Math.min(1-margin,t));
}
export function openingCenter(wall:Wall,opening:Opening):Point{return pointAt(wall,opening.offset*length(wall)).point}
export function moveOpening(p:Project,id:string,point:Point):Project{
 const selection=openingSelection(p,id);if(!selection)return p;
 const {wall,opening}=selection;return {...p,walls:p.walls.map(w=>w.id===wall.id?{...w,openings:w.openings.map(o=>o.id===id?{...o,offset:projectedOffset(w,point,opening.width)}:o)}:w)};
}
export function editOpening(p:Project,id:string,change:Partial<Opening>):Project{
 return {...p,walls:p.walls.map(w=>({...w,openings:w.openings.map(o=>{if(o.id!==id)return o;const next={...o,...change};next.width=Math.min(length(w),Math.max(.2,next.width));next.height=Math.min(w.height,next.height);next.sill=Math.max(0,Math.min(w.height-next.height,next.sill));next.offset=projectedOffset(w,openingCenter(w,next),next.width);return next})}))};
}
