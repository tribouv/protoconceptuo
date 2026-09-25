// Vectorisation du masque des murs. Les murs du PDF sont peints en plein sur une grille fine
// (environ 1 cm par case), puis on en tire l'axe médian (squelette), qu'on découpe en portions
// droites ou en arcs. Les portions dans le prolongement l'une de l'autre forment un même mur, les
// axes sont recalés sur les faces vectorielles du dessin, et chaque angle est résolu par
// l'intersection des axes : les murs sortent raccordés, extrémité contre extrémité (angle en L)
// ou extrémité sur l'axe d'un autre mur (raccord en T).
// Module pur : ni canvas ni DOM, pour rester testable hors navigateur.
import type { Point } from './model';
import { angleThrough } from './arc';

export type Grid = { W: number; H: number; res: number; data: Uint8Array };
export type Edge = { x0: number; y0: number; x1: number; y1: number };
// gaps : brèches le long de l'axe (baies), en points depuis a
// kind : ce que le dessin montre dans la brèche (battement ou vantail : porte ; vitrage : fenêtre)
export type TracedWall = { a: Point; b: Point; thickness: number; gaps: { from: number; to: number; kind?: 'door' | 'window' }[]; angle?: number };

/** Grille vide de la taille de la page ; `res` cases par point. */
export function makeGrid(width: number, height: number, res: number): Grid {
    const W = Math.ceil(width * res) + 2, H = Math.ceil(height * res) + 2;
    return { W, H, res, data: new Uint8Array(W * H) };
}

/** Peint un polygone (arêtes d'un même chemin, règle pair-impair) : une case est peinte si son
 *  centre est dedans. */
export function paintPolygon(g: Grid, edges: Edge[], value = 1) {
    if (edges.length < 3) return;
    let y0 = Infinity, y1 = -Infinity;
    for (const e of edges) { y0 = Math.min(y0, e.y0, e.y1); y1 = Math.max(y1, e.y0, e.y1); }
    const { W, H, res, data } = g;
    for (let row = Math.max(0, Math.floor(y0 * res - .5)); row <= Math.min(H - 1, Math.ceil(y1 * res)); row++) {
        const y = (row + .5) / res, xs: number[] = [];
        for (const e of edges) if ((e.y0 <= y) !== (e.y1 <= y)) xs.push(e.x0 + (y - e.y0) * (e.x1 - e.x0) / (e.y1 - e.y0));
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2)
            for (let col = Math.max(0, Math.ceil(xs[k] * res - .5)); col <= Math.min(W - 1, Math.floor(xs[k + 1] * res - .5)); col++) data[row * W + col] = value;
    }
}

/** Quadrilatère (ou tout polygone donné par ses sommets). */
export function paintRing(g: Grid, ring: Point[], value = 1) {
    paintPolygon(g, ring.map((p, i) => ({ x0: p.x, y0: p.y, x1: ring[(i + 1) % ring.length].x, y1: ring[(i + 1) % ring.length].y })), value);
}

/** Transformée de distance euclidienne exacte (Felzenszwalb) : distance, en cases, de chaque case
 *  à la case « source » la plus proche. */
export function distanceTo(W: number, H: number, source: (i: number) => boolean): Float32Array {
    const INF = 1e10, f = new Float64Array(W * H);
    for (let i = 0; i < W * H; i++) f[i] = source(i) ? 0 : INF;
    const n = Math.max(W, H), line = new Float64Array(n), out = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    const pass = (len: number) => {
        let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
        for (let q = 1; q < len; q++) {
            let s = (line[q] + q * q - line[v[k]] - v[k] * v[k]) / (2 * q - 2 * v[k]);
            while (s <= z[k]) { k--; s = (line[q] + q * q - line[v[k]] - v[k] * v[k]) / (2 * q - 2 * v[k]); }
            k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
        }
        k = 0;
        for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; out[q] = (q - v[k]) ** 2 + line[v[k]]; }
    };
    for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) line[y] = f[y * W + x]; pass(H); for (let y = 0; y < H; y++) f[y * W + x] = out[y]; }
    for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) line[x] = f[y * W + x]; pass(W); for (let x = 0; x < W; x++) f[y * W + x] = out[x]; }
    const d = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) d[i] = Math.sqrt(f[i]);
    return d;
}

/** Amincissement de Zhang-Suen : squelette d'une case d'épaisseur, connexité préservée. */
export function thin(src: Uint8Array, W: number, H: number): Uint8Array {
    const img = src.slice();
    for (let x = 0; x < W; x++) { img[x] = 0; img[(H - 1) * W + x] = 0; }
    for (let y = 0; y < H; y++) { img[y * W] = 0; img[y * W + W - 1] = 0; }
    let active: number[] = [];
    for (let i = 0; i < W * H; i++) if (img[i]) active.push(i);
    for (let changed = true; changed;) {
        changed = false;
        for (const step of [0, 1]) {
            const drop: number[] = [];
            for (const i of active) {
                if (!img[i]) continue;
                const p2 = img[i - W], p3 = img[i - W + 1], p4 = img[i + 1], p5 = img[i + W + 1], p6 = img[i + W], p7 = img[i + W - 1], p8 = img[i - 1], p9 = img[i - W - 1];
                const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
                if (b < 2 || b > 6) continue;
                const a = +(!p2 && !!p3) + +(!p3 && !!p4) + +(!p4 && !!p5) + +(!p5 && !!p6) + +(!p6 && !!p7) + +(!p7 && !!p8) + +(!p8 && !!p9) + +(!p9 && !!p2);
                if (a !== 1) continue;
                if (step === 0 ? (p2 && p4 && p6) || (p4 && p6 && p8) : (p2 && p4 && p8) || (p2 && p6 && p8)) continue;
                drop.push(i);
            }
            for (const i of drop) img[i] = 0;
            if (drop.length) changed = true;
        }
        active = active.filter(i => img[i]);
    }
    return img;
}

type Fit = { cx: number; cy: number; ux: number; uy: number };
/** Droite des moindres carrés orthogonaux (ACP) d'un nuage de points. */
function fitLine(xs: number[], ys: number[]): Fit | null {
    const n = xs.length;
    if (n < 2) return null;
    let cx = 0, cy = 0;
    for (let i = 0; i < n; i++) { cx += xs[i]; cy += ys[i]; }
    cx /= n; cy /= n;
    let sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < n; i++) { const dx = xs[i] - cx, dy = ys[i] - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    const angle = Math.atan2(2 * sxy, sxx - syy) / 2;
    return { cx, cy, ux: Math.cos(angle), uy: Math.sin(angle) };
}

/** Cercle des moindres carrés (Kåsa). */
function fitCircle(xs: number[], ys: number[]) {
    const n = xs.length;
    if (n < 3) return null;
    let mx = 0, my = 0;
    for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
    mx /= n; my /= n;
    let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
    for (let i = 0; i < n; i++) { const u = xs[i] - mx, v = ys[i] - my; suu += u * u; svv += v * v; suv += u * v; suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u; }
    const det = suu * svv - suv * suv;
    if (Math.abs(det) < 1e-9) return null;
    const uc = ((suuu + suvv) / 2 * svv - (svvv + svuu) / 2 * suv) / det, vc = ((svvv + svuu) / 2 * suu - (suuu + suvv) / 2 * suv) / det;
    return { cx: mx + uc, cy: my + vc, r: Math.sqrt(uc * uc + vc * vc + (suu + svv) / n) };
}

