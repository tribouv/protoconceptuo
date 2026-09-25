// Modifications du plan par saisie : cotes, coupe, fusion, décalage, équerre. Toutes les
// fonctions sont pures, déplacent les extrémités par joints.ts (les angles et les T restent
// raccordés) et lèvent une Error au message lisible quand l'opération n'a pas de sens.
// L'éditeur passe ensuite le résultat par `finalize`, qui refuse un plan abîmé.
import { length, uid, wallSchema, type Opening, type Point, type Project, type Wall } from './model';
import { pointAt, project as along, sweep } from './arc';
import { JOIN, junctionOf, junctions, moveEnds, moveJunction, moveWall } from './joints';
import { openingCenter } from './openings';

/** Extrémité qui reste en place quand on change la longueur ou l'orientation d'un mur. */
export type Anchor = 'a' | 'centre' | 'b';

const mm = (n: number) => Math.round(n * 1000) / 1000;
const snap = (p: Point): Point => ({ x: mm(p.x), y: mm(p.y) });
const label = (o: Opening) => o.kind === 'door' ? 'porte' : 'fenêtre';
const other = (end: 'a' | 'b') => end === 'a' ? 'b' : 'a';

function wallOf(p: Project, id: string) {
    const w = p.walls.find(o => o.id === id);
    if (!w) throw new Error('Mur introuvable.');
    return w;
}
const withWall = (p: Project, w: Wall): Project => ({ ...p, walls: p.walls.map(o => o.id === w.id ? w : o) });
/** Direction unitaire de la corde a→b. */
function direction(w: Pick<Wall, 'a' | 'b'>) {
    const c = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1e-9;
    return { x: (w.b.x - w.a.x) / c, y: (w.b.y - w.a.y) / c, c };
}

/** Orientation de la corde a→b, en degrés. */
export const heading = (w: Pick<Wall, 'a' | 'b'>) => Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x) * 180 / Math.PI;

/** Emprise d'une baie le long du mur, en mètres depuis a. */
export function span(w: Wall, o: Opening) {
    const centre = o.offset * length(w);
    return { from: centre - o.width / 2, to: centre + o.width / 2, centre };
}

/** Remet les baies dans leur mur : largeur, hauteur et allège bornées, centre assez loin des
 *  bouts pour que la baie ne dépasse pas. Ne sépare pas deux baies qui se chevauchent. */
export function fitOpenings(w: Wall): Wall {
    const L = length(w);
    if (!w.openings.length || L < .05) return w;
    let changed = false;
    const openings = w.openings.map(o => {
        const width = Math.min(o.width, L), height = Math.min(o.height, w.height), sill = Math.max(0, Math.min(w.height - height, o.sill));
        const margin = width / 2 / L, offset = Math.max(margin, Math.min(1 - margin, o.offset));
        if (width === o.width && height === o.height && sill === o.sill && Math.abs(offset - o.offset) < 1e-12) return o;
        changed = true;
        return { ...o, width, height, sill, offset };
    });
    return changed ? { ...w, openings } : w;
}

/** Ce qui rendrait le plan faux, sur les murs qui diffèrent de `prev` (tous sans `prev`). */
export function checkProject(next: Project, prev?: Project): string | null {
    const before = new Map(prev?.walls.map(w => [w.id, w]));
    for (const w of next.walls) {
        if (before.get(w.id) === w) continue;
        const name = `« ${w.name} »`;
        if (![w.a.x, w.a.y, w.b.x, w.b.y].every(Number.isFinite)) return `${name} : position invalide.`;
        const L = length(w);
        if (L < .05) return `${name} ferait moins de 5 cm.`;
        const bays = w.openings.map(o => ({ o, ...span(w, o) })).sort((x, y) => x.from - y.from);
        for (const [i, b] of bays.entries()) {
            if (b.from < -1e-6 || b.to > L + 1e-6) return `Une ${label(b.o)} dépasserait de ${name}.`;
            if (b.o.sill + b.o.height > w.height + 1e-6) return `Une ${label(b.o)} dépasserait en hauteur de ${name}.`;
            if (i && b.from < bays[i - 1].to - 1e-6) return `Deux ouvertures se chevaucheraient sur ${name}.`;
        }
        if (!wallSchema.safeParse(w).success) return `${name} sortirait des limites admises (plan de ±200 m, épaisseur, hauteur ou ouvertures).`;
    }
    return null;
}

