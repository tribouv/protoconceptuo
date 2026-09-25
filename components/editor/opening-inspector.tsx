"use client";
import {DoorOpen,AppWindow,Trash2} from 'lucide-react';
import NumberField from './number-field';
import {length,type Opening,type Wall} from '@/lib/editor/model';
export default function OpeningInspector({wall,opening,onChange,onDelete}:{wall:Wall;opening:Opening;onChange:(p:Partial<Opening>)=>void;onDelete:()=>void}){
 const Icon=opening.kind==='door'?DoorOpen:AppWindow;
 return <><div className="inspector-heading"><div><p className="eyebrow">OUVERTURE SÉLECTIONNÉE</p><h2 className="opening-title"><Icon/>{opening.kind==='door'?'Porte':'Fenêtre'} <span>sur {wall.name}</span></h2></div><button className="icon-button danger" aria-label="Supprimer l’ouverture" onClick={onDelete}><Trash2/></button></div><div className="property-grid"><NumberField label="Largeur" value={opening.width} min={.2} max={Math.min(8,length(wall))} onChange={width=>onChange({width})}/><NumberField label="Hauteur" value={opening.height} min={.2} max={Math.min(5,wall.height)} onChange={height=>onChange({height})}/><NumberField label="Depuis le début du mur" value={opening.offset*length(wall)} min={0} max={length(wall)} onChange={v=>onChange({offset:v/length(wall)})}/>{opening.kind==='window'&&<NumberField label="Allège" value={opening.sill} min={0} max={Math.max(0,wall.height-opening.height)} onChange={sill=>onChange({sill})}/>}</div><p className="small-text">Glissez cette ouverture le long de son mur dans le plan 2D.</p></>
}