/** Douglas-Peucker : indices des sommets conservés. */
function simplify(pts: Point[], tol: number): number[] {
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack: [number, number][] = [[0, pts.length - 1]];
    while (stack.length) {
        const [i, j] = stack.pop()!;
        const a = pts[i], b = pts[j], L = Math.hypot(b.x - a.x, b.y - a.y) || 1e-9;
        let worst = -1, far = tol;
        for (let k = i + 1; k < j; k++) {
            const d = Math.abs((b.x - a.x) * (a.y - pts[k].y) - (a.x - pts[k].x) * (b.y - a.y)) / L;
            if (d > far) { far = d; worst = k; }
        }
        if (worst > 0) { keep[worst] = 1; stack.push([i, worst], [worst, j]); }
    }
    return [...keep.keys()].filter(k => keep[k]);
}

export type TraceOptions = {
    /** mètres par point, pour exprimer les seuils en mètres */
    scale: number;
    /** faces vectorielles du dessin (arêtes des aplats de murs), en points : on y recale les axes */
    faces?: Edge[];
    /** une porte est-elle dessinée entre p et q ? 'arc' : son battement, 'leaf' : seulement un
     *  vantail — pour prolonger un mur jusqu'au flanc d'un autre à travers une porte */
    door?: (p: Point, q: Point) => 'arc' | 'leaf' | false;
    /** une baie est-elle dessinée entre p et q (vitrage, appui, battement) ? Sans elle, deux murs
     *  alignés séparés d'une largeur de baie ne sont pas réunis : l'espace entre eux est ouvert
     *  (un palier, une cour) */
    bay?: (p: Point, q: Point, thickness: number) => boolean;
    /** brèches refermées en baie, en mètres */
    minGap?: number; maxGap?: number;
    /** en deçà (mètres), un trait n'est pas un mur : allège, tablette, vantail */
    minThickness?: number;
    /** trace de mise au point */
    log?: (message: string) => void;
};

type Vertex = { id: number; x: number; y: number; kind: 'end' | 'junction' | 'bend'; radius: number; alive: boolean };
type Piece = { v0: number; v1: number; pix: number[]; arc?: { cx: number; cy: number; r: number }; alive: boolean };
type Line = {
    pieces: number[]; arc?: { cx: number; cy: number; r: number };
    /** extrémités d'un arc (un arc n'a pas d'axe droit) */
    pa?: Point; pb?: Point;
    cx: number; cy: number; ux: number; uy: number; thickness: number;
    /** sommets d'extrémité (côté t décroissant puis croissant) et sommets traversés */
    ends: [number, number]; through: number[];
    /** étendue le long de l'axe et brèches, en cases depuis (cx, cy) */
    t0: number; t1: number; gaps: [number, number][];
    free: [boolean, boolean];
    pix: number[]; alive: boolean;
};