/** Dernière étape de toute modification : baies recalées dans les murs qui ont changé, puis
 *  contrôle. Lève une Error lisible plutôt que de rendre un plan abîmé. */
export function finalize(next: Project, prev: Project): Project {
    const before = new Map(prev.walls.map(w => [w.id, w]));
    const fitted = { ...next, walls: next.walls.map(w => before.get(w.id) === w ? w : fitOpenings(w)) };
    const problem = checkProject(fitted, prev);
    if (problem) throw new Error(problem);
    return fitted;
}

// --- longueur et orientation ---

function reshape(p: Project, id: string, newLength: number, angle: number, anchor: Anchor): Project {
    const w = wallOf(p, id), L = length(w), { c } = direction(w);
    // newLength est la longueur développée ; la corde suit, courbure conservée
    const chord = newLength * (c / (L || c)), r = angle * Math.PI / 180, u = { x: Math.cos(r), y: Math.sin(r) };
    if (anchor === 'a') return moveJunction(p, id, 'b', snap({ x: w.a.x + u.x * chord, y: w.a.y + u.y * chord }));
    if (anchor === 'b') return moveJunction(p, id, 'a', snap({ x: w.b.x - u.x * chord, y: w.b.y - u.y * chord }));
    const m = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
    const next = moveEnds(p, [
        { wall: id, end: 'a', to: snap({ x: m.x - u.x * chord / 2, y: m.y - u.y * chord / 2 }) },
        { wall: id, end: 'b', to: snap({ x: m.x + u.x * chord / 2, y: m.y + u.y * chord / 2 }) },
    ]);
    // les deux bouts ont bougé : les baies gardent leur distance au milieu du mur
    const moved = wallOf(next, id), after = length(moved);
    if (!after) return next;
    return withWall(next, { ...moved, openings: moved.openings.map(o => ({ ...o, offset: (o.offset * L - L / 2 + after / 2) / after })) });
}

/** Nouvelle longueur (développée) ; `anchor` reste en place, les murs raccordés suivent. */
export const resizeWall = (p: Project, id: string, newLength: number, anchor: Anchor) =>
    reshape(p, id, newLength, heading(wallOf(p, id)), anchor);

/** Nouvelle orientation, en degrés ; le mur pivote autour de `anchor`. */
export const orientWall = (p: Project, id: string, angle: number, anchor: Anchor) =>
    reshape(p, id, length(wallOf(p, id)), angle, anchor);

// --- chaîne de cotes des baies ---

/** Un tronçon de la chaîne : un écart (bout de mur ou entre deux baies) ou une largeur de baie.
 *  Modifier un écart déplace `opening` : la baie qui le suit (sign 1), ou pour le dernier écart
 *  la baie qui le précède (sign -1). */
export type Segment = { kind: 'gap' | 'width'; from: number; to: number; opening: string; sign: 1 | -1 };

export function openingChain(w: Wall): Segment[] {
    const bays = w.openings.map(o => ({ id: o.id, ...span(w, o) })).sort((x, y) => x.centre - y.centre);
    const out: Segment[] = [];
    let from = 0;
    for (const b of bays) {
        out.push({ kind: 'gap', from, to: b.from, opening: b.id, sign: 1 });
        out.push({ kind: 'width', from: b.from, to: b.to, opening: b.id, sign: 1 });
        from = b.to;
    }
    if (bays.length) out.push({ kind: 'gap', from, to: length(w), opening: bays[bays.length - 1].id, sign: -1 });
    return out;
}

