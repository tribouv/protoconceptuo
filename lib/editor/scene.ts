import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { bounds, length, type Item, type Project, type Wall, type Opening } from './model';
import { pointAt, sweep } from './arc';
import { faceEnds, type FaceEnds } from './joints';
function box(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, color: string) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: .8 }));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}
/** Repère local d'un mur : origine au milieu de la corde, x le long de la corde (a → b),
 *  z = normale gauche. Renvoie la position et le cap local du point d'abscisse curviligne s. */
function along(w: Wall, s: number) {
    const mx = (w.a.x + w.b.x) / 2, my = (w.a.y + w.b.y) / 2, alpha = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x);
    const { point, heading } = pointAt(w, s), dx = point.x - mx, dy = point.y - my;
    return { x: dx * Math.cos(alpha) + dy * Math.sin(alpha), z: -dx * Math.sin(alpha) + dy * Math.cos(alpha), heading: heading - alpha };
}
/** Prisme vertical de `bottom` à `top`, de section donnée dans le repère local du mur (x le long
 *  du mur, z sa normale gauche). */
function prism(parent: THREE.Object3D, corners: THREE.Vector2[], bottom: number, top: number, color: string) {
    const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(corners), { depth: top - bottom, bevelEnabled: false });
    geometry.rotateX(Math.PI / 2);   // le profil passe dans le plan horizontal, l'extrusion descend depuis `top`
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .8 }));
    mesh.position.y = top;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}
/** Tronçon de mur courbe entre les abscisses from et to : prisme dont les quatre coins sont
 *  sur les deux faces de l'arc, pour que deux tronçons voisins se raccordent sans fente. */
function arcPiece(parent: THREE.Object3D, w: Wall, from: number, to: number, bottom: number, top: number, color: string) {
    const ends = [along(w, from), along(w, to)], t = w.thickness / 2;
    const side = (e: { x: number; z: number; heading: number }, k: number) => new THREE.Vector2(e.x - Math.sin(e.heading) * t * k, e.z + Math.cos(e.heading) * t * k);
    return prism(parent, [side(ends[0], 1), side(ends[1], 1), side(ends[1], -1), side(ends[0], -1)], bottom, top, color);
}
/** Tronçon de mur droit entre les abscisses from et to ; aux deux bouts du mur, chaque face
 *  s'arrête selon `ends` (angle d'onglet, prolongement jusqu'au voisin). */
