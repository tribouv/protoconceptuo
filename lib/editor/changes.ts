// Écarts entre l'existant validé et le projet : ce que le devis de rénovation doit chiffrer.
// On compare des géométries, pas des identifiants : couper, fusionner ou recoller un mur change
// ses identifiants sans rien changer sur le chantier (voir edits.ts), et déplacer une cloison
// allonge ses voisins (voir joints.ts). Pour chaque mur de l'existant, on cherche les portions de
// son axe encore couvertes par un mur actuel colinéaire : le reste est démoli. Symétriquement, ce
// qu'aucun mur existant ne couvre est construit. Longueurs mesurées sur l'axe des murs.
// Module pur : ni DOM ni canvas, testé dans Node (tests/core.mjs).
import { length, type Opening, type Point, type Project, type Wall } from './model';
import { pointAt, project as along, sweep } from './arc';
import { span } from './edits';
import { roomsDocument, roomsOf } from './rooms';

const ANGLE = Math.sin(.5 * Math.PI / 180);   // colinéaires à 0,5° près
const AXIS = .02;                              // axes confondus à 2 cm près
const PIECE = .05;                             // bouts de moins de 5 cm ignorés
const SAME = .005;                             // écart de cote significatif au-delà de 5 mm

type Interval = [number, number];
/** Baie, avec ses deux tableaux (`from`, `to`) et son centre, dans le repère du plan. */
export type Bay = { kind: 'door' | 'window'; width: number; height: number; sill: number; from: Point; to: Point; centre: Point };
/** Portion d'un mur démolie ou construite. `mid` : milieu sur l'axe, où se pose le repère. */
export type Portion = { ref: number; wallId: string; existingWallId?: string; name: string; from: Point; to: Point; mid: Point; length: number; thickness: number; height: number; area: number; openings: Bay[] };
export type Resized = { ref: number; wallId: string; existingWallId: string; name: string; from: Point; to: Point; mid: Point; length: number; before: { thickness: number; height: number }; after: { thickness: number; height: number } };
/** Baie d'un mur conservé : percée (`before` nul), rebouchée (`after` nul) ou modifiée. */
export type BayChange = { ref: number; wallId: string; existingWallId: string; name: string; mid: Point; before: Bay | null; after: Bay | null };
export type PlanChanges = {
    demolished: Portion[]; built: Portion[]; resized: Resized[];
    openingsCreated: BayChange[]; openingsFilled: BayChange[]; openingsModified: BayChange[];
    totals: { demolishedLength: number; demolishedArea: number; builtLength: number; builtArea: number; resizedLength: number; openingsCreated: number; openingsFilled: number; openingsModified: number };
    count: number;
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const rp = (p: Point): Point => ({ x: r3(p.x), y: r3(p.y) });
const at = (w: Wall, s: number) => pointAt(w, s).point;
const near = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y) <= AXIS;

/** Deux murs courbes identiques, parcourus dans un sens ou dans l'autre. */
function sameArc(w: Wall, o: Wall) {
    const d = (w.angle ?? 0), e = (o.angle ?? 0);
    return (near(w.a, o.a) && near(w.b, o.b) && Math.abs(d - e) < 1) || (near(w.a, o.b) && near(w.b, o.a) && Math.abs(d + e) < 1);
}

/** Portion de l'axe de `host` que recouvre `other`, en mètres depuis host.a ; null si les deux
 *  murs ne sont pas sur le même axe. Un mur courbe n'est couvert que par le même arc, entier. */
function cover(host: Wall, other: Wall): Interval | null {
    const L = length(host), Lo = length(other);
    if (L < 1e-9 || Lo < 1e-9) return null;
    if (sweep(host) || sweep(other)) return sweep(host) && sweep(other) && sameArc(host, other) ? [0, L] : null;
    const ux = (host.b.x - host.a.x) / L, uy = (host.b.y - host.a.y) / L;
    const vx = (other.b.x - other.a.x) / Lo, vy = (other.b.y - other.a.y) / Lo;
    if (Math.abs(ux * vy - uy * vx) > ANGLE) return null;
    const off = (p: Point) => Math.abs(-(p.x - host.a.x) * uy + (p.y - host.a.y) * ux);
    if (off(other.a) > AXIS || off(other.b) > AXIS) return null;
    const s0 = (other.a.x - host.a.x) * ux + (other.a.y - host.a.y) * uy, s1 = (other.b.x - host.a.x) * ux + (other.b.y - host.a.y) * uy;
    const from = Math.max(0, Math.min(s0, s1)), to = Math.min(L, Math.max(s0, s1));
    return to - from > 1e-6 ? [from, to] : null;
}

