// Plan d'exemple GÉNÉRÉ — ne pas éditer à la main.
// Source : tests/fixtures/plan-exemple-2.pdf, page 1, relu par l'extraction vectorielle (pdf-vector.ts), échelle
// 1/50 lue au cartouche, hauteur sous plafond 2.9 m lue sur le plan.
// Pour le régénérer : node scripts/build-example-plan.mjs 2
// a/b = AXE de chaque mur : le trait 2D et la boîte 3D sont centrés dessus.
import { type Project, type Wall } from './model';

const NAME = "Appartement 96 m² — Mamoun, plan existant";
const WALLS: Wall[] = [
    {id:"mur-1",name:"Mur 1",a:{x:14.389,y:0.55},b:{x:14.389,y:11.774},thickness:0.33,height:2.9,openings:[{id:"baie-1-1",kind:"window",offset:0.1216,width:1.14,height:2.21,sill:0.4},{id:"baie-1-2",kind:"window",offset:0.2808,width:1.14,height:2.21,sill:0.41},{id:"baie-1-3",kind:"window",offset:0.5092,width:1.21,height:2.21,sill:0.4},{id:"baie-1-4",kind:"window",offset:0.7367,width:1.24,height:2.2,sill:0.42},{id:"baie-1-5",kind:"window",offset:0.9048,width:1.24,height:2.2,sill:0.42}]},
    {id:"mur-2",name:"Mur 2",a:{x:9.703,y:0.535},b:{x:14.389,y:0.55},thickness:0.331,height:2.9,openings:[]},
    {id:"mur-3",name:"Mur 3",a:{x:9.703,y:0.535},b:{x:9.723,y:4.212},thickness:0.27,height:2.9,openings:[{id:"baie-3-1",kind:"door",offset:0.8477,width:0.9,height:2.1,sill:0}]},
    {id:"mur-4",name:"Mur 4",a:{x:4.874,y:2.314},b:{x:5.365,y:2.053},thickness:0.07,height:2.9,openings:[]},
    {id:"mur-5",name:"Mur 5",a:{x:4.638,y:2.314},b:{x:4.874,y:2.314},thickness:0.11,height:2.9,openings:[]},
    {id:"mur-6",name:"Mur 6",a:{x:4.38,y:2.516},b:{x:4.638,y:2.314},thickness:0.17,height:2.9,openings:[]},
    {id:"mur-7",name:"Mur 7",a:{x:4.38,y:2.516},b:{x:4.381,y:3.55},thickness:0.06,height:2.9,openings:[]},
    {id:"mur-8",name:"Mur 8",a:{x:0.565,y:2.84},b:{x:3.555,y:2.755},thickness:0.07,height:2.9,openings:[]},
    {id:"mur-9",name:"Mur 9",a:{x:3.555,y:2.755},b:{x:3.559,y:3.559},thickness:0.121,height:2.9,openings:[]},
    {id:"mur-10",name:"Mur 10",a:{x:5.343,y:3.19},b:{x:9.717,y:3.174},thickness:0.15,height:2.9,openings:[]},
    {id:"mur-11",name:"Mur 11",a:{x:6.918,y:3.184},b:{x:6.932,y:4.642},thickness:0.07,height:2.9,openings:[]},
    {id:"mur-12",name:"Mur 12",a:{x:5.343,y:3.19},b:{x:5.353,y:3.54},thickness:0.25,height:2.9,openings:[]},
    {id:"mur-13",name:"Mur 13",a:{x:3.559,y:3.559},b:{x:5.353,y:3.54},thickness:0.067,height:2.9,openings:[{id:"baie-13-1",kind:"door",offset:0.3038,width:0.87,height:2.1,sill:0},{id:"baie-13-2",kind:"door",offset:0.7413,width:0.68,height:2.1,sill:0}]},
    {id:"mur-14",name:"Mur 14",a:{x:3.569,y:4.495},b:{x:3.576,y:3.559},thickness:0.105,height:2.9,openings:[{id:"baie-14-1",kind:"door",offset:0.5032,width:0.71,height:2.1,sill:0}]},
    {id:"mur-15",name:"Mur 15",a:{x:9.723,y:4.212},b:{x:14.389,y:4.229},thickness:0.07,height:2.9,openings:[{id:"baie-15-1",kind:"door",offset:0.8262,width:1.29,height:2.1,sill:0}]},
    {id:"mur-16",name:"Mur 16",a:{x:9.791,y:5.19},b:{x:10.76,y:4.216},thickness:0.05,height:2.9,openings:[{id:"baie-16-1",kind:"door",offset:0.5524,width:1.01,height:2.1,sill:0}]},
    {id:"mur-17",name:"Mur 17",a:{x:9.787,y:4.213},b:{x:9.8,y:7.55},thickness:0.401,height:2.9,openings:[{id:"baie-17-1",kind:"door",offset:0.5034,width:0.9,height:2.1,sill:0}]},
    {id:"mur-18",name:"Mur 18",a:{x:3.569,y:4.495},b:{x:5.376,y:4.445},thickness:0.07,height:2.9,openings:[{id:"baie-18-1",kind:"door",offset:0.2794,width:0.79,height:2.1,sill:0}]},
    {id:"mur-19",name:"Mur 19",a:{x:5.376,y:4.445},b:{x:5.457,y:7.353},thickness:0.25,height:2.9,openings:[]},
    {id:"mur-20",name:"Mur 20",a:{x:3.574,y:7.259},b:{x:3.57,y:4.495},thickness:0.12,height:2.9,openings:[]},
    {id:"mur-21",name:"Mur 21",a:{x:6.554,y:4.642},b:{x:6.932,y:4.642},thickness:0.329,height:2.9,openings:[]},
    {id:"mur-22",name:"Mur 22",a:{x:5.898,y:5.015},b:{x:6.554,y:4.642},thickness:0.33,height:2.9,openings:[]},
    {id:"mur-23",name:"Mur 23",a:{x:5.392,y:5.015},b:{x:5.898,y:5.015},thickness:0.33,height:2.9,openings:[]},
    {id:"mur-24",name:"Mur 24",a:{x:6.932,y:4.642},b:{x:8.191,y:5.964},angle:-82,thickness:0.32,height:2.9,openings:[]},
    {id:"mur-25",name:"Mur 25",a:{x:8.191,y:5.964},b:{x:8.216,y:8.437},thickness:0.33,height:2.9,openings:[{id:"baie-25-1",kind:"door",offset:0.687,width:1.21,height:2.1,sill:0}]},
    {id:"mur-26",name:"Mur 26",a:{x:9.796,y:6.646},b:{x:10.798,y:7.551},thickness:0.118,height:2.9,openings:[]},
    {id:"mur-27",name:"Mur 27",a:{x:9.726,y:7.55},b:{x:14.389,y:7.556},thickness:0.069,height:2.9,openings:[{id:"baie-27-1",kind:"door",offset:0.8021,width:1.19,height:2.1,sill:0}]},
    {id:"mur-28",name:"Mur 28",a:{x:8.28,y:8.563},b:{x:9.728,y:8.554},thickness:0.064,height:2.9,openings:[]},
    {id:"mur-29",name:"Mur 29",a:{x:9.726,y:7.55},b:{x:9.734,y:11.758},thickness:0.25,height:2.9,openings:[{id:"baie-29-1",kind:"door",offset:0.1343,width:0.91,height:2.1,sill:0}]},
    {id:"mur-30",name:"Mur 30",a:{x:5.327,y:8.439},b:{x:5.344,y:11.743},thickness:0.329,height:2.9,openings:[{id:"baie-30-1",kind:"window",offset:0.407,width:1.4,height:2.2,sill:0.5}]},
    {id:"mur-31",name:"Mur 31",a:{x:5.344,y:11.743},b:{x:14.389,y:11.774},thickness:0.33,height:2.9,openings:[]},
    {id:"mur-32",name:"Mur 32",a:{x:5.341,y:0.5},b:{x:5.382,y:3.19},thickness:0.329,height:2.9,openings:[{id:"baie-32-1",kind:"window",offset:0.3595,width:0.94,height:1.55,sill:1.01},{id:"baie-32-2",kind:"window",offset:0.8261,width:0.36,height:0.84,sill:1.84}]},
    {id:"mur-33",name:"Mur 33",a:{x:0.63,y:0.629},b:{x:5.341,y:0.5},thickness:0.33,height:2.9,openings:[]},
    {id:"mur-34",name:"Mur 34",a:{x:0.5,y:5.058},b:{x:0.63,y:0.629},thickness:0.33,height:2.9,openings:[]},
    {id:"mur-35",name:"Mur 35",a:{x:0.568,y:7.351},b:{x:0.603,y:5.06},thickness:0.541,height:2.9,openings:[]},
    {id:"mur-36",name:"Mur 36",a:{x:0.568,y:7.351},b:{x:5.453,y:7.202},thickness:0.327,height:2.9,openings:[{id:"baie-36-1",kind:"window",offset:0.2623,width:1.13,height:2.1,sill:0.5},{id:"baie-36-2",kind:"window",offset:0.8196,width:0.75,height:1.21,sill:1.2}]},
    {id:"mur-37",name:"Mur 37",a:{x:5.327,y:8.439},b:{x:8.216,y:8.437},thickness:0.33,height:2.9,openings:[]}
];
const LABELS = [{name:"Chambre 2 · 15.21 m²",x:12.037,y:2.445},{name:"Salle à manger · 13.17 m²",x:12.196,y:5.883},{name:"Salon · 17.53 m²",x:12.041,y:9.595},{name:"Chambre 1 · 12.27 m²",x:7.555,y:10.09},{name:"Entrée · 8.70 m²",x:8.663,y:5.429},{name:"SDB · 4.19 m²",x:4.461,y:5.796},{name:"WC · 0.81 m²",x:4.835,y:2.938},{name:"Chambre 3 · 11.76 m²",x:2.143,y:4.958},{name:"Cuisine · 9.02 m²",x:2.968,y:1.797},{name:"Dgmt · 3.53 m²",x:5.434,y:3.985}];

/** Surfaces imprimées sur le plan et surfaces retrouvées par l'extraction (null : pièce non fermée ;
 *  zone : surface imprimée cumulée du volume ouvert que la pièce partage). */
const ROOMS: { name: string; area: number; computed: number | null; zone?: number }[] = [{name:"Chambre 2",area:15.21,computed:15.218},{name:"Salle à manger",area:13.17,computed:13.183},{name:"Salon",area:17.53,computed:17.534},{name:"Chambre 1",area:12.27,computed:12.269},{name:"Entrée",area:8.7,computed:8.72},{name:"SDB",area:4.19,computed:4.236},{name:"WC",area:0.81,computed:0.914},{name:"Chambre 3",area:11.76,computed:11.791},{name:"Cuisine",area:9.02,computed:9.124},{name:"Dgmt",area:3.53,computed:3.547}];

export function exampleRooms2() {
    return ROOMS.map(r => ({ ...r }));
}

export function exampleProject2(): Project {
    return { version: 1, name: NAME, walls: structuredClone(WALLS), items: [], labels: LABELS.map(l => ({ ...l })), background: null, calibrated: true, assets: {} };
}