/** Place le centre d'une baie à `centre` mètres du début du mur. */
export function placeOpeningAt(p: Project, id: string, centre: number): Project {
    const w = p.walls.find(x => x.openings.some(o => o.id === id));
    if (!w) throw new Error('Ouverture introuvable.');
    const L = length(w), o = w.openings.find(x => x.id === id)!;
    if (centre - o.width / 2 < -1e-6 || centre + o.width / 2 > L + 1e-6) throw new Error(`La ${label(o)} sortirait du mur « ${w.name} ».`);
    return withWall(p, { ...w, openings: w.openings.map(x => x.id === id ? { ...x, offset: Math.max(0, Math.min(1, centre / L)) } : x) });
}

/** Nouvelle largeur de baie, centre conservé (recalé dans le mur si besoin). */
export function setOpeningWidth(p: Project, id: string, width: number): Project {
    const w = p.walls.find(x => x.openings.some(o => o.id === id));
    if (!w) throw new Error('Ouverture introuvable.');
    if (width < .2) throw new Error('Une ouverture fait au moins 20 cm.');
    if (width > length(w) + 1e-6) throw new Error(`L’ouverture serait plus large que le mur « ${w.name} ».`);
    return withWall(p, fitOpenings({ ...w, openings: w.openings.map(o => o.id === id ? { ...o, width } : o) }));
}

/** Saisie d'un tronçon de la chaîne. `percent` : position du centre de la baie en % du mur. */
export function setSegment(p: Project, wallId: string, index: number, value: number, percent?: number): Project {
    const w = wallOf(p, wallId), seg = openingChain(w)[index];
    if (!seg) return p;
    if (seg.kind === 'width') return setOpeningWidth(p, seg.opening, value);
    const L = length(w), o = w.openings.find(x => x.id === seg.opening)!;
    const centre = percent !== undefined ? L * percent / 100 : o.offset * L + seg.sign * (value - (seg.to - seg.from));
    return placeOpeningAt(p, o.id, centre);
}

// --- coupe, fusion, suppression ---

/** Coupe un mur à `s` mètres de a : deux murs raccordés, chaque baie reste du côté de son centre. */
export function splitWall(p: Project, id: string, s: number): Project {
    const w = wallOf(p, id), L = length(w);
    if (s < .05 || s > L - .05) throw new Error('La coupe tombe trop près d’une extrémité du mur.');
    if (w.openings.some(o => { const b = span(w, o); return s > b.from - 1e-6 && s < b.to + 1e-6; }))
        throw new Error('La coupe tombe dans une ouverture.');
    const cut = snap(pointAt(w, s).point), bend = (f: number) => w.angle && Math.abs(w.angle * f) >= .5 ? w.angle * f : undefined;
    const first: Wall = { ...w, b: cut, angle: bend(s / L) }, second: Wall = { ...w, id: uid(), name: `${w.name} (2)`, a: { ...cut }, angle: bend(1 - s / L) };
    const place = (part: Wall, list: Opening[]) => list.map(o => ({ ...o, offset: along(part, openingCenter(w, o)) / length(part) }));
    first.openings = place(first, w.openings.filter(o => span(w, o).centre < s));
    second.openings = place(second, w.openings.filter(o => span(w, o).centre > s));
    return { ...p, walls: p.walls.flatMap(x => x.id === id ? [first, second] : [x]) };
}

/** Le mur qui prolonge `id` au bout `end`, si les deux peuvent n'en faire qu'un : nœud à deux
 *  murs seulement, sans T, murs droits dans le prolongement l'un de l'autre. */
export function mergeCandidate(p: Project, id: string, end: 'a' | 'b'): { wall: Wall; end: 'a' | 'b' } | null {
    const w = p.walls.find(o => o.id === id);
    if (!w || sweep(w)) return null;
    const node = junctionOf(junctions(p.walls), id, end);
    if (!node || node.ends.length !== 2 || node.hosts.length) return null;
    const e = node.ends.find(x => x.wall !== id);
    const o = e && p.walls.find(x => x.id === e.wall);
    if (!e || !o || sweep(o)) return null;
    const d = direction(w), v = direction(o);
    if (Math.abs(d.x * v.y - d.y * v.x) > .01) return null;
    // de part et d'autre du nœud, pas repliés l'un sur l'autre
    const far = w[other(end)], farO = o[other(e.end)], at = node.point;
    if ((far.x - at.x) * (farO.x - at.x) + (far.y - at.y) * (farO.y - at.y) >= 0) return null;
    return { wall: o, end: e.end };
}

