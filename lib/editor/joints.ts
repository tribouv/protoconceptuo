// Jonctions entre murs. Le modèle ne stocke pas de graphe : deux murs sont raccordés quand une
// extrémité de l'un coïncide avec une extrémité de l'autre (angle en L, croisement), ou tombe sur
// l'axe de l'autre (raccord en T). C'est ce que l'extraction produit et ce que l'éditeur préserve
// quand on déplace un angle ou un mur.
import type { Point, Project, Wall } from './model';
import { pointAt, project, sweep, wallLength } from './arc';

/** Tolérance de raccord, en mètres. */
export const JOIN = .01;

export type End = { wall: string; end: 'a' | 'b' };
/** Nœud : extrémités confondues ; `hosts` : murs dont l'axe passe par le nœud (raccord en T). */
export type Junction = { point: Point; ends: End[]; hosts: string[] };

const distance = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y);
const key = (e: End) => `${e.wall}:${e.end}`;
const cm = (n: number) => Math.round(n * 100) / 100;

/** Point de l'axe du mur le plus proche de p. */
export function closestOnAxis(w: Wall, p: Point): Point {
    return pointAt(w, project(w, p)).point;
}

function onInterior(w: Wall, p: Point, tol: number) {
    const L = wallLength(w), s = project(w, p);
    return L > 2 * tol && s > tol && s < L - tol && distance(pointAt(w, s).point, p) <= tol;
}

export function junctions(walls: Wall[], tol = JOIN): Junction[] {
    const nodes: Junction[] = [];
    for (const w of walls) for (const end of ['a', 'b'] as const) {
        const p = w[end], node = nodes.find(n => distance(n.point, p) <= tol);
        if (node) node.ends.push({ wall: w.id, end }); else nodes.push({ point: { ...p }, ends: [{ wall: w.id, end }], hosts: [] });
    }
    for (const n of nodes) for (const w of walls)
        if (!n.ends.some(e => e.wall === w.id) && onInterior(w, n.point, tol)) n.hosts.push(w.id);
    return nodes;
}

/** Le nœud qui porte cette extrémité. */
export function junctionOf(nodes: Junction[], wall: string, end: 'a' | 'b') {
    return nodes.find(n => n.ends.some(e => e.wall === wall && e.end === end))!;
}

/** Déplace des extrémités ; les baies gardent leur distance à l'extrémité qui ne bouge pas. */
function withEnds(w: Wall, targets: Map<string, Point>): Wall {
    const a = targets.get(`${w.id}:a`), b = targets.get(`${w.id}:b`);
    if (!a && !b) return w;
    const next = { ...w, a: a ? { ...a } : w.a, b: b ? { ...b } : w.b };
    const before = wallLength(w), after = wallLength(next);
    if (!w.openings.length || !before || !after || (a && b)) return next;
    // (les deux bouts bougent : translation, les offsets relatifs restent justes)
    return { ...next, openings: w.openings.map(o => {
        const fromA = o.offset * before, centre = b ? fromA : after - (before - fromA);
        return { ...o, offset: Math.max(0, Math.min(1, centre / after)) };
    }) };
}

/** Applique les déplacements, puis recale sur leur hôte les raccords en T dont l'hôte a bougé. */
function settle(p: Project, nodes: Junction[], targets: Map<string, Point>): Project {
    let walls = p.walls.map(w => withEnds(w, targets));
    const changed = new Set(walls.filter((w, i) => w !== p.walls[i]).map(w => w.id));
    const follow = new Map<string, Point>();
    for (const n of nodes) {
        if (!n.hosts.length || n.ends.some(e => targets.has(key(e)))) continue;
        const host = walls.find(w => w.id === n.hosts.find(h => changed.has(h)));
        if (!host) continue;
        const to = closestOnAxis(host, n.point);
        for (const e of n.ends) follow.set(key(e), to);
    }
    if (follow.size) walls = walls.map(w => withEnds(w, follow));
    return { ...p, walls };
}

/** Déplace un angle : toutes les extrémités raccordées à celle-ci suivent. */
export function moveJunction(p: Project, wall: string, end: 'a' | 'b', to: Point): Project {
    const nodes = junctions(p.walls), node = junctionOf(nodes, wall, end);
    if (!node) return p;
    return settle(p, nodes, new Map(node.ends.map(e => [key(e), to])));
}

/** Déplace plusieurs angles en une passe (les deux bouts d'un mur, par exemple). */
export function moveEnds(p: Project, moves: { wall: string; end: 'a' | 'b'; to: Point }[]): Project {
    const nodes = junctions(p.walls), targets = new Map<string, Point>();
    for (const m of moves) {
        const node = junctionOf(nodes, m.wall, m.end);
        if (node) for (const e of node.ends) targets.set(key(e), m.to);
    }
    return settle(p, nodes, targets);
}

/** Déplace un mur entier :les murs raccordés à ses extrémités s'étirent, un bout posé en T
 *  glisse le long de son hôte, et les murs qui s'y raccordent en T restent sur son axe. */