function union(list: Interval[]): Interval[] {
    const out: Interval[] = [];
    for (const [f, t] of [...list].sort((a, b) => a[0] - b[0])) {
        const last = out[out.length - 1];
        if (last && f <= last[1] + 1e-6) last[1] = Math.max(last[1], t);
        else out.push([f, t]);
    }
    return out;
}

/** Ce que `covered` laisse de [0, L], sans les bouts de moins de 5 cm. */
function gaps(L: number, covered: Interval[]): Interval[] {
    const out: Interval[] = [];
    let s = 0;
    for (const [f, t] of covered) { if (f - s >= PIECE) out.push([s, f]); s = Math.max(s, t); }
    if (L - s >= PIECE) out.push([s, L]);
    return out;
}

const inside = (s: number, list: Interval[]) => list.some(([f, t]) => s >= f - 1e-6 && s <= t + 1e-6);

function bay(w: Wall, o: Opening): Bay {
    const b = span(w, o);
    return { kind: o.kind, width: r3(o.width), height: r3(o.height), sill: r3(o.sill), from: rp(at(w, b.from)), to: rp(at(w, b.to)), centre: rp(at(w, b.centre)) };
}

function portion(w: Wall, f: number, t: number, existing: boolean): Portion {
    const holes = w.openings.reduce((n, o) => { const b = span(w, o); return n + Math.max(0, Math.min(t, b.to) - Math.max(f, b.from)) * o.height; }, 0);
    const bays = w.openings.filter(o => { const c = span(w, o).centre; return c >= f && c <= t; }).map(o => bay(w, o));
    return {
        ref: 0, wallId: w.id, ...(existing ? { existingWallId: w.id } : {}), name: w.name,
        from: rp(at(w, f)), to: rp(at(w, t)), mid: rp(at(w, (f + t) / 2)),
        length: r3(t - f), thickness: w.thickness, height: w.height, area: r3((t - f) * w.height - holes), openings: bays,
    };
}

/** Écarts entre les murs de l'existant et ceux du projet. Les repères (`ref`) sont numérotés
 *  démolitions d'abord, puis constructions, épaisseurs, percements, rebouchages et baies
 *  modifiées, chacun dans l'ordre de lecture du plan : ils ne bougent pas tant que le plan ne
 *  change pas. */