/** Murs du masque. Coordonnées de sortie en points PDF. */
export function traceWalls(g: Grid, options: TraceOptions): TracedWall[] {
    const { W, H, res, data } = g, log = options.log ?? (() => {});
    const px = (m: number) => m / options.scale * res;   // mètres → cases
    for (let x = 0; x < W; x++) { data[x] = 0; data[(H - 1) * W + x] = 0; }
    for (let y = 0; y < H; y++) { data[y * W] = 0; data[y * W + W - 1] = 0; }
    const D = distanceTo(W, H, i => !data[i]);
    const sk = thin(data, W, H);
    const X = (i: number) => i % W + .5, Y = (i: number) => Math.floor(i / W) + .5;
    const inside = (x: number, y: number) => { const c = Math.floor(x), r = Math.floor(y); return c >= 0 && r >= 0 && c < W && r < H && data[r * W + c] === 1; };

    // voisinage mixte (m-adjacence) : une diagonale ne compte que si les deux voisins directs
    // qu'elle enjambe sont vides — sans quoi chaque marche d'escalier ferait une fausse jonction
    const nbrs = (i: number) => {
        const out: number[] = [];
        const n = i - W, s = i + W, e = i + 1, w = i - 1;
        if (sk[n]) out.push(n); if (sk[e]) out.push(e); if (sk[s]) out.push(s); if (sk[w]) out.push(w);
        if (sk[n + 1] && !sk[n] && !sk[e]) out.push(n + 1);
        if (sk[s + 1] && !sk[s] && !sk[e]) out.push(s + 1);
        if (sk[s - 1] && !sk[s] && !sk[w]) out.push(s - 1);
        if (sk[n - 1] && !sk[n] && !sk[w]) out.push(n - 1);
        return out;
    };

    // --- graphe du squelette : nœuds (bouts, jonctions) et chaînes de cases entre eux
    const nodeOf = new Int32Array(W * H).fill(-1);
    const vertices: Vertex[] = [];
    const skeleton: number[] = [];
    for (let i = 0; i < W * H; i++) if (sk[i]) skeleton.push(i);
    const degree = new Map<number, number>();
    for (const i of skeleton) degree.set(i, nbrs(i).length);
    const addVertex = (pixels: number[], kind: Vertex['kind']) => {
        const id = vertices.length;
        let x = 0, y = 0, r = 0;
        for (const p of pixels) { nodeOf[p] = id; x += X(p); y += Y(p); r = Math.max(r, D[p]); }
        vertices.push({ id, x: x / pixels.length, y: y / pixels.length, kind, radius: r, alive: true });
        return id;
    };
    for (const i of skeleton) {
        if (nodeOf[i] >= 0) continue;
        const d = degree.get(i)!;
        if (d === 2) continue;
        if (d < 2) { addVertex([i], 'end'); continue; }
        const cluster = [i], seen = new Set([i]);
        for (let k = 0; k < cluster.length; k++) for (const j of nbrs(cluster[k])) if (!seen.has(j) && degree.get(j)! >= 3) { seen.add(j); cluster.push(j); }
        addVertex(cluster, 'junction');
    }
    type Chain = { n0: number; n1: number; path: number[] };
    const chains: Chain[] = [];
    const visited = new Uint8Array(W * H);
    const direct = new Set<string>();
    const walk = (start: number, from: number, n0: number) => {
        const path = [start]; visited[start] = 1;
        let prev = from, cur = start;
        for (;;) {
            const next = nbrs(cur).find(j => j !== prev && (nodeOf[j] >= 0 ? nodeOf[j] !== n0 || path.length > 1 : !visited[j]));
            if (next === undefined) return { path, n1: -1 };
            if (nodeOf[next] >= 0) return { path, n1: nodeOf[next] };
            visited[next] = 1; path.push(next); prev = cur; cur = next;
        }
    };
    for (const i of skeleton) {
        const n0 = nodeOf[i];
        if (n0 < 0) continue;
        for (const j of nbrs(i)) {
            if (nodeOf[j] === n0) continue;
            if (nodeOf[j] >= 0) {
                const k = `${Math.min(n0, nodeOf[j])}-${Math.max(n0, nodeOf[j])}`;
                if (!direct.has(k)) { direct.add(k); chains.push({ n0, n1: nodeOf[j], path: [] }); }
                continue;
            }
            if (visited[j]) continue;
            const { path, n1 } = walk(j, i, n0);
            if (n1 < 0) { const end = addVertex([path.pop()!], 'end'); chains.push({ n0, n1: end, path }); }
            else chains.push({ n0, n1, path });
        }
    }
    // boucles sans nœud (un poteau rond, un mur circulaire) : on y pose un nœud
    for (const i of skeleton) {
        if (nodeOf[i] >= 0 || visited[i]) continue;
        const n0 = addVertex([i], 'junction');
        for (const j of nbrs(i)) if (!visited[j] && nodeOf[j] < 0) { const { path } = walk(j, i, -2); chains.push({ n0, n1: n0, path }); break; }
    }

    // --- élagage des ergots : une branche morte plus courte que le rayon du mur qu'elle quitte est
    // un artefact d'angle, pas un mur
    const incident = () => {
        const m = new Map<number, number[]>();
        chains.forEach((c, k) => { if (!c.path.length && c.n0 === c.n1) return; m.set(c.n0, [...(m.get(c.n0) ?? []), k]); m.set(c.n1, [...(m.get(c.n1) ?? []), k]); });
        return m;
    };
    const dead = new Set<number>();
    for (let pass = 0; pass < 6; pass++) {
        const inc = incident();
        let removed = false;
        chains.forEach((c, k) => {
            if (dead.has(k)) return;
            const d0 = (inc.get(c.n0) ?? []).filter(j => !dead.has(j)).length, d1 = (inc.get(c.n1) ?? []).filter(j => !dead.has(j)).length;
            const [leaf, hub] = d0 === 1 && d1 >= 3 ? [c.n0, c.n1] : d1 === 1 && d0 >= 3 ? [c.n1, c.n0] : [-1, -1];
            if (leaf < 0) return;
            // (branche qui s'amincit jusqu'à rien : la pointe d'un angle aigu, pas un mur)
            const len = c.path.length + 1, r = vertices[hub].radius, tip = vertices[leaf].radius;
            if (len <= 1.3 * r || (tip < .5 * r && len <= 4 * r)) { dead.add(k); vertices[leaf].alive = false; removed = true; }
        });
        if (!removed) break;
    }
    // un nœud de jonction réduit à deux branches redevient un simple point de passage
    for (let merged = true; merged;) {
        merged = false;
        const inc = incident();
        for (const [v, list] of inc) {
            const live = list.filter(k => !dead.has(k));
            if (live.length !== 2 || vertices[v].kind !== 'junction' || live[0] === live[1]) continue;
            const [p, q] = live.map(k => chains[k]);
            const pp = p.n1 === v ? p.path : [...p.path].reverse(), a = p.n1 === v ? p.n0 : p.n1;
            const qq = q.n0 === v ? q.path : [...q.path].reverse(), b = q.n0 === v ? q.n1 : q.n0;
            if (a === v || b === v) continue;
            const pixel = skeleton.find(i => nodeOf[i] === v);
            dead.add(live[0]); dead.add(live[1]);
            chains.push({ n0: a, n1: b, path: [...pp, ...(pixel !== undefined ? [pixel] : []), ...qq] });
            vertices[v].alive = false;
            merged = true;
            break;
        }
    }

    // --- chaînes → portions droites (Douglas-Peucker à ~1,5 cm) et arcs
    const pieces: Piece[] = [];
    const tol = Math.max(1.2, px(.012));
    const facet = px(.9);
    chains.forEach((c, k) => {
        if (dead.has(k)) return;
        const a = vertices[c.n0], b = vertices[c.n1];
        const pts: Point[] = [{ x: a.x, y: a.y }, ...c.path.map(i => ({ x: X(i), y: Y(i) })), { x: b.x, y: b.y }];
        if (pts.length < 2) return;
        const keep = simplify(pts, tol);
        // sommets intermédiaires : des coudes
        const ids = keep.map((k2, n) => n === 0 ? c.n0 : n === keep.length - 1 ? c.n1 : addBend(pts[k2]));
        const runs: { v0: number; v1: number; pix: number[]; from: number; to: number }[] = [];
        for (let n = 0; n + 1 < keep.length; n++) {
            // cases de la chaîne entre les deux sommets (indices décalés : pts[0] est le nœud)
            const pix = c.path.slice(Math.max(0, keep[n] - 1), Math.max(0, keep[n + 1] - 1) + 1);
            runs.push({ v0: ids[n], v1: ids[n + 1], pix, from: keep[n], to: keep[n + 1] });
        }
        // arcs : au moins quatre facettes courtes qui tournent toutes dans le même sens
        const len = (r: typeof runs[number]) => Math.hypot(pts[r.to].x - pts[r.from].x, pts[r.to].y - pts[r.from].y);
        const turn = (r: typeof runs[number], s: typeof runs[number]) => {
            const t = Math.atan2(pts[s.to].y - pts[s.from].y, pts[s.to].x - pts[s.from].x) - Math.atan2(pts[r.to].y - pts[r.from].y, pts[r.to].x - pts[r.from].x);
            return Math.atan2(Math.sin(t), Math.cos(t));
        };
        for (let s = 0; s < runs.length;) {
            let e = s;
            if (len(runs[s]) <= facet) {
                const sign = s + 1 < runs.length ? Math.sign(turn(runs[s], runs[s + 1])) : 0;
                while (e + 1 < runs.length && len(runs[e + 1]) <= facet && Math.sign(turn(runs[e], runs[e + 1])) === sign && sign !== 0
                    && Math.abs(turn(runs[e], runs[e + 1])) > Math.PI / 180 && Math.abs(turn(runs[e], runs[e + 1])) < 40 * Math.PI / 180) e++;
            }
            if (e - s + 1 >= 4) {
                const pix = runs.slice(s, e + 1).flatMap(r => r.pix);
                const xs = pts.slice(runs[s].from, runs[e].to + 1).map(p => p.x), ys = pts.slice(runs[s].from, runs[e].to + 1).map(p => p.y);
                const circle = fitCircle(xs, ys);
                const off = circle ? Math.max(...xs.map((x, n) => Math.abs(Math.hypot(x - circle.cx, ys[n] - circle.cy) - circle.r))) : Infinity;
                const sweep = Math.abs(angleThrough({ a: pts[runs[s].from], b: pts[runs[e].to] }, pts[Math.round((runs[s].from + runs[e].to) / 2)]));
                const arcLength = circle ? circle.r * sweep * Math.PI / 180 : 0;
                // (un arc de moins de 50 cm est un congé de raccord du dessin, pas un mur cintré)
                if (circle && off <= Math.max(2, px(.02)) && sweep >= 30 && arcLength >= px(.5)) {
                    pieces.push({ v0: runs[s].v0, v1: runs[e].v1, pix, arc: circle, alive: true });
                    for (let n = s; n < e; n++) vertices[runs[n].v1].alive = false;
                    s = e + 1;
                    continue;
                }
            }
            pieces.push({ v0: runs[s].v0, v1: runs[s].v1, pix: runs[s].pix, alive: true });
            s++;
        }
    });
    function addBend(p: Point) { const id = vertices.length; vertices.push({ id, x: p.x, y: p.y, kind: 'bend', radius: D[Math.floor(p.y) * W + Math.floor(p.x)] || 1, alive: true }); return id; }

    // --- épaisseur et axe de chaque portion, loin des jonctions où le squelette se tord
    const around = (v: Vertex) => v.kind === 'end' ? 0 : 1.25 * v.radius;
    const core = (p: Piece) => {
        const a = vertices[p.v0], b = vertices[p.v1];
        const kept = p.pix.filter(i => Math.hypot(X(i) - a.x, Y(i) - a.y) > around(a) && Math.hypot(X(i) - b.x, Y(i) - b.y) > around(b));
        return kept.length >= Math.max(3, p.pix.length * .25) ? kept : p.pix;
    };
    const thickOf = (pix: number[]) => {
        const v = pix.map(i => 2 * D[i] - 1).sort((a, b) => a - b);
        return v.length ? v[v.length >> 1] : 1;
    };
    const pieceLen = (p: Piece) => Math.hypot(vertices[p.v1].x - vertices[p.v0].x, vertices[p.v1].y - vertices[p.v0].y);
    const at = new Map<number, number[]>();
    const rebuild = () => { at.clear(); pieces.forEach((p, k) => { if (!p.alive) return; at.set(p.v0, [...(at.get(p.v0) ?? []), k]); at.set(p.v1, [...(at.get(p.v1) ?? []), k]); }); };
    rebuild();

    const trimmed = new Map<number, number>();
    // --- contraction des portions courtes entre deux jonctions (le chanfrein du squelette dans un
    // angle) et des bouts restés trop courts
    for (let changed = true; changed;) {
        changed = false;
        rebuild();
        const order = pieces.map((p, k) => k).filter(k => pieces[k].alive && !pieces[k].arc).sort((a, b) => pieceLen(pieces[a]) - pieceLen(pieces[b]));
        for (const k of order) {
            const p = pieces[k], a = vertices[p.v0], b = vertices[p.v1];
            if (p.v0 === p.v1) continue;
            const others = [...(at.get(p.v0) ?? []), ...(at.get(p.v1) ?? [])].filter(j => j !== k);
            const width = Math.max(thickOf(p.pix), ...others.map(j => thickOf(pieces[j].pix)));
            const openA = (at.get(p.v0) ?? []).length === 1, openB = (at.get(p.v1) ?? []).length === 1;
            if (openA && openB) continue;   // portion isolée : un poteau, traité plus loin
            if (pieceLen(p) >= .9 * width) continue;
            if (openA || openB) {
                // ergot d'extrémité (fourche du squelette au bout d'un mur épais) : effacé, dans la
                // limite de 0,9 épaisseur rognée depuis le bout — au-delà, c'est le mur lui-même (un
                // trumeau court entre deux fenêtres)
                const tip = openA ? a : b, inner = openA ? b : a, cut = (trimmed.get(tip.id) ?? 0) + pieceLen(p);
                if (cut < .9 * width) { p.alive = false; tip.alive = false; trimmed.set(inner.id, Math.max(trimmed.get(inner.id) ?? 0, cut)); changed = true; break; }
                continue;
            }
            // on fusionne b dans a, au milieu
            a.x = (a.x + b.x) / 2; a.y = (a.y + b.y) / 2; a.kind = 'junction'; a.radius = Math.max(a.radius, b.radius);
            for (const q of pieces) { if (q.v0 === b.id) q.v0 = a.id; if (q.v1 === b.id) q.v1 = a.id; }
            p.alive = false; b.alive = false; changed = true;
            break;
        }
    }
    rebuild();

    // --- murs : portions droites chaînées dans le prolongement l'une de l'autre, à travers les
    // coudes et les jonctions (un mur traversé par une cloison en T reste un seul mur)
    const fits = new Map<number, Fit & { t: number }>();
    pieces.forEach((p, k) => {
        if (!p.alive || p.arc) return;
        const pix = core(p), f = fitLine(pix.map(X), pix.map(Y));
        if (f) fits.set(k, { ...f, t: thickOf(pix) });
    });
    const outward = (k: number, v: number) => {
        const f = fits.get(k)!, p = pieces[k], o = vertices[p.v0 === v ? p.v1 : p.v0], s = vertices[v];
        const sign = (o.x - s.x) * f.ux + (o.y - s.y) * f.uy >= 0 ? 1 : -1;
        return { x: f.ux * sign, y: f.uy * sign };
    };
    const parent = pieces.map((_, k) => k);
    const root = (k: number): number => parent[k] === k ? k : (parent[k] = root(parent[k]));
    for (const [v, list] of at) {
        const straight = list.filter(k => fits.has(k));
        if (straight.length < 2) continue;
        const pairs: { i: number; j: number; score: number }[] = [];
        for (let x = 0; x < straight.length; x++) for (let y = x + 1; y < straight.length; y++) {
            const i = straight[x], j = straight[y], fi = fits.get(i)!, fj = fits.get(j)!;
            const di = outward(i, v), dj = outward(j, v), cos = -(di.x * dj.x + di.y * dj.y);
            if (cos < Math.cos(5 * Math.PI / 180)) continue;
            const tMax = Math.max(fi.t, fj.t), tMin = Math.min(fi.t, fj.t);
            if (tMax - tMin > Math.max(2, .3 * tMax)) continue;
            const lateral = Math.max(Math.abs(-fi.uy * (fj.cx - fi.cx) + fi.ux * (fj.cy - fi.cy)), Math.abs(-fj.uy * (fi.cx - fj.cx) + fj.ux * (fi.cy - fj.cy)));
            if (lateral > Math.max(2, .35 * tMin)) continue;
            pairs.push({ i, j, score: cos - lateral * .01 });
        }
        pairs.sort((p, q) => q.score - p.score);
        const used = new Set<number>();
        for (const { i, j } of pairs) {
            if (used.has(i) || used.has(j)) continue;
            used.add(i); used.add(j);
            parent[root(i)] = root(j);
        }
    }
    const groups = new Map<number, number[]>();
    pieces.forEach((p, k) => { if (p.alive) groups.set(root(k), [...(groups.get(root(k)) ?? []), k]); });

    const lines: Line[] = [];
    const project = (l: Line, x: number, y: number) => (x - l.cx) * l.ux + (y - l.cy) * l.uy;
    const refit = (l: Line) => {
        if (l.arc) return;
        const f = fitLine(l.pix.map(X), l.pix.map(Y));
        if (!f) return;
        // orientation conservée
        const s = f.ux * l.ux + f.uy * l.uy >= 0 ? 1 : -1;
        l.cx = f.cx; l.cy = f.cy; l.ux = f.ux * s; l.uy = f.uy * s;
    };
    for (const members of groups.values()) {
        const first = pieces[members[0]];
        const pix = members.flatMap(k => core(pieces[k]));
        // sommets de la chaîne : ceux qui n'apparaissent qu'une fois sont les extrémités
        const count = new Map<number, number>();
        for (const k of members) for (const v of [pieces[k].v0, pieces[k].v1]) count.set(v, (count.get(v) ?? 0) + 1);
        const tips = [...count].filter(([, n]) => n === 1).map(([v]) => v);
        const through = [...count].filter(([, n]) => n > 1).map(([v]) => v);
        if (first.arc) {
            const c = first.arc, a = vertices[first.v0], b = vertices[first.v1];
            lines.push({ pieces: members, arc: c, pa: { x: a.x, y: a.y }, pb: { x: b.x, y: b.y }, cx: a.x, cy: a.y, ux: 1, uy: 0, thickness: thickOf(pix), ends: [first.v0, first.v1], through: [], t0: 0, t1: 1, gaps: [], free: [a.kind === 'end', b.kind === 'end'], pix, alive: true });
            continue;
        }
        const f = fitLine(pix.map(X), pix.map(Y)) ?? { cx: vertices[first.v0].x, cy: vertices[first.v0].y, ux: 1, uy: 0 };
        const l: Line = { pieces: members, cx: f.cx, cy: f.cy, ux: f.ux, uy: f.uy, thickness: thickOf(pix), ends: [tips[0] ?? first.v0, tips[1] ?? first.v1], through, t0: 0, t1: 0, gaps: [], free: [false, false], pix, alive: true };
        if (project(l, vertices[l.ends[0]].x, vertices[l.ends[0]].y) > project(l, vertices[l.ends[1]].x, vertices[l.ends[1]].y)) l.ends.reverse();
        l.t0 = project(l, vertices[l.ends[0]].x, vertices[l.ends[0]].y); l.t1 = project(l, vertices[l.ends[1]].x, vertices[l.ends[1]].y);
        lines.push(l);
    }

    // traits trop fins pour être des murs, ou trop courts pour leur épaisseur (un bout de trait
    // accroché à un mur)
    const floor = px(options.minThickness ?? .04);
    for (const l of lines) {
        const span = l.arc ? Infinity : Math.abs(project(l, vertices[l.ends[1]].x, vertices[l.ends[1]].y) - project(l, vertices[l.ends[0]].x, vertices[l.ends[0]].y));
        if (l.thickness < floor) l.alive = false;
        else if (span < l.thickness * .5 && vertices[l.ends[0]].kind !== 'end' === (vertices[l.ends[1]].kind !== 'end')) l.alive = false;
    }

    // degré de chaque sommet dans le graphe des murs
    const users = (v: number) => lines.filter(l => l.alive && (l.ends.includes(v) || l.through.includes(v)));
    for (const l of lines) l.free = [users(l.ends[0]).length === 1, users(l.ends[1]).length === 1];

    // --- bouts libres : le squelette s'arrête un rayon avant la fin du mur ; on avance le long de
    // l'axe jusqu'au bord réel du masque
    const reachEnd = (l: Line, side: 0 | 1) => {
        const sign = side ? 1 : -1;
        let t = side ? l.t1 : l.t0;
        const h = l.thickness / 4;
        const solid = (tt: number) => {
            const x = l.cx + l.ux * tt, y = l.cy + l.uy * tt;
            return +inside(x, y) + +inside(x - l.uy * h, y + l.ux * h) + +inside(x + l.uy * h, y - l.ux * h) >= 2;
        };
        // on recule d'abord jusqu'au plein (un bout de squelette peut déborder d'une demi-case)
        for (let k = 0; k < 8 && !solid(t); k++) t -= sign * .5;
        // (jusqu'à 60 cm au-delà : une gaine, un coffre dans l'alignement du mur)
        for (let k = 0; k < 2 * (2 * l.thickness + px(.6)) && solid(t + sign * .5); k++) t += sign * .5;
        t += sign * .5;
        if (side) l.t1 = t; else l.t0 = t;
    };
    for (const l of lines) if (!l.arc) { if (l.free[0]) reachEnd(l, 0); if (l.free[1]) reachEnd(l, 1); }

    // --- baies : deux bouts libres dans l'alignement l'un de l'autre, face à face, de même
    // épaisseur, séparés d'une largeur de baie : un seul mur, percé
    const minGap = px(options.minGap ?? .3), maxGap = px(options.maxGap ?? 2.6);
    const endPoint = (l: Line, side: 0 | 1) => { const t = side ? l.t1 : l.t0; return { x: l.cx + l.ux * t, y: l.cy + l.uy * t }; };
    /** Pose exactement un bout du mur en p : si p n'est pas sur l'axe, le mur pivote autour de son
     *  autre bout (les raccords doivent tomber pile sur le même point). */
    const pin = (l: Line, side: 0 | 1, p: Point) => {
        const lateral = Math.abs(-l.uy * (p.x - l.cx) + l.ux * (p.y - l.cy));
        if (lateral < .25) { const t = project(l, p.x, p.y); if (side) l.t1 = Math.max(t, l.t0 + 1); else l.t0 = Math.min(t, l.t1 - 1); return; }
        const f = endPoint(l, side ? 0 : 1), dx = p.x - f.x, dy = p.y - f.y, L = Math.hypot(dx, dy);
        if (L < 1) return;
        const gaps = l.gaps.map(([a, b]) => [a - (side ? l.t0 : l.t1), b - (side ? l.t0 : l.t1)]);
        l.cx = f.x; l.cy = f.y;
        if (side) { l.ux = dx / L; l.uy = dy / L; l.t0 = 0; l.t1 = L; l.gaps = gaps.map(([a, b]) => [a, b] as [number, number]); }
        else { l.ux = -dx / L; l.uy = -dy / L; l.t1 = 0; l.t0 = -L; l.gaps = gaps.map(([a, b]) => [a, b] as [number, number]); }
    };
    // part d'un segment qui traverse un mur (un trait fin — vitrage, appui — n'en est pas un)
    const crossesMask = (p: Point, q: Point, core = px(options.minThickness ?? .04) / 2) => {
        const n = Math.max(2, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y)));
        let hits = 0;
        for (let k = 1; k < n; k++) { const x = p.x + (q.x - p.x) * k / n, y = p.y + (q.y - p.y) * k / n, c = Math.floor(x), r = Math.floor(y); if (inside(x, y) && D[r * W + c] > core) hits++; }
        return hits / (n - 1);
    };
    const joined = new Set<string>();   // paires d'épaisseurs différentes déjà raccordées bout à bout
    for (let merged = true; merged;) {
        merged = false;
        let best: { A: Line; B: Line; sa: 0 | 1; sb: 0 | 1; gap: number } | null = null;
        for (const A of lines) for (const B of lines) {
            if (A === B || !A.alive || !B.alive || A.arc || B.arc) continue;
            // (la direction d'un tronçon court est moins sûre : quelques cases d'écart sur sa longueur)
            if (Math.abs(A.ux * B.uy - A.uy * B.ux) > Math.max(Math.sin(3 * Math.PI / 180), 4 / Math.min(A.t1 - A.t0, B.t1 - B.t0))) continue;
            const tMax = Math.max(A.thickness, B.thickness), tMin = Math.min(A.thickness, B.thickness);
            if (tMax - tMin > Math.max(2, .35 * tMax)) continue;
            for (const sa of [0, 1] as const) for (const sb of [0, 1] as const) {
                const p = endPoint(A, sa), q = endPoint(B, sb), far = endPoint(B, sb ? 0 : 1), da = sa ? 1 : -1;
                // positions le long de l'axe de A : B doit être entièrement du côté `sa`
                const tq = project(A, q.x, q.y), tf = project(A, far.x, far.y), edge = sa ? A.t1 : A.t0;
                const gap = (tq - edge) * da;
                if ((tf - edge) * da <= Math.max(gap, 0) || gap < -tMax || gap > maxGap || (best && gap >= best.gap)) continue;
                // bouts jointifs (brèche plus étroite qu'une baie) : un seul mur, même si ses bouts
                // sont déjà pris dans des raccords ; une baie, elle, s'ouvre sur au moins un bout libre
                // (une fenêtre contre le retour d'une cloison)
                // (entre les deux, le dessin est plein : c'est un seul mur, pas une baie)
                // (ou la brèche est trop étroite pour une baie entre deux bouts déjà raccordés)
                const solid = gap > 0 && (crossesMask(p, q, tMin / 4) >= .75 || (!A.free[sa] && !B.free[sb] && gap < px(.45)));
                if (gap >= minGap && !solid && !A.free[sa] && !B.free[sb]) continue;
                if (joined.has(`${lines.indexOf(A)}:${sa}`) || joined.has(`${lines.indexOf(B)}:${sb}`)) continue;
                if (gap >= minGap && !solid) {
                    const dir = { x: (q.x - p.x) / Math.hypot(q.x - p.x, q.y - p.y), y: (q.y - p.y) / Math.hypot(q.x - p.x, q.y - p.y) };
                    if ((dir.x * A.ux + dir.y * A.uy) * da < .96 || -(dir.x * B.ux + dir.y * B.uy) * (sb ? 1 : -1) < .96) continue;
                    // (le cadre d'une fenêtre, dessiné dans la baie, est bien plus fin que le mur)
                    if (crossesMask(p, q, tMin / 4) > .25) continue;
                    if (options.bay && !options.bay({ x: p.x / res, y: p.y / res }, { x: q.x / res, y: q.y / res }, tMax / res)) continue;
                }
                const lateral = Math.max(Math.abs(-A.uy * (q.x - A.cx) + A.ux * (q.y - A.cy)), Math.abs(-B.uy * (p.x - B.cx) + B.ux * (p.y - B.cy)));
                if (lateral > Math.max(2, .3 * tMin)) continue;
                best = { A, B, sa, sb, gap: solid ? Math.min(gap, minGap * .99) : gap };
            }
        }
        if (!best) break;
        const { A, B, sa, sb } = best;
        const p = endPoint(A, sa), q = endPoint(B, sb);
        // épaisseurs différentes (une façade qui s'amincit) : deux murs, raccordés bout à bout ; la
        // baie est portée par celui dont le bout est libre (le plus long si les deux le sont)
        if (Math.abs(A.thickness - B.thickness) > Math.max(2, .12 * Math.max(A.thickness, B.thickness))) {
            const aCarries = A.free[sa] && (!B.free[sb] || A.t1 - A.t0 >= B.t1 - B.t0);
            const [C, sc, O, so] = aCarries ? [A, sa, B, sb] as const : [B, sb, A, sa] as const;
            const target = endPoint(O, so), from = sc ? C.t1 : C.t0, t = project(C, target.x, target.y);
            if (best.gap >= minGap) C.gaps.push([Math.min(from, t), Math.max(from, t)]);
            if (sc) C.t1 = t; else C.t0 = t;
            let v: number;
            if (O.free[so]) { v = C.ends[sc]; vertices[v].x = target.x; vertices[v].y = target.y; O.ends[so] = v; }
            else { v = O.ends[so]; C.ends[sc] = v; }
            C.free[sc] = false; O.free[so] = false;
            joined.add(`${lines.indexOf(C)}:${sc}`); joined.add(`${lines.indexOf(O)}:${so}`);
            merged = true;
            log(`baie entre deux épaisseurs : ${(best.gap / res * options.scale).toFixed(2)} m vers (${(target.x / res * options.scale).toFixed(2)}, ${(target.y / res * options.scale).toFixed(2)})`);
            continue;
        }
        const far = [endPoint(A, sa ? 0 : 1), endPoint(B, sb ? 0 : 1)];
        const gapsAbs = [...(best.gap >= minGap ? [[p, q]] : []), ...A.gaps.map(([f, t]) => [{ x: A.cx + A.ux * f, y: A.cy + A.uy * f }, { x: A.cx + A.ux * t, y: A.cy + A.uy * t }]), ...B.gaps.map(([f, t]) => [{ x: B.cx + B.ux * f, y: B.cy + B.uy * f }, { x: B.cx + B.ux * t, y: B.cy + B.uy * t }])] as Point[][];
        const endsKept: [number, number] = [A.ends[sa ? 0 : 1], B.ends[sb ? 0 : 1]];
        const freeKept: [boolean, boolean] = [A.free[sa ? 0 : 1], B.free[sb ? 0 : 1]];
        const inner = [...(A.free[sa] ? [] : [A.ends[sa]]), ...(B.free[sb] ? [] : [B.ends[sb]])];
        A.pix = [...A.pix, ...B.pix]; A.pieces = [...A.pieces, ...B.pieces]; A.through = [...A.through, ...B.through, ...inner];
        A.thickness = thickOf(A.pix);
        refit(A);
        const tf = far.map(pt => project(A, pt.x, pt.y));
        const order = tf[0] <= tf[1] ? [0, 1] : [1, 0];
        A.t0 = tf[order[0]]; A.t1 = tf[order[1]];
        A.ends = [endsKept[order[0]], endsKept[order[1]]]; A.free = [freeKept[order[0]], freeKept[order[1]]];
        A.gaps = gapsAbs.map(([u, v]) => { const x = project(A, u.x, u.y), y = project(A, v.x, v.y); return [Math.min(x, y), Math.max(x, y)] as [number, number]; }).sort((m, n) => m[0] - n[0]);
        B.alive = false;
        merged = true;
        log(`${best.gap >= minGap ? 'baie refermée' : 'murs alignés réunis'} : ${(best.gap / res * options.scale).toFixed(2)} m entre (${(p.x / res * options.scale).toFixed(2)}, ${(p.y / res * options.scale).toFixed(2)}) et (${(q.x / res * options.scale).toFixed(2)}, ${(q.y / res * options.scale).toFixed(2)})`);
    }

    // --- recalage sur les faces vectorielles : l'axe passe à mi-chemin des deux faces, l'épaisseur
    // est leur écart exact
    if (options.faces?.length) {
        const faces = options.faces.map(e => ({ x0: e.x0 * res, y0: e.y0 * res, x1: e.x1 * res, y1: e.y1 * res }));
        for (const l of lines) {
            if (!l.alive || l.arc) continue;
            const nx = -l.uy, ny = l.ux, half = l.thickness / 2, slack = Math.max(1.5, l.thickness * .3), span = l.t1 - l.t0;
            const sides: { d: number; w: number; ux: number; uy: number }[][] = [[], []];
            for (const e of faces) {
                const L = Math.hypot(e.x1 - e.x0, e.y1 - e.y0);
                if (L < 2) continue;
                let ex = (e.x1 - e.x0) / L, ey = (e.y1 - e.y0) / L;
                if (Math.abs(ex * l.uy - ey * l.ux) > Math.sin(2 * Math.PI / 180)) continue;
                if (ex * l.ux + ey * l.uy < 0) { ex = -ex; ey = -ey; }
                const d = ((e.x0 + e.x1) / 2 - l.cx) * nx + ((e.y0 + e.y1) / 2 - l.cy) * ny;
                const side = Math.abs(d - half) <= slack ? 0 : Math.abs(d + half) <= slack ? 1 : -1;
                if (side < 0) continue;
                const a = project(l, e.x0, e.y0), b = project(l, e.x1, e.y1);
                const overlap = Math.min(Math.max(a, b), l.t1) - Math.max(Math.min(a, b), l.t0);
                if (overlap < Math.min(span * .3, px(.3))) continue;
                sides[side].push({ d, w: overlap, ux: ex, uy: ey });
            }
            if (!sides[0].length && !sides[1].length) continue;
            const median = (list: { d: number; w: number }[]) => {
                const s = [...list].sort((p, q) => p.d - q.d), total = s.reduce((n, x) => n + x.w, 0);
                let acc = 0;
                for (const x of s) { acc += x.w; if (acc >= total / 2) return x.d; }
                return s[s.length - 1].d;
            };
            // une seule face retrouvée : l'épaisseur reste celle du masque, la face cale la position
            const left = sides[0].length ? median(sides[0]) : median(sides[1]) + l.thickness, right = sides[1].length ? median(sides[1]) : median(sides[0]) - l.thickness;
            // direction : moyenne pondérée des faces retenues
            let ux = 0, uy = 0;
            for (const x of [...sides[0], ...sides[1]]) { ux += x.ux * x.w; uy += x.uy * x.w; }
            const n = Math.hypot(ux, uy);
            const mid = (left + right) / 2, t0 = { x: l.cx + l.ux * l.t0, y: l.cy + l.uy * l.t0 }, t1 = { x: l.cx + l.ux * l.t1, y: l.cy + l.uy * l.t1 };
            const gapPts = l.gaps.map(([f, t]) => [{ x: l.cx + l.ux * f, y: l.cy + l.uy * f }, { x: l.cx + l.ux * t, y: l.cy + l.uy * t }]);
            l.cx += nx * mid; l.cy += ny * mid;
            if (n > 0) { l.ux = ux / n; l.uy = uy / n; }
            l.thickness = left - right;
            l.t0 = project(l, t0.x, t0.y); l.t1 = project(l, t1.x, t1.y);
            l.gaps = gapPts.map(([u, v]) => [project(l, u.x, u.y), project(l, v.x, v.y)] as [number, number]);
        }
    }

    // --- angles : chaque sommet partagé reçoit une position, l'intersection des axes
    const intersect = (l: Line, m: Line) => {
        const det = l.ux * m.uy - l.uy * m.ux;
        if (Math.abs(det) < Math.sin(8 * Math.PI / 180)) return null;
        const dx = m.cx - l.cx, dy = m.cy - l.cy, t = (dx * m.uy - dy * m.ux) / det;
        return { x: l.cx + l.ux * t, y: l.cy + l.uy * t };
    };
    const setEnd = (l: Line, v: number, p: Point) => {
        if (l.arc) { if (l.ends[0] === v) l.pa = { ...p }; else l.pb = { ...p }; return; }
        pin(l, l.ends[0] === v ? 0 : 1, p);
    };
    // chaque bout se pose sur son propre axe, à l'intersection avec le mur le plus en travers qui
    // passe par le même sommet (l'hôte d'abord, pour un raccord en T) : un angle en L tombe pile
    // sur un même point, et aucun mur ne pivote. Deux murs dans le prolongement l'un de l'autre,
    // sans troisième mur, gardent chacun leur bout.
    const liveVertices = new Set(lines.filter(l => l.alive).flatMap(l => [...l.ends, ...l.through]));
    for (const v of liveVertices) {
        const list = users(v);
        if (list.length < 2) continue;
        const hosts = list.filter(l => l.through.includes(v) && !l.arc);
        const tips = list.filter(l => l.ends.includes(v));
        const reach = 3 * Math.max(...list.map(l => l.thickness)) + 4;
        const placed = new Map<Line, Point>();
        for (const l of tips.filter(t => !t.arc)) {
            const anchors = hosts.length ? hosts : list.filter(m => m !== l && !m.arc);
            const far = endPoint(l, l.ends[0] === v ? 1 : 0);
            let best: Point | null = null, score = -Infinity;
            for (const m of anchors) {
                const hit = intersect(l, m);
                if (!hit || Math.hypot(hit.x - vertices[v].x, hit.y - vertices[v].y) > reach) continue;
                // (le point le plus loin du bout opposé : le mur couvre toute la jonction)
                const d = Math.hypot(hit.x - far.x, hit.y - far.y);
                if (d > score) { score = d; best = hit; }
            }
            const p = best ?? closest(l, vertices[v]);
            setEnd(l, v, p);
            placed.set(l, p);
        }
        // bouts d'arc : sur le bout du mur droit voisin, ou sur l'axe de l'hôte
        // (le mur droit qui continue la tangente de l'arc, pas une cloison qui arrive en biais)
        for (const l of tips.filter(t => t.arc)) {
            const e = l.ends[0] === v ? l.pa! : l.pb!, c = l.arc!, tx = -(e.y - c.cy), ty = e.x - c.cx, tn = Math.hypot(tx, ty) || 1;
            let best: Point | null = null, score = -1;
            for (const [m, p] of placed) { const s2 = Math.abs(m.ux * tx + m.uy * ty) / tn; if (s2 > score) { score = s2; best = p; } }
            setEnd(l, v, hosts.length ? closest(hosts[0], vertices[v]) : best ?? vertices[v]);
        }
    }
    function closest(l: Line, p: Point) { const t = project(l, p.x, p.y); return { x: l.cx + l.ux * t, y: l.cy + l.uy * t }; }

    // --- raccords manqués : un bout libre qui tombe dans l'épaisseur d'un autre mur s'y raccorde —
    // en T sur son axe, ou en angle si c'est aussi un bout de ce mur ; dans le prolongement d'un mur
    // d'une autre épaisseur, bout à bout
    for (const l of lines) for (const side of [0, 1] as const) {
        if (!l.alive || l.arc || !l.free[side]) continue;
        const p = endPoint(l, side);
        let best: { m: Line; d: number } | null = null;
        for (const m of lines) {
            if (m === l || !m.alive || m.arc) continue;
            const t = project(m, p.x, p.y), d = Math.abs(-m.uy * (p.x - m.cx) + m.ux * (p.y - m.cy)), h = m.thickness / 2 + 2;
            if (d > h || t < m.t0 - h || t > m.t1 + h || (best && d >= best.d)) continue;
            best = { m, d };
        }
        if (!best) continue;
        const m = best.m, sin = Math.abs(l.ux * m.uy - l.uy * m.ux);
        let hit: Point | null;
        if (sin < .1) {
            // bout à bout : on rejoint l'extrémité de m la plus proche — si les axes se prolongent
            // (une cloison alignée sur la face d'un mur épais le longe, elle ne s'y raccorde pas)
            if (best.d > Math.max(2, .3 * Math.min(l.thickness, m.thickness))) continue;
            const k = Math.hypot(endPoint(m, 0).x - p.x, endPoint(m, 0).y - p.y) <= Math.hypot(endPoint(m, 1).x - p.x, endPoint(m, 1).y - p.y) ? 0 : 1;
            hit = endPoint(m, k);
            if (Math.hypot(hit.x - p.x, hit.y - p.y) > Math.max(l.thickness, m.thickness)) continue;
        } else hit = intersect(l, m);
        if (!hit) continue;
        const t = project(l, hit.x, hit.y);
        if (side) l.t1 = Math.max(t, l.t0 + 1); else l.t0 = Math.min(t, l.t1 - 1);
        l.free[side] = false;
        for (const k of [0, 1] as const) {
            const e = endPoint(m, k);
            if (Math.hypot(e.x - hit.x, e.y - hit.y) <= m.thickness + 2) { const tm = project(m, hit.x, hit.y); if (k) m.t1 = tm; else m.t0 = tm; m.free[k] = false; }
        }
        log(`raccord : (${(hit.x / res * options.scale).toFixed(2)}, ${(hit.y / res * options.scale).toFixed(2)})`);
    }

    // --- portes en bout de mur : un bout libre face au flanc d'un autre mur, à une largeur de
    // porte, avec un battement dessiné entre les deux — le mur se prolonge jusqu'à l'autre, percé
    // longueur cumulée de l'ensemble de murs raccordés auquel appartient un mur
    const groupLength = (start: Line) => {
        const seen = new Set<Line>([start]), queue = [start];
        let total = 0;
        while (queue.length) {
            const l = queue.pop()!;
            total += l.arc ? Math.hypot(l.pb!.x - l.pa!.x, l.pb!.y - l.pa!.y) : l.t1 - l.t0;
            for (const v of [...l.ends, ...l.through]) for (const m of users(v)) if (!seen.has(m)) { seen.add(m); queue.push(m); }
        }
        return total;
    };
    // brèches dont le dessin dit la nature (milieu, en cases)
    const marked: { x: number; y: number; kind: 'door' | 'window' }[] = [];
    if (options.door) {
        const added: Line[] = [];
        for (const l of lines) {
            if (!l.alive || !l.arc) continue;
            // bout d'arc : la porte est dans le prolongement de sa tangente, portée par un pan droit
            for (const side of [0, 1] as const) {
                if (!l.free[side]) continue;
                const e = side ? l.pb! : l.pa!, o = side ? l.pa! : l.pb!, c = l.arc;
                let d = { x: -(e.y - c.cy), y: e.x - c.cx };
                const n = Math.hypot(d.x, d.y) || 1; d = { x: d.x / n, y: d.y / n };
                if ((e.x - o.x) * d.x + (e.y - o.y) * d.y < 0) d = { x: -d.x, y: -d.y };
                const ray = { cx: e.x, cy: e.y, ux: d.x, uy: d.y } as Line;
                let best: { m: Line; hit: Point; face: number } | null = null;
                for (const m of lines) {
                    if (m === l || !m.alive || m.arc || Math.abs(d.x * m.ux + d.y * m.uy) > .35) continue;
                    const hit = intersect(ray, m);
                    if (!hit) continue;
                    const along = (hit.x - e.x) * d.x + (hit.y - e.y) * d.y, face = along - m.thickness / 2, tm = project(m, hit.x, hit.y);
                    if (tm < m.t0 - m.thickness / 2 || tm > m.t1 + m.thickness / 2) continue;
                    if (face < px(.3) || face > px(1.6) || (best && face >= best.face)) continue;
                    const q = { x: e.x + d.x * face, y: e.y + d.y * face };
                    if (crossesMask(e, q, l.thickness / 4) > .25 || !options.door({ x: e.x / res, y: e.y / res }, { x: q.x / res, y: q.y / res })) continue;
                    best = { m, hit, face };
                }
                if (!best) continue;
                const end = vertices.length;
                vertices.push({ id: end, x: best.hit.x, y: best.hit.y, kind: 'junction', radius: 1, alive: true });
                const length = Math.hypot(best.hit.x - e.x, best.hit.y - e.y);
                added.push({ pieces: [], cx: e.x, cy: e.y, ux: d.x, uy: d.y, thickness: l.thickness, ends: [l.ends[side], end], through: [], t0: 0, t1: length, gaps: [[0, best.face]], free: [false, false], pix: [], alive: true });
                marked.push({ x: e.x + d.x * best.face / 2, y: e.y + d.y * best.face / 2, kind: 'door' });
                l.free[side] = false;
                log(`porte au bout d'un arc : ${(best.face / res * options.scale).toFixed(2)} m`);
            }
        }
        lines.push(...added);
        for (const l of lines) {
            if (!l.alive || l.arc) continue;
            for (const side of [0, 1] as const) {
                if (!l.free[side]) continue;
                const p = endPoint(l, side), d = side ? { x: l.ux, y: l.uy } : { x: -l.ux, y: -l.uy };
                let best: { m: Line; hit: Point; face: number; kind: 'door' | 'window' } | null = null;
                for (const m of lines) {
                    if (m === l || !m.alive || m.arc) continue;
                    let kind: 'door' | 'window' = 'door';
                    const cos = Math.abs(d.x * m.ux + d.y * m.uy);
                    const hit = intersect(l, m);
                    if (!hit) continue;
                    // (face du mur visé mesurée le long de l'axe : un raccord en biais la touche plus loin)
                    const along = (hit.x - p.x) * d.x + (hit.y - p.y) * d.y, face = along - m.thickness / 2 / Math.sqrt(1 - cos * cos);
                    if (cos > .9 && face >= px(.35)) continue;   // (une porte en biais reste possible, battement à l'appui)
                    const tm = project(m, hit.x, hit.y);
                    if (tm < m.t0 - m.thickness / 2 - 2 || tm > m.t1 + m.thickness / 2 + 2) continue;   // (jusqu'à l'angle du mur visé)
                    if (face < -m.thickness / 2 || face > px(1.3) || (best && face >= best.face)) continue;
                    const q = { x: p.x + d.x * face, y: p.y + d.y * face };
                    // (moins de 35 cm : trop étroit pour une porte — une gaine, un jour du dessin :
                    // le mur va simplement jusqu'à l'autre)
                    if (face >= px(.35)) {
                        if (crossesMask(p, q) > .25) continue;
                        // (ou une fenêtre en bout de façade, contre le mur en retour : son vitrage est dessiné)
                        const evidence = options.door({ x: p.x / res, y: p.y / res }, { x: q.x / res, y: q.y / res })
                            || (options.bay?.({ x: p.x / res, y: p.y / res }, { x: q.x / res, y: q.y / res }, l.thickness / res) ? 'bay' : false);
                        // (un petit groupe de traits isolé — flèche, repère — ne porte une porte que si son
                        // battement est dessiné : un vantail voisin ne suffit pas)
                        if (!evidence || (evidence === 'leaf' && groupLength(l) < px(.6))) continue;
                        if (evidence === 'bay') kind = 'window';
                    }
                    best = { m, hit, face, kind };
                }
                if (!best) continue;
                const start = side ? l.t1 : l.t0, end = project(l, best.hit.x, best.hit.y);
                const face = start + (side ? 1 : -1) * best.face;
                if (best.face >= px(.35)) {
                    l.gaps.push([Math.min(start, face), Math.max(start, face)]);
                    const mid = (start + face) / 2;
                    marked.push({ x: l.cx + l.ux * mid, y: l.cy + l.uy * mid, kind: best.kind });
                }
                if (side) l.t1 = end; else l.t0 = end;
                l.free[side] = false;
                // visé au ras de son bout : l'autre mur vient au même point, en angle
                for (const k of [0, 1] as const) {
                    const e = endPoint(best.m, k);
                    if (Math.hypot(e.x - best.hit.x, e.y - best.hit.y) <= best.m.thickness / 2 + 2) { const tm = project(best.m, best.hit.x, best.hit.y); if (k) best.m.t1 = tm; else best.m.t0 = tm; best.m.free[k] = false; }
                }
                log(`porte en bout de mur : ${(best.face / res * options.scale).toFixed(2)} m`);
            }
        }
    }

    // --- sortie, en points
    const out: TracedWall[] = [];
    for (const l of lines) {
        if (!l.alive) continue;
        const thickness = Math.max(1, l.thickness) / res;
        if (l.arc) {
            const a = { x: l.pa!.x / res, y: l.pa!.y / res }, b = { x: l.pb!.x / res, y: l.pb!.y / res };
            // sommet de l'arc : le point du cercle au milieu de la corde, du côté du squelette
            const mx = (l.pa!.x + l.pb!.x) / 2, my = (l.pa!.y + l.pb!.y) / 2, c = l.arc;
            let ox = mx - c.cx, oy = my - c.cy;
            const on = l.pix.map(i => ({ x: X(i), y: Y(i) })).sort((p, q) => Math.hypot(p.x - mx, p.y - my) - Math.hypot(q.x - mx, q.y - my))[0];
            if (on && (on.x - c.cx) * ox + (on.y - c.cy) * oy < 0) { ox = -ox; oy = -oy; }
            const n = Math.hypot(ox, oy) || 1, top = { x: (c.cx + ox / n * c.r) / res, y: (c.cy + oy / n * c.r) / res };
            const angle = angleThrough({ a, b }, top);
            if (Math.abs(angle) >= 1) out.push({ a, b, thickness, gaps: [], angle });
            continue;
        }
        // morceau isolé et court : un symbole (flèche d'entrée, repère), pas un mur
        if (l.free[0] && l.free[1] && l.t1 - l.t0 < px(.5)) continue;
        const a = { x: (l.cx + l.ux * l.t0) / res, y: (l.cy + l.uy * l.t0) / res }, b = { x: (l.cx + l.ux * l.t1) / res, y: (l.cy + l.uy * l.t1) / res };
        if (Math.hypot(b.x - a.x, b.y - a.y) * options.scale < .05) continue;
        out.push({ a, b, thickness, gaps: l.gaps.filter(([f, t]) => t - f > 1).map(([f, t]) => {
            const mx = l.cx + l.ux * (f + t) / 2, my = l.cy + l.uy * (f + t) / 2, known = marked.find(m => Math.hypot(m.x - mx, m.y - my) < 3);
            return { from: (f - l.t0) / res, to: (t - l.t0) / res, ...(known ? { kind: known.kind } : {}) };
        }) });
    }
    log(`${out.length} murs`);
    return out;
}