/** Réunit `id` et le mur qui le prolonge en `end`. Le mur gardé est `id` (nom, épaisseur, hauteur). */
export function mergeWalls(p: Project, id: string, end: 'a' | 'b'): Project {
    const c = mergeCandidate(p, id, end);
    if (!c) throw new Error('Aucun mur droit dans le prolongement de ce bout.');
    const w = wallOf(p, id), o = c.wall, far = { ...o[other(c.end)] };
    if (w.openings.length + o.openings.length > 12) throw new Error('Le mur réuni porterait plus de 12 ouvertures.');
    const merged: Wall = { ...w, a: end === 'a' ? far : w.a, b: end === 'b' ? far : w.b, angle: undefined };
    const L = length(merged);
    merged.openings = [...w.openings.map(x => ({ x, host: w })), ...o.openings.map(x => ({ x, host: o }))]
        .map(({ x, host }) => ({ ...x, offset: along(merged, openingCenter(host, x)) / L }));
    return { ...p, walls: p.walls.filter(x => x.id !== o.id).map(x => x.id === id ? merged : x) };
}

/** Supprime un mur, puis recolle : aux angles qu'il libère, deux murs restés dans le
 *  prolongement l'un de l'autre (même épaisseur, même hauteur) redeviennent un seul mur. */
export function removeWall(p: Project, id: string): Project {
    const w = wallOf(p, id);
    let next: Project = { ...p, walls: p.walls.filter(x => x.id !== id) };
    for (const point of [w.a, w.b]) {
        const node = junctions(next.walls).find(n => Math.hypot(n.point.x - point.x, n.point.y - point.y) <= JOIN);
        if (!node || node.ends.length !== 2) continue;
        const e = node.ends[0], c = mergeCandidate(next, e.wall, e.end), keep = next.walls.find(x => x.id === e.wall)!;
        if (!c || c.wall.thickness !== keep.thickness || c.wall.height !== keep.height || keep.openings.length + c.wall.openings.length > 12) continue;
        next = mergeWalls(next, e.wall, e.end);
    }
    return next;
}

// --- décalage et équerre ---

/** Décale un mur parallèlement à lui-même de `d` mètres, vers sa gauche (normale (-uy, ux) de
 *  a vers b) si d > 0. Les murs raccordés s'étirent, les T suivent (voir moveWall). */
export function offsetWall(p: Project, id: string, d: number): Project {
    const u = direction(wallOf(p, id));
    return moveWall(p, id, -u.y * d, u.x * d);
}

/** Mur parallèle en vis-à-vis, le plus proche de chaque côté : `clear` est la distance face à
 *  face, `from`/`to` les points de la cote sur les deux faces. */
export type Facing = { wall: Wall; side: 1 | -1; axis: number; clear: number; from: Point; to: Point };

export function facingWalls(p: Project, id: string): Facing[] {
    const w = p.walls.find(o => o.id === id);
    if (!w || sweep(w)) return [];
    const u = direction(w), n = { x: -u.y, y: u.x }, best = new Map<number, Facing>();
    for (const o of p.walls) {
        if (o.id === id || sweep(o)) continue;
        const v = direction(o);
        if (v.c < .05 || Math.abs(u.x * v.y - u.y * v.x) > .02) continue;
        const rel = (q: Point) => ({ s: (q.x - w.a.x) * u.x + (q.y - w.a.y) * u.y, h: (q.x - w.a.x) * n.x + (q.y - w.a.y) * n.y });
        const qa = rel(o.a), qb = rel(o.b);
        const lo = Math.max(0, Math.min(qa.s, qb.s)), hi = Math.min(u.c, Math.max(qa.s, qb.s));
        const axis = (qa.h + qb.h) / 2, side = axis > 0 ? 1 : -1;
        if (hi - lo < .1 || Math.abs(axis) < .05) continue;
        const clear = Math.abs(axis) - w.thickness / 2 - o.thickness / 2, known = best.get(side);
        if (clear <= 0 || (known && Math.abs(known.axis) <= Math.abs(axis))) continue;
        const s = (lo + hi) / 2, base = { x: w.a.x + u.x * s, y: w.a.y + u.y * s }, h0 = side * w.thickness / 2, h1 = axis - side * o.thickness / 2;
        best.set(side, { wall: o, side, axis, clear, from: { x: base.x + n.x * h0, y: base.y + n.y * h0 }, to: { x: base.x + n.x * h1, y: base.y + n.y * h1 } });
    }
    return [...best.values()];
}