export function diffWalls(existing: Wall[], current: Wall[]): PlanChanges {
    const demolished: Portion[] = [], built: Portion[] = [], resized: Resized[] = [];
    const created: BayChange[] = [], filled: BayChange[] = [], modified: BayChange[] = [];
    const hitsOf = new Map<string, { wall: Wall; s: Interval }[]>();

    for (const e of existing) {
        const hits = current.flatMap(c => { const s = cover(e, c); return s ? [{ wall: c, s }] : []; });
        hitsOf.set(e.id, hits);
        for (const [f, t] of gaps(length(e), union(hits.map(h => h.s)))) demolished.push(portion(e, f, t, true));
        for (const h of hits) {
            const [f, t] = h.s;
            if (t - f < PIECE || (Math.abs(h.wall.thickness - e.thickness) <= SAME && Math.abs(h.wall.height - e.height) <= SAME)) continue;
            resized.push({ ref: 0, wallId: h.wall.id, existingWallId: e.id, name: h.wall.name, from: rp(at(e, f)), to: rp(at(e, t)), mid: rp(at(e, (f + t) / 2)), length: r3(t - f),
                before: { thickness: e.thickness, height: e.height }, after: { thickness: h.wall.thickness, height: h.wall.height } });
        }
    }
    for (const c of current)
        for (const [f, t] of gaps(length(c), union(existing.flatMap(e => { const s = cover(c, e); return s ? [s] : []; })))) built.push(portion(c, f, t, false));

    // baies des murs conservés, rapprochées par recouvrement le long de l'axe du mur existant ;
    // une baie tombée dans une portion démolie ou construite est comptée avec sa portion
    const claimed = new Set<string>();
    for (const e of existing) {
        const hits = hitsOf.get(e.id)!, kept = union(hits.map(h => h.s));
        const before = e.openings.map(o => ({ o, ...span(e, o) })).filter(b => inside(b.centre, kept));
        const after = hits.flatMap(h => h.wall.openings.flatMap(o => {
            if (claimed.has(o.id)) return [];
            const centre = along(e, at(h.wall, span(h.wall, o).centre));
            if (centre < h.s[0] - 1e-6 || centre > h.s[1] + 1e-6) return [];
            claimed.add(o.id);
            return [{ o, wall: h.wall, centre, from: centre - o.width / 2, to: centre + o.width / 2 }];
        }));
        const used = new Set<number>();
        for (const b of before) {
            let best = -1, overlap = 0;
            after.forEach((a, i) => { const v = Math.min(a.to, b.to) - Math.max(a.from, b.from); if (!used.has(i) && v > overlap) { overlap = v; best = i; } });
            const host = hits.find(h => inside(b.centre, [h.s]))?.wall ?? e;
            if (best < 0) { filled.push({ ref: 0, wallId: host.id, existingWallId: e.id, name: host.name, mid: rp(at(e, b.centre)), before: bay(e, b.o), after: null }); continue; }
            used.add(best);
            const a = after[best];
            if (a.o.kind !== b.o.kind || Math.abs(a.o.width - b.o.width) > SAME || Math.abs(a.o.height - b.o.height) > SAME || Math.abs(a.o.sill - b.o.sill) > SAME || Math.abs(a.centre - b.centre) > SAME)
                modified.push({ ref: 0, wallId: a.wall.id, existingWallId: e.id, name: a.wall.name, mid: rp(at(e, a.centre)), before: bay(e, b.o), after: bay(a.wall, a.o) });
        }
        after.forEach((a, i) => { if (!used.has(i)) created.push({ ref: 0, wallId: a.wall.id, existingWallId: e.id, name: a.wall.name, mid: rp(at(e, a.centre)), before: null, after: bay(a.wall, a.o) }); });
    }

    // ordre de lecture : par bandes de 10 cm de haut en bas, puis de gauche à droite
    const reading = (x: { mid: Point; wallId: string }, y: { mid: Point; wallId: string }) => Math.round(x.mid.y * 10) - Math.round(y.mid.y * 10) || x.mid.x - y.mid.x || x.wallId.localeCompare(y.wallId);
    let ref = 0;
    for (const list of [demolished, built, resized, created, filled, modified] as { ref: number; mid: Point; wallId: string }[][]) {
        list.sort(reading);
        for (const item of list) item.ref = ++ref;
    }
    const sum = (list: { length: number }[]) => r3(list.reduce((n, x) => n + x.length, 0));
    const area = (list: Portion[]) => r3(list.reduce((n, x) => n + x.area, 0));
    return {
        demolished, built, resized, openingsCreated: created, openingsFilled: filled, openingsModified: modified,
        totals: { demolishedLength: sum(demolished), demolishedArea: area(demolished), builtLength: sum(built), builtArea: area(built), resizedLength: sum(resized), openingsCreated: created.length, openingsFilled: filled.length, openingsModified: modified.length },
        count: ref,
    };
}

export const CHANGES_FORMAT = 'conceptuo-atelier.changes';

/** Document d'échange avec Conceptuo (format documenté dans GUIDE-DEVELOPPEURS.md). */
export function changesDocument(p: Project, changes = diffWalls(p.existing?.walls ?? [], p.walls), generatedAt = new Date().toISOString()) {
    const bg = p.background;
    return {
        format: CHANGES_FORMAT, version: 1, units: 'm', generatedAt,
        frame: { origin: 'page-top-left', x: 'right', y: 'down', description: 'Coordonnées en mètres depuis le coin haut-gauche de la page du PDF, x vers la droite, y vers le bas. Position sur la page en points PDF : x / source.scale.' },
        project: { name: p.name, validatedAt: p.existing?.validatedAt ?? null, source: bg ? { fileName: bg.fileName, page: bg.page, scale: bg.scale ?? null, pageWidth: r3(bg.width), pageHeight: r3(bg.height) } : null },
        changes,
        // pièces avant et après travaux, surfaces comprises (voir rooms.ts)
        existing: { walls: p.existing?.walls ?? [], rooms: p.existing ? roomsDocument(roomsOf(p.existing.walls, p.existing.labels ?? p.labels, p.existing.walls)) : [] },
        proposed: { walls: p.walls, rooms: roomsDocument(roomsOf(p.walls, p.labels, p.existing?.walls)) },
    };
}