export function moveWall(p: Project, id: string, dx: number, dy: number): Project {
    const w = p.walls.find(o => o.id === id);
    if (!w) return p;
    const nodes = junctions(p.walls), targets = new Map<string, Point>();
    for (const end of ['a', 'b'] as const) {
        const node = junctionOf(nodes, id, end);
        // (au centimètre, comme la grille de l'éditeur : les bouts d'un même nœud restent confondus)
        let to = { x: cm(w[end].x + dx), y: cm(w[end].y + dy) };
        const host = node.hosts.length ? p.walls.find(o => o.id === node.hosts[0]) : undefined;
        if (host) to = closestOnAxis(host, to);
        for (const e of node.ends) targets.set(key(e), to);
    }
    // raccords en T sur ce mur : ils suivent la composante normale du déplacement
    const L = wallLength(w);
    if (L && !sweep(w)) {
        const nx = -(w.b.y - w.a.y) / L, ny = (w.b.x - w.a.x) / L, k = dx * nx + dy * ny;
        for (const n of nodes) if (n.hosts.includes(id) && !n.ends.some(e => targets.has(key(e))))
            for (const e of n.ends) targets.set(key(e), { x: n.point.x + nx * k, y: n.point.y + ny * k });
    }
    return settle(p, nodes, targets);
}

/** Fin de chaque face d'un mur droit, au-delà (> 0) ou en deçà (< 0) de son extrémité, le long
 *  de l'axe : `l` face gauche (normale (-uy, ux) de a vers b), `r` face droite. Un angle entre deux
 *  murs est coupé d'onglet — les deux murs se partagent la diagonale qui joint le coin intérieur au
 *  coin extérieur, sans dépasser de part et d'autre. Au-delà de deux murs, les bouts sont carrés et
 *  prolongés jusqu'à la face du voisin ; en T, sur un bout libre ou dans le prolongement d'un autre
 *  mur, ils s'arrêtent à l'extrémité. */
export type FaceEnds = { a: { l: number; r: number }; b: { l: number; r: number } };
export function faceEnds(walls: Wall[], tol = JOIN): Map<string, FaceEnds> {
    const out = new Map<string, FaceEnds>(walls.map(w => [w.id, { a: { l: 0, r: 0 }, b: { l: 0, r: 0 } }]));
    const byId = new Map(walls.map(w => [w.id, w]));
    // direction du nœud vers l'intérieur du mur (tangente pour un mur courbe)
    const into = (w: Wall, end: 'a' | 'b') => {
        const L = wallLength(w), at = pointAt(w, end === 'a' ? 0 : L), s = end === 'a' ? 1 : -1;
        return { x: Math.cos(at.heading) * s, y: Math.sin(at.heading) * s };
    };
    // intersection de la face (côté s) de w avec la face (côté so) de o : x le long du prolongement
    // de w (sortant du nœud), y le long de o (entrant dans o)
    const meet = (d: Point, h: number, s: number, v: Point, ho: number, so: number) => {
        const nw = { x: -d.y, y: d.x }, no = { x: -v.y, y: v.x };
        // nœud + nw·s·h − d·x = nœud + no·so·ho + v·y
        const rx = no.x * so * ho - nw.x * s * h, ry = no.y * so * ho - nw.y * s * h;
        const det = -d.x * -v.y - -d.y * -v.x;
        if (Math.abs(det) < 1e-9) return null;
        return { x: (rx * -v.y - ry * -v.x) / det, y: (-d.x * ry - -d.y * rx) / det };
    };
    for (const n of junctions(walls, tol)) {
        if (n.ends.length < 2) continue;
        for (const e of n.ends) {
            const w = byId.get(e.wall)!;
            if (sweep(w)) continue;
            const d = into(w, e.end), h = w.thickness / 2;
            // côté « gauche » de w (normale de a vers b) exprimé dans le repère de d
            const leftIsPlus = e.end === 'a' ? 1 : -1;
            const others = n.ends.filter(f => f.wall !== e.wall).map(f => ({ o: byId.get(f.wall)!, v: into(byId.get(f.wall)!, f.end) }))
                .filter(({ v }) => Math.abs(d.x * v.y - d.y * v.x) >= .2);   // quasi dans le prolongement : bout à bout
            if (!others.length) continue;
            const ends = out.get(e.wall)![e.end];
            if (n.ends.length === 2) {
                const { o, v } = others[0], ho = o.thickness / 2;
                // coin intérieur : dans le prolongement d'aucun des deux murs (x < 0, y > 0)
                let inner: { s: number; so: number; x: number } | null = null;
                for (const s of [1, -1]) for (const so of [1, -1]) {
                    const m = meet(d, h, s, v, ho, so);
                    if (m && m.x < 0 && m.y > 0) inner = { s, so, x: m.x };
                }
                const outer = inner && meet(d, h, -inner.s, v, ho, -inner.so);
                if (inner && outer && outer.x > 0 && outer.x <= 3 * Math.max(h, ho)) {
                    const byFace = { [inner.s]: inner.x, [-inner.s]: outer.x };
                    ends.l = byFace[leftIsPlus]; ends.r = byFace[-leftIsPlus];
                    continue;
                }
            }
            // plusieurs murs : bout carré, jusqu'à la face du voisin le plus épais
            const reach = Math.max(...others.map(({ o }) => o.thickness / 2));
            ends.l = ends.r = reach;
        }
    }
    return out;
}

/** Contour d'un mur droit, faces coupées selon `faceEnds` : gauche de a à b, puis droite de b à a. */
export function straightOutline(w: Pick<Wall, 'a' | 'b' | 'thickness'>, e: FaceEnds): Point[] {
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1, ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L, h = w.thickness / 2;
    const at = (t: number, side: number) => ({ x: w.a.x + ux * t - uy * h * side, y: w.a.y + uy * t + ux * h * side });
    return [at(-e.a.l, 1), at(L + e.b.l, 1), at(L + e.b.r, -1), at(-e.a.r, -1)];
}
