// Plan d'exemple GÉNÉRÉ — ne pas éditer à la main.
// Source : tests/fixtures/plan-exemple.pdf, page 1, relu par l'extraction vectorielle (pdf-vector.ts), échelle
// 1/80 lue au cartouche, hauteur sous plafond 2.73 m lue sur le plan.
// Pour le régénérer : node scripts/build-example-plan.mjs
// a/b = AXE de chaque mur : le trait 2D et la boîte 3D sont centrés dessus.
import { type Project, type Wall } from './model';

const NAME = "Appartement 79 m² — Lefebvre";
const WALLS: Wall[] = [
    {id:"mur-1",name:"Mur 1",a:{x:4.514,y:0.572},b:{x:5.311,y:0.577},thickness:0.327,height:2.73,openings:[]},
    {id:"mur-2",name:"Mur 2",a:{x:5.311,y:0.5},b:{x:11.645,y:0.508},thickness:0.196,height:2.73,openings:[]},
    {id:"mur-3",name:"Mur 3",a:{x:11.645,y:0.508},b:{x:11.645,y:0.7},thickness:0.13,height:2.73,openings:[]},
    {id:"mur-4",name:"Mur 4",a:{x:11.6,y:11.578},b:{x:11.62,y:0.7},thickness:0.2,height:2.73,openings:[]},
    {id:"mur-5",name:"Mur 5",a:{x:4.835,y:0.574},b:{x:4.834,y:1.809},thickness:0.05,height:2.73,openings:[{id:"baie-5-1",kind:"door",offset:0.5567,width:0.82,height:2.1,sill:0}]},
    {id:"mur-6",name:"Mur 6",a:{x:8.26,y:4.705},b:{x:8.269,y:0.503},thickness:0.071,height:2.73,openings:[{id:"baie-6-1",kind:"door",offset:0.3189,width:1.33,height:2.1,sill:0}]},
    {id:"mur-7",name:"Mur 7",a:{x:8.297,y:4.705},b:{x:8.295,y:5.577},thickness:0.135,height:2.73,openings:[]},
    {id:"mur-8",name:"Mur 8",a:{x:4.712,y:4.819},b:{x:4.72,y:1.809},thickness:0.198,height:2.73,openings:[]},
    {id:"mur-9",name:"Mur 9",a:{x:4.712,y:4.819},b:{x:5.466,y:5.574},thickness:0.201,height:2.73,openings:[]},
    {id:"mur-10",name:"Mur 10",a:{x:1.662,y:5.57},b:{x:11.611,y:5.581},thickness:0.209,height:2.73,openings:[{id:"baie-10-1",kind:"door",offset:0.4856,width:1.33,height:2.1,sill:0},{id:"baie-10-2",kind:"door",offset:0.7078,width:0.78,height:2.1,sill:0}]},
    {id:"mur-11",name:"Mur 11",a:{x:9.588,y:5.579},b:{x:9.593,y:6.995},thickness:0.069,height:2.73,openings:[{id:"baie-11-1",kind:"door",offset:0.4792,width:0.78,height:2.1,sill:0}]},
    {id:"mur-12",name:"Mur 12",a:{x:2.658,y:6.986},b:{x:11.609,y:6.997},thickness:0.05,height:2.73,openings:[{id:"baie-12-1",kind:"door",offset:0.2517,width:0.78,height:2.1,sill:0},{id:"baie-12-2",kind:"door",offset:0.5945,width:0.78,height:2.1,sill:0},{id:"baie-12-3",kind:"door",offset:0.7106,width:0.78,height:2.1,sill:0}]},
    {id:"mur-13",name:"Mur 13",a:{x:4.194,y:6.988},b:{x:4.552,y:7.346},thickness:0.23,height:2.73,openings:[]},
    {id:"mur-14",name:"Mur 14",a:{x:6.481,y:10.929},b:{x:6.498,y:6.991},thickness:0.058,height:2.73,openings:[]},
    {id:"mur-15",name:"Mur 15",a:{x:4.324,y:7.207},b:{x:4.543,y:6.988},thickness:0.25,height:2.73,openings:[]},
    {id:"mur-16",name:"Mur 16",a:{x:8.584,y:7.146},b:{x:8.74,y:6.994},thickness:0.11,height:2.73,openings:[]},
    {id:"mur-17",name:"Mur 17",a:{x:8.565,y:11.193},b:{x:8.584,y:7.146},thickness:0.069,height:2.73,openings:[{id:"baie-17-1",kind:"door",offset:0.1235,width:0.78,height:2.1,sill:0}]},
    {id:"mur-18",name:"Mur 18",a:{x:2.131,y:7.697},b:{x:2.658,y:6.986},thickness:0.07,height:2.73,openings:[{id:"baie-18-1",kind:"door",offset:0.4972,width:0.66,height:2.1,sill:0}]},
    {id:"mur-19",name:"Mur 19",a:{x:1.915,y:7.786},b:{x:2.131,y:7.697},thickness:0.053,height:2.73,openings:[]},
    {id:"mur-20",name:"Mur 20",a:{x:4.532,y:7.685},b:{x:4.575,y:6.955},thickness:0.09,height:2.73,openings:[]},
    {id:"mur-21",name:"Mur 21",a:{x:4.325,y:7.119},b:{x:4.316,y:8.99},thickness:0.339,height:2.73,openings:[]},
    {id:"mur-22",name:"Mur 22",a:{x:4.444,y:10.671},b:{x:4.453,y:8.99},thickness:0.06,height:2.73,openings:[]},
    {id:"mur-23",name:"Mur 23",a:{x:1.605,y:8.233},b:{x:2.108,y:7.665},thickness:0.07,height:2.73,openings:[]},
    {id:"mur-24",name:"Mur 24",a:{x:1.748,y:8.339},b:{x:1.915,y:7.786},thickness:0.062,height:2.73,openings:[]},
    {id:"mur-25",name:"Mur 25",a:{x:3.442,y:10.544},b:{x:11.6,y:11.578},thickness:0.198,height:2.73,openings:[]},
    {id:"mur-26",name:"Mur 26",a:{x:4.514,y:0.572},b:{x:4.51,y:1.809},thickness:0.2,height:2.73,openings:[]},
    {id:"mur-27",name:"Mur 27",a:{x:4.51,y:1.809},b:{x:4.834,y:1.809},thickness:0.2,height:2.73,openings:[]},
    {id:"mur-28",name:"Mur 28",a:{x:0.502,y:7.411},b:{x:3.304,y:9.497},thickness:0.203,height:2.73,openings:[]},
    {id:"mur-29",name:"Mur 29",a:{x:0.5,y:7.118},b:{x:0.502,y:7.411},thickness:0.09,height:2.73,openings:[]},
    {id:"mur-30",name:"Mur 30",a:{x:0.5,y:7.118},b:{x:1.662,y:5.57},thickness:0.199,height:2.73,openings:[]},
    {id:"mur-31",name:"Mur 31",a:{x:3.304,y:9.497},b:{x:3.443,y:10.136},thickness:0.306,height:2.73,openings:[]},
    {id:"mur-32",name:"Mur 32",a:{x:3.442,y:10.544},b:{x:3.443,y:10.136},thickness:0.332,height:2.73,openings:[]}
];
const LABELS = [{name:"Entree · 12.05 m²",x:4.938,y:6.456},{name:"Cuisine · 7.23 m²",x:5.493,y:8.874},{name:"Sde + Wc · 5.24 m²",x:3.381,y:8.48},{name:"Salon · 16.26 m²",x:6.555,y:3.02},{name:"Pl · 0.19 m²",x:4.711,y:1.22},{name:"SAM · 15.50 m²",x:9.914,y:3.031},{name:"Chambre · 12.31 m²",x:10.079,y:9.153},{name:"Dressing · 2.44 m²",x:10.568,y:6.329},{name:"Bureau · 7.94 m²",x:7.54,y:8.987}];

/** Surfaces imprimées sur le plan et surfaces retrouvées par l'extraction (null : pièce non fermée ;
 *  zone : surface imprimée cumulée du volume ouvert que la pièce partage). */
const ROOMS: { name: string; area: number; computed: number | null; zone?: number }[] = [{name:"Entree",area:12.05,computed:12.142},{name:"Cuisine",area:7.23,computed:7.21},{name:"Sde + Wc",area:5.24,computed:5.306},{name:"Salon",area:16.26,computed:16.29},{name:"Pl",area:0.19,computed:0.194},{name:"SAM",area:15.5,computed:15.619},{name:"Chambre",area:12.31,computed:12.337},{name:"Dressing",area:2.44,computed:2.433},{name:"Bureau",area:7.94,computed:7.986}];

export function exampleRooms() {
    return ROOMS.map(r => ({ ...r }));
}

export function exampleProject(): Project {
    return { version: 1, name: NAME, walls: structuredClone(WALLS), items: [], labels: LABELS.map(l => ({ ...l })), background: null, calibrated: true, assets: {} };
}