// --- lignes du tableau des modifications ---

export type RowKind = 'demolished' | 'built' | 'resized' | 'created' | 'filled' | 'modified';
export type ChangeRow = { ref: number; kind: RowKind; label: string; from: Point; to: Point; mid: Point; length: string; thickness: string; height: string; area: string; detail: string; wallId: string };

const m = (n: number) => `${n.toFixed(2).replace('.', ',')} m`;
const change = (a: number, b: number) => Math.abs(a - b) > SAME ? `${a.toFixed(2).replace('.', ',')} → ${m(b)}` : m(b);
const bayName = (b: Bay) => b.kind === 'door' ? 'porte' : 'fenêtre';
const bayList = (list: Bay[]) => list.map(b => `${bayName(b)} ${m(b.width)}`).join(', ');

/** Une ligne par modification, dans l'ordre des repères, avec les cotes mises en forme. */
export function changeRows(c: PlanChanges): ChangeRow[] {
    const rows: ChangeRow[] = [];
    for (const d of c.demolished) rows.push({ ref: d.ref, kind: 'demolished', label: 'Démolition', from: d.from, to: d.to, mid: d.mid, length: m(d.length), thickness: m(d.thickness), height: m(d.height), area: `${d.area.toFixed(2).replace('.', ',')} m²`, detail: d.openings.length ? `dépose : ${bayList(d.openings)}` : '', wallId: d.wallId });
    for (const b of c.built) rows.push({ ref: b.ref, kind: 'built', label: 'Construction', from: b.from, to: b.to, mid: b.mid, length: m(b.length), thickness: m(b.thickness), height: m(b.height), area: `${b.area.toFixed(2).replace('.', ',')} m²`, detail: b.openings.length ? `avec ${bayList(b.openings)}` : '', wallId: b.wallId });
    for (const r of c.resized) rows.push({ ref: r.ref, kind: 'resized', label: 'Épaisseur / hauteur', from: r.from, to: r.to, mid: r.mid, length: m(r.length), thickness: change(r.before.thickness, r.after.thickness), height: change(r.before.height, r.after.height), area: '', detail: '', wallId: r.wallId });
    for (const o of c.openingsCreated) { const a = o.after!; rows.push({ ref: o.ref, kind: 'created', label: 'Percement', from: a.from, to: a.to, mid: o.mid, length: m(a.width), thickness: '', height: m(a.height), area: '', detail: `${bayName(a)}, allège ${m(a.sill)}`, wallId: o.wallId }); }
    for (const o of c.openingsFilled) { const b = o.before!; rows.push({ ref: o.ref, kind: 'filled', label: 'Rebouchage', from: b.from, to: b.to, mid: o.mid, length: m(b.width), thickness: '', height: m(b.height), area: '', detail: `ancienne ${bayName(b)}`, wallId: o.wallId }); }
    for (const o of c.openingsModified) {
        const b = o.before!, a = o.after!, notes: string[] = [];
        if (a.kind !== b.kind) notes.push(`${bayName(b)} → ${bayName(a)}`);
        if (a.width - b.width > SAME) notes.push('élargissement'); else if (b.width - a.width > SAME) notes.push('réduction');
        if (Math.abs(a.sill - b.sill) > SAME) notes.push(`allège ${change(b.sill, a.sill)}`);
        const moved = Math.hypot(a.centre.x - b.centre.x, a.centre.y - b.centre.y);
        if (moved > SAME) notes.push(`déplacée de ${m(moved)}`);
        rows.push({ ref: o.ref, kind: 'modified', label: 'Modification de baie', from: a.from, to: a.to, mid: o.mid, length: change(b.width, a.width), thickness: '', height: change(b.height, a.height), area: '', detail: notes.join(', '), wallId: o.wallId });
    }
    return rows.sort((x, y) => x.ref - y.ref);
}