function straightPiece(parent: THREE.Object3D, w: Wall, len: number, from: number, to: number, bottom: number, top: number, color: string, ends: FaceEnds) {
    const t = w.thickness / 2, x = (s: number) => s - len / 2;
    const start = (k: 'l' | 'r') => from <= 1e-9 ? -ends.a[k] : from, stop = (k: 'l' | 'r') => to >= len - 1e-9 ? len + ends.b[k] : to;
    return prism(parent, [new THREE.Vector2(x(start('l')), t), new THREE.Vector2(x(stop('l')), t), new THREE.Vector2(x(stop('r')), -t), new THREE.Vector2(x(start('r')), -t)], bottom, top, color);
}
const square: FaceEnds = { a: { l: 0, r: 0 }, b: { l: 0, r: 0 } };
export function wallObject(w: Wall, selected = false, ends: FaceEnds = square) {
    const group = new THREE.Group(), len = length(w);
    group.name = w.name;
    group.userData = { entityId: w.id, kind: 'wall', wall: w };
    group.position.set((w.a.x + w.b.x) / 2, 0, (w.a.y + w.b.y) / 2);
    group.rotation.y = -Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x);
    const color = selected ? '#bc9356' : '#e7e2d7';
    // Partition along opening boundaries; each strip fills only the remaining vertical intervals.
    const holes = w.openings.map(o => ({ start: Math.max(0, o.offset * len - o.width / 2), end: Math.min(len, o.offset * len + o.width / 2), bottom: Math.min(w.height, o.sill), top: Math.min(w.height, o.sill + o.height), kind: o.kind }));
    // un mur courbe est découpé en facettes de 5° au plus, en plus des bords de baies
    const theta = Math.abs(sweep(w)), facets = theta ? Math.ceil(theta / (5 * Math.PI / 180)) : 0;
    const cuts = [...new Set([0, len, ...holes.flatMap(o => [o.start, o.end]), ...Array.from({ length: facets }, (_, i) => len * i / facets)])].sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
        const from = cuts[i], to = cuts[i + 1], middle = (from + to) / 2;
        let intervals: [
            number,
            number
        ][] = [[0, w.height]];
        for(const hole of holes.filter(o=>middle>o.start&&middle<o.end)){
            intervals=intervals.flatMap(([bottom,top])=>{const out:[number,number][]=[];if(hole.bottom>bottom)out.push([bottom,Math.min(top,hole.bottom)]);if(hole.top<top)out.push([Math.max(bottom,hole.top),top]);return out});
        }
        for(const [bottom,top]of intervals)if(top-bottom>.001&&to-from>.001){if(theta)arcPiece(group,w,from,to,bottom,top,color);else straightPiece(group,w,len,from,to,bottom,top,color,ends);}
    }
    return group;
}
export function openingObject(w:Wall,o:Opening,selected=false){
    const group=new THREE.Group(),len=length(w),width=Math.min(len,o.width),h=Math.max(.01,Math.min(w.height-o.sill,o.height));
    group.name=o.kind==='door'?'Porte':'Fenêtre';group.userData={entityId:o.id,kind:'opening',wallId:w.id,opening:o};
    // (sur un mur courbe, la baie suit la tangente de l'arc en son centre)
    const at=along(w,o.offset*len);group.position.set(at.x,0,at.z);group.rotation.y=-at.heading;
    const frame=selected?'#c0904c':'#f2eee5';
    for(const x of [-width/2,width/2])box(group,.045,h+.04,w.thickness+.03,x,o.sill+h/2,0,frame);
    box(group,width,.045,w.thickness+.03,0,o.sill+h,0,frame);
    if(o.kind==='window'){
        box(group,width,.045,w.thickness+.03,0,o.sill,0,frame);box(group,.035,h,.05,0,o.sill+h/2,0,frame);
        const glass=box(group,width,h,.015,0,o.sill+h/2,0,'#d7e8e5');glass.material.dispose();glass.material=new THREE.MeshPhysicalMaterial({color:'#e1efed',roughness:.05,transmission:.92,thickness:.02,ior:1.5,transparent:true,opacity:.45});
    }else{
        const pivot=new THREE.Group();pivot.position.x=-width/2;pivot.rotation.y=-Math.PI/3;group.add(pivot);box(pivot,width-.04,h-.03,.035,width/2,h/2,0,selected?'#ccaa75':'#c4b193');box(pivot,.1,.025,.065,width-.15,h*.5,.04,'#6f706d');
    }
    return group;
}
export function furnitureObject(i: Item, selected = false) {
    const g = new THREE.Group();
    g.name = i.name;
    g.userData = { entityId: i.id, kind: 'item', item: i };
    g.position.set(i.x, 0, i.y);
    g.rotation.y = -i.rotation * Math.PI / 180;
    const { width: w, depth: d, height: h } = i, c = selected ? '#c79d61' : i.color, wood = '#6d513a';
    if (i.kind === 'sofa' || i.kind === 'chair') {
        box(g, w * .88, h * .32, d * .87, 0, h * .31, 0, c);
        box(g, w, h * .63, d * .16, 0, h * .68, -d * .42, c);
        box(g, w * .09, h * .55, d, -w * .455, h * .45, 0, c);
        box(g, w * .09, h * .55, d, w * .455, h * .45, 0, c);
        const count = i.kind === 'sofa' ? 3 : 1;
        for (let n = 0; n < count; n++)
            box(g, w * .8 / count - .025, h * .12, d * .66, -w * .4 + w * .8 / count * (n + .5), h * .53, d * .07, c);
        for (const x of [-w * .37, w * .37])
            for (const z of [-d * .32, d * .32])
                box(g, .065, h * .16, .065, x, h * .08, z, wood);
    }
    else if (i.kind === 'table') {
        box(g, w, .07, d, 0, h - .035, 0, c);
        for (const x of [-w * .4, w * .4])
            for (const z of [-d * .36, d * .36])
                box(g, .07, h - .07, .07, x, (h - .07) / 2, z, wood);
    }
    else if (i.kind === 'bed') {
        box(g, w, h * .35, d, 0, h * .25, 0, wood);
        box(g, w * .98, h * .35, d * .97, 0, h * .6, 0, c);
        box(g, w, h, .08, 0, h / 2, -d / 2, wood);
        for (const x of [-w * .24, w * .24])
            box(g, w * .4, h * .12, d * .22, x, h * .83, -d * .28, '#f5f0e6');
        box(g, w, h * .07, d * .4, 0, h * .81, d * .27, c);
    }
    else if (i.kind === 'cabinet') {
        box(g, w, h, d, 0, h / 2, 0, c);
        box(g, .014, h * .95, .014, 0, h / 2, d / 2 + .005, wood);
        for (const x of [-.06, .06])
            box(g, .025, .16, .035, x, h * .55, d / 2 + .02, wood);
    }
    else {
        box(g, w, h - .06, d, 0, (h - .06) / 2, 0, c);
        box(g, w + .04, .06, d + .04, 0, h - .03, 0, '#ece8df');
    }
    return g;
}
export function disposeObject(object: THREE.Object3D) { object.traverse(child => { const m = child as THREE.Mesh; if (m.geometry)
    m.geometry.dispose(); if (m.material) {
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        for (const v of Object.values(mat))
            if (v instanceof THREE.Texture)
                v.dispose();
        mat.dispose();
    }
} }); }
export async function loadAsset(data: string) {
    const bytes = Uint8Array.from(atob(data.split(',')[1]), c => c.charCodeAt(0));
    validateGlb(bytes.buffer);
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(url => { if (!url.startsWith('blob:') && !url.startsWith('data:'))
        throw new Error('Le GLB doit contenir ses textures et sa géométrie.'); return url; });
    return (await new GLTFLoader(manager).parseAsync(bytes.buffer, '')).scene;
}
export function validateGlb(buffer: ArrayBuffer) {
    if (buffer.byteLength < 20 || buffer.byteLength > 24 * 1024 * 1024)
        throw new Error('Choisissez un GLB autonome de moins de 24 Mo.');
    const v = new DataView(buffer);
    if (v.getUint32(0, true) !== 0x46546c67 || v.getUint32(4, true) !== 2 || v.getUint32(8, true) !== buffer.byteLength || v.getUint32(16, true) !== 0x4e4f534a)
        throw new Error('Fichier GLB 2.0 invalide.');
    const size = v.getUint32(12, true);
    if (size > buffer.byteLength - 20)
        throw new Error('Fichier GLB tronqué.');
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, size)));
    if ([...(json.buffers ?? []), ...(json.images ?? [])].some((o: {
        uri?: string;
    }) => o.uri && !o.uri.startsWith('data:')))
        throw new Error('Le GLB doit embarquer toutes ses textures et données.');
    if (json.extensionsRequired?.some((s: string) => ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu'].includes(s)))
        throw new Error('Ce prototype accepte les GLB non compressés uniquement.');
}
export async function customObject(i: Item, data: string) {
    const source = await loadAsset(data), b = new THREE.Box3().setFromObject(source), size = b.getSize(new THREE.Vector3()), center = b.getCenter(new THREE.Vector3());
    if (Math.min(size.x, size.y, size.z) < .00001) {
        disposeObject(source);
        throw new Error('Le modèle 3D ne contient pas de volume exploitable.');
    }
    const inner = new THREE.Group();
    inner.add(source);
    source.position.sub(new THREE.Vector3(center.x, b.min.y, center.z));
    inner.scale.set(i.width / size.x, i.height / size.y, i.depth / size.z);
    const g = new THREE.Group();
    g.add(inner);
    g.position.set(i.x, 0, i.y);
    g.rotation.y = -i.rotation * Math.PI / 180;
    g.name = i.name;
    g.userData = { entityId: i.id, kind: 'item', item: { ...i } };
    g.traverse(o => { o.castShadow = true; o.receiveShadow = true; });
    return g;
}
export async function buildScene(p: Project, selected: string | null = null) {
    const root = new THREE.Group();
    root.name = 'Conceptuo';
    root.userData = { version: 1, units: 'meters', name: p.name, calibrated: p.calibrated };
    try {
        const b = bounds({ ...p, background: null });
        if (p.walls.length) {
            const floor = box(root, b.width + .3, .1, b.height + .3, b.x + b.width / 2, -.06, b.y + b.height / 2, '#d2bea1');
            floor.name = 'Sol indicatif';
            floor.userData = { kind: 'floor', note: 'Emprise rectangulaire indicative, non calculée pièce par pièce' };
        }
        const ends = faceEnds(p.walls);
        for (const w of p.walls)
            {const group=wallObject(w,selected===w.id,ends.get(w.id));for(const o of w.openings)group.add(openingObject(w,o,selected===o.id));root.add(group);}
        for (const i of p.items)
            root.add(i.kind === 'custom' && i.assetId ? await customObject(i, p.assets[i.assetId]) : furnitureObject(i, selected === i.id));
        return root;
    }
    catch (e) {
        disposeObject(root);
        throw e;
    }
}
export async function exportGlb(p: Project) { const root = await buildScene(p); try {
    root.updateMatrixWorld(true);
    return await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true }) as ArrayBuffer;
}
finally {
    disposeObject(root);
} }