/** Amène la distance face à face avec le mur en vis-à-vis du côté `side` à `clear` mètres. */
export function setClearance(p: Project, id: string, side: 1 | -1, clear: number): Project {
    const f = facingWalls(p, id).find(x => x.side === side);
    if (!f) throw new Error('Plus de mur en vis-à-vis de ce côté.');
    return offsetWall(p, id, side * (f.clear - clear));
}

/** Met le mur d'équerre (90°) avec l'autre mur de l'angle `end` : il pivote autour de cet angle,
 *  longueur conservée, et son autre bout entraîne les murs qui y sont raccordés. */
export function squareCorner(p: Project, id: string, end: 'a' | 'b'): Project {
    const w = wallOf(p, id);
    if (sweep(w)) throw new Error('Un mur courbe ne se met pas d’équerre.');
    const node = junctionOf(junctions(p.walls), id, end);
    const others = [...node.ends.filter(e => e.wall !== id).map(e => e.wall), ...node.hosts];
    if (others.length !== 1) throw new Error(others.length ? 'Plus de deux murs se rejoignent à cet angle.' : 'Ce bout de mur n’est raccordé à aucun autre.');
    const ref = wallOf(p, others[0]);
    if (sweep(ref)) throw new Error('L’autre mur de l’angle est courbe.');
    const pivot = w[end], far = w[other(end)], L = Math.hypot(far.x - pivot.x, far.y - pivot.y);
    const theta = Math.atan2(far.y - pivot.y, far.x - pivot.x), phi = Math.atan2(ref.b.y - ref.a.y, ref.b.x - ref.a.x), q = Math.PI / 2;
    // direction perpendiculaire à l'autre mur la plus proche de l'actuelle
    const target = phi + q + Math.round((theta - phi - q) / Math.PI) * Math.PI;
    if (Math.abs(Math.atan2(Math.sin(target - theta), Math.cos(target - theta))) < 1e-4) return p;
    return moveJunction(p, id, other(end), snap({ x: pivot.x + Math.cos(target) * L, y: pivot.y + Math.sin(target) * L }));
}

/**
 * Hauteur et épaisseur d'un mur dessiné de `a` à `b`. Tracé sur un mur de l'existant (on reconstruit ce
 * qu'on a démoli) : les siennes, pour ne pas le compter comme redimensionné. Sinon la hauteur la plus
 * courante du plan (celle sous plafond) et une cloison de 15 cm.
 */
export function newWallSize(p: Project, a: Point, b: Point): { height: number; thickness: number } {
    const onAxis = (w: Wall, q: Point) => { if (sweep(w)) return false; const t = pointAt(w, along(w, q)).point; return Math.hypot(t.x - q.x, t.y - q.y) < .02; };
    const under = [...(p.existing?.walls ?? []), ...p.walls].find(w => onAxis(w, a) && onAxis(w, b));
    if (under) return { height: under.height, thickness: under.thickness };
    const counts = new Map<number, number>();
    for (const w of p.walls) counts.set(w.height, (counts.get(w.height) ?? 0) + 1);
    const height = [...counts].sort((x, y) => y[1] - x[1])[0]?.[0] ?? 2.6;
    return { height, thickness: .15 };
}
