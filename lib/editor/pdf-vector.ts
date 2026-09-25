// Extraction vectorielle d'un plan PDF : on lit les chemins et le texte du fichier
// plutôt qu'une image rendue. Le module est pur — il reçoit la liste d'opérateurs et
// le contenu texte de pdfjs, jamais un canvas — pour rester testable hors navigateur.
import { type Point, type Project, type Wall, type Opening } from './model';
import { pointAt, sweep, wallLength } from './arc';
import { faceEnds, junctions, straightOutline } from './joints';
import { distanceTo, makeGrid, paintPolygon, paintRing, traceWalls, type Edge, type Grid } from './wall-trace';

// `fill` : arête d'un aplat et non d'un trait. Beaucoup de logiciels (ArchiCAD, Revit)
// dessinent les murs en poché — un polygone rempli — sans trait de contour.
// `path` : numéro du chemin d'origine — les deux faces d'un mur en poché sont deux arêtes du même aplat.
// `closure` : trait de fermeture d'un passage (porte entre deux bouts de mur), avec l'épaisseur du mur d'origine
// `chroma` : saturation de la couleur (0 = gris) — un mur est dessiné en gris, un symbole ou un réseau en couleur
export type Stroke = { x0: number; y0: number; x1: number; y1: number; gray: number; width: number; curved: boolean; fill?: boolean; path?: number; closure?: number; chroma?: number };
export type TextItem = { text: string; x: number; y: number; size: number; angle: number; width?: number };
export type PageVectors = { width: number; height: number; strokes: Stroke[]; texts: TextItem[] };
export type Matrix = [number, number, number, number, number, number];

// Opérateurs pdfjs utilisés. Repris de OPS/DrawOPS (pdfjs-dist 6.x) pour ne pas
// dépendre du module au moment du test.
const OP = { setLineWidth: 2, setGState: 9, save: 10, restore: 11, transform: 12, stroke: 20, closeStroke: 21, fill: 22, eoFill: 23, fillStroke: 24, eoFillStroke: 25, closeFillStroke: 26, closeEOFillStroke: 27, setStrokeRGBColor: 58, setFillRGBColor: 59, paintFormXObjectBegin: 74, paintFormXObjectEnd: 75, constructPath: 91 };
const DRAW = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 };

const mul = (a: Matrix, b: Matrix): Matrix => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
const apply = (m: Matrix, x: number, y: number): Point => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
const scaleOf = (m: Matrix) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
const chromaOf = (c: unknown) => { if (typeof c !== 'string' || !/^#[0-9a-f]{6}$/i.test(c)) return 0; const v = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255); return Math.max(...v) - Math.min(...v); };
const luma = (c: unknown) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? (parseInt(c.slice(1, 3), 16) * .299 + parseInt(c.slice(3, 5), 16) * .587 + parseInt(c.slice(5, 7), 16) * .114) / 255 : 1;
export const spanOf = (s: Stroke) => Math.hypot(s.x1 - s.x0, s.y1 - s.y0);

/** Déroule la liste d'opérateurs en segments, dans le repère écran du viewport. */
export function strokesFrom(fnArray: ArrayLike<number>, argsArray: ArrayLike<unknown[]>, viewport: Matrix): Stroke[] {
    type State = { ctm: Matrix; lineWidth: number; color: string; fillColor: string };
    let state: State = { ctm: viewport, lineWidth: 1, color: '#000000', fillColor: '#000000' };
    const stack: State[] = [], strokes: Stroke[] = [];
    let pathId = 0;
    const emit = (points: Point[], close: boolean, curved: boolean[], s: State, fill = false) => {
        const gray = luma(fill ? s.fillColor : s.color), chroma = chromaOf(fill ? s.fillColor : s.color), width = fill ? 0 : s.lineWidth * scaleOf(s.ctm);
        for (let i = 0; i < points.length - 1; i++)
            strokes.push({ x0: points[i].x, y0: points[i].y, x1: points[i + 1].x, y1: points[i + 1].y, gray, width, curved: curved[i + 1], fill, path: pathId, ...(chroma > .2 ? { chroma } : {}) });
        if ((close || fill) && points.length > 2)   // un aplat est toujours fermé
            strokes.push({ x0: points[points.length - 1].x, y0: points[points.length - 1].y, x1: points[0].x, y1: points[0].y, gray, width, curved: false, fill, path: pathId, ...(chroma > .2 ? { chroma } : {}) });
    };
    for (let i = 0; i < fnArray.length; i++) {
        const fn = fnArray[i], args = argsArray[i] ?? [];
        if (fn === OP.save) stack.push({ ...state });
        else if (fn === OP.restore) state = stack.pop() ?? state;
        else if (fn === OP.transform) state.ctm = mul(state.ctm, args as unknown as Matrix);
        else if (fn === OP.setLineWidth) state.lineWidth = args[0] as number;
        else if (fn === OP.setStrokeRGBColor) state.color = args[0] as string;
        else if (fn === OP.setFillRGBColor) state.fillColor = args[0] as string;
        else if (fn === OP.setGState) for (const [key, value] of (args[0] as [string, unknown][] | undefined) ?? []) {
            if (key === 'LW') state.lineWidth = value as number;
            if (key === 'StrokeRGB') state.color = value as string;
        }
        else if (fn === OP.paintFormXObjectBegin) { stack.push({ ...state }); state.ctm = mul(state.ctm, args[0] as Matrix); }
        else if (fn === OP.paintFormXObjectEnd) state = stack.pop() ?? state;
        else if (fn === OP.constructPath) {
            const paint = args[0] as number, path = (args[1] as unknown[])[0] as ArrayLike<number> | undefined;
            if (!path) continue;
            const painted = paint === OP.stroke || paint === OP.closeStroke || paint === OP.fillStroke || paint === OP.eoFillStroke || paint === OP.closeFillStroke || paint === OP.closeEOFillStroke;
            const filled = paint === OP.fill || paint === OP.eoFill;
            const before = strokes.length;
            pathId++;
            let points: Point[] = [], curved: boolean[] = [], close = false;
            for (let k = 0; k < path.length;) {
                const op = path[k++];
                if (op === DRAW.moveTo) {
                    if (points.length > 1) emit(points, close, curved, state, filled);
                    points = [apply(state.ctm, path[k++], path[k++])]; curved = [false]; close = false;
                } else if (op === DRAW.lineTo) { points.push(apply(state.ctm, path[k++], path[k++])); curved.push(false); }
                else if (op === DRAW.curveTo || op === DRAW.quadraticCurveTo) {
                    // on suit la courbe elle-même, pas ses points de contrôle : un mur courbe doit
                    // garder sa forme, en tronçons d'une dizaine de points
                    const p0 = points[points.length - 1], cubic = op === DRAW.curveTo;
                    const c = Array.from({ length: cubic ? 3 : 2 }, () => apply(state.ctm, path[k++], path[k++]));
                    if (!p0) { points.push(c[c.length - 1]); curved.push(true); continue; }
                    // découpe par pas d'angle (6°), pas par longueur : les deux faces concentriques
                    // d'un mur courbe reçoivent alors le même nombre de tronçons, deux à deux parallèles
                    const last = c[c.length - 1], before = c.length > 1 ? c[c.length - 2] : p0;
                    let turn = Math.atan2(last.y - before.y, last.x - before.x) - Math.atan2(c[0].y - p0.y, c[0].x - p0.x);
                    turn = Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)));
                    const steps = Math.max(2, Math.min(24, Math.ceil(turn / (6 * Math.PI / 180))));
                    for (let i = 1; i <= steps; i++) {
                        const t = i / steps, u = 1 - t;
                        const q = cubic
                            ? { x: u * u * u * p0.x + 3 * u * u * t * c[0].x + 3 * u * t * t * c[1].x + t * t * t * c[2].x, y: u * u * u * p0.y + 3 * u * u * t * c[0].y + 3 * u * t * t * c[1].y + t * t * t * c[2].y }
                            : { x: u * u * p0.x + 2 * u * t * c[0].x + t * t * c[1].x, y: u * u * p0.y + 2 * u * t * c[0].y + t * t * c[1].y };
                        points.push(q); curved.push(true);
                    }
                }
                else if (op === DRAW.closePath) close = true;
                else break;
            }
            if (points.length > 1) emit(points, close, curved, state, filled);
            if (!painted && !filled) strokes.length = before;   // chemin de découpe
            // rempli ET tracé : c'est aussi un aplat, de la couleur de son remplissage (les
            // murs du premier PDF sont des polygones gris cernés d'un filet de 0 pt)
            const both = paint === OP.fillStroke || paint === OP.eoFillStroke || paint === OP.closeFillStroke || paint === OP.closeEOFillStroke;
            if (both) {
                const drawn = strokes.slice(before), gray = luma(state.fillColor), chroma = chromaOf(state.fillColor);
                for (const e of drawn) { const { chroma: _, ...edge } = e; void _; strokes.push({ ...edge, fill: true, gray, width: 0, ...(chroma > .2 ? { chroma } : {}) }); }
            }
        }
    }
    return strokes;
}

/** Texte de la page, redressé et positionné dans le repère écran. */
export function textsFrom(items: { str: string; transform: number[]; height: number; width?: number }[], viewport: Matrix): TextItem[] {
    const out: TextItem[] = [];
    for (const item of items) {
        const text = item.str.trim();
        if (!text) continue;
        const t = item.transform as unknown as Matrix;
        const p = apply(viewport, t[4], t[5]);
        out.push({ text, x: p.x, y: p.y, size: item.height || Math.hypot(t[1], t[3]), angle: Math.atan2(t[1], t[0]) * 180 / Math.PI, width: item.width });
    }
    return out;
}

const decimal = (s: string) => Number(s.replace(',', '.'));

/** Texte d'un item suivi de ce qui est écrit à sa droite sur la même ligne : le
 *  cartouche sépare souvent le libellé (« Echelle : 1 / ») de sa valeur (« 80 »). */
function sameLine(texts: TextItem[], anchor: TextItem) {
    return [anchor, ...texts.filter(t => t !== anchor && t.x > anchor.x && Math.abs(t.y - anchor.y) < anchor.size * .8).sort((a, b) => a.x - b.x)].map(t => t.text).join(' ');
}

/** Ce qui est écrit juste sous un libellé : les cartouches en colonnes posent la
 *  valeur (« 1:50 ») sous son intitulé (« Echelle : »). */
function below(texts: TextItem[], anchor: TextItem) {
    return texts.filter(t => t !== anchor && t.y > anchor.y && t.y - anchor.y < anchor.size * 6 && Math.abs(t.x - anchor.x) < anchor.size * 4)
        .sort((a, b) => a.y - b.y).slice(0, 2).map(t => t.text).join(' ');
}

/** Échelle imprimée au cartouche (« Echelle : 1/80 », « Echelle : » au-dessus de « 1:50 »)
 *  → mètres par point PDF. */
export function printedScale(texts: TextItem[]): number | null {
    for (const t of texts) {
        if (!/[ée]chelle/i.test(t.text)) continue;
        for (const around of [sameLine(texts, t), below(texts, t)]) {
            const m = /(?:^|[^\d])1\s*[/:]\s*(\d{2,4})\b|(?:^|[^\d])1\s+(\d{2,4})\b/.exec(around.replace(/[ée]chelle/i, ''));
            const ratio = m ? Number(m[1] ?? m[2]) : NaN;
            if (ratio >= 10 && ratio <= 5000) return ratio * 25.4 / 72 / 1000;
        }
    }
    return null;
}

/** Repli quand le cartouche est muet : l'échelle se déduit des surfaces imprimées.
 *  Chaque pièce dont l'étiquette tombe dans une face donne un candidat ; on prend
 *  la médiane, ce qui absorbe les étiquettes posées hors de leur pièce. */
export function scaleFromAreas(faces: Face[], rooms: PrintedRoom[]): number | null {
    const candidates: number[] = [];
    for (const r of rooms) {
        const holding = faces.filter(f => contains(f.ring, r)).sort((a, b) => a.area - b.area);
        if (holding.length && holding[0].area > 0) candidates.push(Math.sqrt(r.area / holding[0].area));
    }
    if (candidates.length < 2) return null;
    candidates.sort((a, b) => a - b);
    const median = candidates[candidates.length >> 1];
    // on n'accepte que si les candidats s'accordent : sinon l'appariement est faux
    const agree = candidates.filter(c => Math.abs(c / median - 1) < .02).length;
    return agree >= Math.max(2, Math.ceil(candidates.length / 2)) ? median : null;
}

/** Hauteur sous plafond imprimée (« Hsp 2.73m »). */
export function printedCeiling(texts: TextItem[]): number | null {
    const found = texts.map(t => /^hsp\s*:?\s*([\d.,]+)\s*m/i.exec(t.text.trim())).filter(m => m !== null)
        .map(m => decimal(m![1])).filter(h => h > 1.5 && h < 6).sort((a, b) => a - b);
    return found.length ? found[found.length >> 1] : null;   // médiane : une valeur par pièce
}

export type PrintedRoom = { name: string; area: number; x: number; y: number };
/** Couples « nom / surface » imprimés : à la fois les pièces et la vérité terrain. */
export function printedRooms(texts: TextItem[]): PrintedRoom[] {
    const rooms: PrintedRoom[] = [];
    for (const t of texts) {
        const m = /^([\d.,]+)\s*m[²2]$/i.exec(t.text) ?? /^(?:surface|surf\.?)\s*:?\s*([\d.,]+)\s*m[²2]?$/i.exec(t.text);
        if (!m) continue;
        const area = decimal(m[1]);
        if (!(area > 0 && area < 500)) continue;
        // le nom est l'étiquette la plus proche au-dessus, de taille comparable
        let best: TextItem | null = null, bestScore = Infinity;
        for (const c of texts) {
            // un nom peut porter un chiffre (« Chambre 2 ») ; une cote, une surface ou une
            // annotation de baie, non
            if (c === t || c.text.length > 30 || !/[a-zà-ÿ]{2}/i.test(c.text) || /^(surface|surf\.|hsp|all\b|la\s*:|ha\s*:|l\s*\d|porte|fen[êe]tre)/i.test(c.text)) continue;
            if (Math.abs(c.size - t.size) > t.size * .8) continue;
            const dx = Math.abs(c.x - t.x), dy = t.y - c.y;
            if (dy < -t.size || dy > t.size * 3 || dx > t.size * 6) continue;
            const score = dy + dx * .5;
            if (score < bestScore) { bestScore = score; best = c; }
        }
        // point d'ancrage : le centre du texte de surface, qui est dans la pièce — son coin
        // peut mordre sur un trait voisin
        rooms.push({ name: best?.text ?? `Pièce ${rooms.length + 1}`, area, x: t.x + (t.width ?? 0) / 2, y: t.y - t.size / 2 });
    }
    return rooms;
}

export type Face = { ring: Point[]; area: number };
/** Arrangement planaire des segments : découpe aux intersections puis faces minimales. */
export function facesFrom(strokes: Stroke[], tolerance = 1.2, reach = 4): Face[] {
    // `reach` prolonge un trait jusqu'au premier croisement voisin : c'est ce qui ferme
    // les jonctions en T laissées ouvertes par le dessinateur. Le soudage des sommets
    // (`tolerance`) reste petit, sinon les deux faces d'une cloison fine fusionnent.
    const parts = strokes.map(s => ({ ...s, cuts: [0, 1], before: 0, after: 1 }));
    const at = (s: Stroke, t: number): Point => ({ x: s.x0 + (s.x1 - s.x0) * t, y: s.y0 + (s.y1 - s.y0) * t });
    for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i], b = parts[j];
        const ax = a.x1 - a.x0, ay = a.y1 - a.y0, bx = b.x1 - b.x0, by = b.y1 - b.y0;
        const det = ax * by - ay * bx;
        if (Math.abs(det) < 1e-9) continue;
        const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
        const t = ((b.x0 - a.x0) * by - (b.y0 - a.y0) * bx) / det, u = ((b.x0 - a.x0) * ay - (b.y0 - a.y0) * ax) / det;
        if (t < -reach / la || t > 1 + reach / la || u < -reach / lb || u > 1 + reach / lb) continue;
        for (const [seg, value, span] of [[a, t, la], [b, u, lb]] as const) {
            if (value > tolerance / span && value < 1 - tolerance / span) seg.cuts.push(value);
            else if (value < 0) seg.before = Math.max(seg.before, value);
            else if (value > 1) seg.after = Math.min(seg.after, value);
        }
    }
    const vertices: Point[] = [];
    const vertexOf = (p: Point) => {
        for (let i = 0; i < vertices.length; i++) if (Math.abs(vertices[i].x - p.x) < tolerance && Math.abs(vertices[i].y - p.y) < tolerance) return i;
        vertices.push(p); return vertices.length - 1;
    };
    const edges = new Set<string>();
    for (const s of parts) {
        const cuts = [...new Set([...s.cuts, s.before, s.after])].sort((p, q) => p - q);
        for (let k = 0; k < cuts.length - 1; k++) {
            const p = vertexOf(at(s, cuts[k])), q = vertexOf(at(s, cuts[k + 1]));
            if (p !== q) edges.add(p < q ? `${p},${q}` : `${q},${p}`);
        }
    }
    const neighbours: number[][] = vertices.map(() => []);
    for (const e of edges) { const [p, q] = e.split(',').map(Number); neighbours[p].push(q); neighbours[q].push(p); }
    const angle = (p: number, q: number) => Math.atan2(vertices[q].y - vertices[p].y, vertices[q].x - vertices[p].x);
    for (let v = 0; v < vertices.length; v++) neighbours[v].sort((a, b) => angle(v, a) - angle(v, b));
    const seen = new Set<string>(), faces: Face[] = [];
    for (const e of edges) { const pair = e.split(',').map(Number);
        for (const [from, to] of [[pair[0], pair[1]], [pair[1], pair[0]]]) {
            if (seen.has(`${from}>${to}`)) continue;
            const ring: number[] = []; let a = from, b = to;
            for (let guard = 0; guard < 5000; guard++) {
                seen.add(`${a}>${b}`); ring.push(a);
                const list = neighbours[b], c = list[(list.indexOf(a) - 1 + list.length) % list.length];
                a = b; b = c;
                if (a === from && b === to) break;
            }
            if (ring.length < 3) continue;
            let twice = 0;
            for (let k = 0; k < ring.length; k++) { const p = vertices[ring[k]], q = vertices[ring[(k + 1) % ring.length]]; twice += p.x * q.y - q.x * p.y; }
            // sens positif : face intérieure. Le sens négatif est le contour extérieur d'un
            // groupe de traits (ou le bord d'un trou) — pas une pièce
            if (twice > 0) faces.push({ ring: ring.map(i => vertices[i]), area: twice / 2 });
        }
    }
    return faces;
}

export function contains(ring: Point[], p: Point) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
        if ((ring[i].y > p.y) !== (ring[j].y > p.y) && p.x < (ring[j].x - ring[i].x) * (p.y - ring[i].y) / (ring[j].y - ring[i].y) + ring[i].x) inside = !inside;
    return inside;
}

export type Band = { a: Point; b: Point; thickness: number; faces: [Stroke, Stroke] };

const dot = (px: number, py: number, qx: number, qy: number) => px * qx + py * qy;
/** Projection d'un segment sur un axe unitaire, en abscisse curviligne. */
function project(s: Stroke, ox: number, oy: number, ux: number, uy: number) {
    const t0 = dot(s.x0 - ox, s.y0 - oy, ux, uy), t1 = dot(s.x1 - ox, s.y1 - oy, ux, uy);
    return t0 <= t1 ? [t0, t1] : [t1, t0];
}

/** Murs par appariement de traits parallèles : un mur se dessine par ses deux faces.
 *  Un meuble ou un placard n'a pas de partenaire à la bonne distance — c'est ce qui
 *  le rejette, et non la reconnaissance de son symbole. */
export function bandsFrom(strokes: Stroke[], { minThickness = 1.2, maxThickness = 20, minOverlap = 8, maxLoose = Infinity } = {}): Band[] {
    // les arêtes d'un aplat peuvent être courtes (un mur courbe est une suite de petits
    // segments) : c'est l'appartenance au même polygone qui fait preuve, pas la longueur
    const list = strokes.filter(s => (s.fill || !s.curved) && spanOf(s) >= (s.fill ? 2 : minOverlap));
    type Pair = { i: number; j: number; overlap: number; thickness: number; from: number; to: number; same: boolean };
    const pairs: Pair[] = [];
    for (let i = 0; i < list.length; i++) {
        const a = list[i], la = spanOf(a), ux = (a.x1 - a.x0) / la, uy = (a.y1 - a.y0) / la;
        for (let j = i + 1; j < list.length; j++) {
            const b = list[j], lb = spanOf(b);
            const cross = Math.abs((a.x1 - a.x0) * (b.y1 - b.y0) - (a.y1 - a.y0) * (b.x1 - b.x0)) / (la * lb);
            // ~2° ; ~8° entre deux côtés d'un même aplat — les deux faces d'un mur courbe n'ont
            // pas toujours le même nombre de sommets, leurs segments se décalent un peu
            const sameShape = !!a.fill && a.fill === b.fill && a.path === b.path;
            if (cross > (sameShape ? .14 : .035)) continue;
            const thickness = Math.abs(-uy * (b.x0 - a.x0) + ux * (b.y0 - a.y0));
            const drift = Math.abs(-uy * (b.x1 - a.x0) + ux * (b.y1 - a.y0));
            if (thickness < minThickness || thickness > maxThickness || Math.abs(drift - thickness) > (sameShape ? 2 : 1)) continue;
            const [pa, qa] = project(a, a.x0, a.y0, ux, uy), [pb, qb] = project(b, a.x0, a.y0, ux, uy);
            const from = Math.max(pa, pb), to = Math.min(qa, qb), overlap = to - from;
            const same = !!a.fill && a.fill === b.fill && a.path === b.path;
            if (overlap < (same ? 1.5 : minOverlap) || overlap < .5 * Math.min(la, lb)) continue;
            // un mur épais est dessiné en aplat plein (ou en aplats juxtaposés : ArchiCAD découpe
            // les angles en triangles) ; au-delà de `maxLoose`, un simple trait apparié à cette
            // distance est un meuble ou une porte, pas la seconde face d'un mur
            if (!(a.fill && b.fill) && (thickness + drift) / 2 > maxLoose) continue;
            pairs.push({ i, j, overlap, thickness: (thickness + drift) / 2, from, to, same });
        }
    }
    // deux arêtes d'un même aplat sont les deux faces d'un même mur : on les apparie avant
    // toute autre combinaison, sinon un trait voisin (plinthe, parquet) vole une des faces
    pairs.sort((p, q) => Number(q.same) - Number(p.same) || q.overlap - p.overlap || p.thickness - q.thickness);
    // un long trait peut être la face de plusieurs murs (une cloison qui en prolonge une autre) :
    // chaque trait sert une fois par portion de sa longueur
    const taken = new Map<number, [number, number][]>(), bands: Band[] = [];
    const along = (k: number, p: Point) => { const s = list[k], L = spanOf(s); return ((p.x - s.x0) * (s.x1 - s.x0) + (p.y - s.y0) * (s.y1 - s.y0)) / L; };
    const free = (k: number, u: number, v: number) => (taken.get(k) ?? []).every(([f, t]) => Math.min(t, Math.max(u, v)) - Math.max(f, Math.min(u, v)) <= 1);
    for (const p of pairs) {
        const a = list[p.i], b = list[p.j], la = spanOf(a), ux = (a.x1 - a.x0) / la, uy = (a.y1 - a.y0) / la;
        const e0 = { x: a.x0 + ux * p.from, y: a.y0 + uy * p.from }, e1 = { x: a.x0 + ux * p.to, y: a.y0 + uy * p.to };
        const ia = [along(p.i, e0), along(p.i, e1)] as [number, number], ib = [along(p.j, e0), along(p.j, e1)] as [number, number];
        if (!free(p.i, ...ia) || !free(p.j, ...ib)) continue;
        taken.set(p.i, [...(taken.get(p.i) ?? []), [Math.min(...ia), Math.max(...ia)]]);
        taken.set(p.j, [...(taken.get(p.j) ?? []), [Math.min(...ib), Math.max(...ib)]]);
        const mid = (t: number): Point => ({ x: (a.x0 + ux * t + b.x0 + ux * (t - dot(b.x0 - a.x0, b.y0 - a.y0, ux, uy))) / 2, y: (a.y0 + uy * t + b.y0 + uy * (t - dot(b.x0 - a.x0, b.y0 - a.y0, ux, uy))) / 2 });
        bands.push({ a: mid(p.from), b: mid(p.to), thickness: p.thickness, faces: [a, b] });
    }
    return bands;
}

// angle : mur courbe (voir arc.ts), issu du regroupement d'une chaîne de facettes
export type PlanWall = { a: Point; b: Point; thickness: number; gaps: { from: number; to: number; kind?: 'door' | 'window' }[]; angle?: number };

export type Annotation = { width: number | null; sill: number | null; height?: number; kind?: 'door' | 'window'; x: number; y: number };
const metres = (v: number) => v > 10 ? v / 100 : v;   // « 73 par 211 » est en centimètres, « La: 0.78 » en mètres
/** Annotations de baie posées près des ouvertures : « La: 0.78 » (largeur), « Ha: 0.00 »
 *  (allège), « PORTE » + « 73 par 211 », « Fenêtre » + « All : 27 » + « L115 x H208 ». */
export function annotations(texts: TextItem[]): Annotation[] {
    const out: Annotation[] = [];
    const near = (t: TextItem, re: RegExp) => texts.filter(c => c !== t && re.test(c.text) && Math.hypot(c.x - t.x, c.y - t.y) < t.size * 4)
        .sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y))[0];
    for (const t of texts) {
        const text = t.text.replace(/\s+/g, ' ').trim();
        let m = /^(La|Ha)\s*:?\s*([\d.,]+)$/i.exec(text);
        if (m) {
            const value = decimal(m[2]);
            if (!Number.isFinite(value) || value > 10) continue;
            out.push(m[1].toLowerCase() === 'la' ? { width: value, sill: null, x: t.x, y: t.y } : { width: null, sill: value, x: t.x, y: t.y });
            continue;
        }
        m = /^(\d{2,3}(?:[.,]\d+)?)\s*(?:par|x|×)\s*(\d{2,3}(?:[.,]\d+)?)$/i.exec(text);
        if (m && near(t, /^porte/i)) { out.push({ width: metres(decimal(m[1])), height: metres(decimal(m[2])), sill: 0, kind: 'door', x: t.x, y: t.y }); continue; }
        m = /^L\s*(\d{2,3}(?:[.,]\d+)?)\s*[x×]\s*H\s*(\d{2,3}(?:[.,]\d+)?)$/i.exec(text);
        if (m) {
            const all = near(t, /^all(?:[èe]ge)?\s*:?\s*\d/i);
            const sill = all ? metres(decimal(/(\d+(?:[.,]\d+)?)/.exec(all.text)![1])) : null;
            out.push({ width: metres(decimal(m[1])), height: metres(decimal(m[2])), sill, kind: 'window', x: t.x, y: t.y });
        }
    }
    return out;
}

// `stated` : le plan écrit lui-même s'il s'agit d'une porte ou d'une fenêtre
export type Bay = { wall: PlanWall; centre: number; width: number; kind: 'door' | 'window'; sill: number | null; height?: number; stated: boolean };

/** Traits courts en travers d'un mur : les tableaux d'une baie. */
export function revealMarks(wall: PlanWall, strokes: Stroke[]): number[] {
    const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
    if (!len) return [];
    const ux = (wall.b.x - wall.a.x) / len, uy = (wall.b.y - wall.a.y) / len, t = wall.thickness;
    const marks: number[] = [];
    for (const s of strokes) {
        if (s.curved) continue;
        const span = spanOf(s);
        if (span < t * .55 || span > t * 1.8) continue;
        if (Math.abs(dot(s.x1 - s.x0, s.y1 - s.y0, ux, uy)) / span > .26) continue;   // ~15° de la perpendiculaire
        const mx = (s.x0 + s.x1) / 2 - wall.a.x, my = (s.y0 + s.y1) / 2 - wall.a.y;
        if (Math.abs(-uy * mx + ux * my) > t * .6) continue;
        const along = dot(mx, my, ux, uy);
        if (along < -1 || along > len + 1) continue;
        if (!marks.some(m => Math.abs(m - along) < t)) marks.push(along);
    }
    return marks.sort((a, b) => a - b);
}

/** Baies. L'architecte écrit la largeur (« La: 0.78 ») et l'allège (« Ha: 0.00 ») à
 *  côté de chaque baie : l'annotation désigne le mur et la position, les tableaux
 *  affinent le centre quand on les retrouve. */
export function baysFrom(walls: PlanWall[], strokes: Stroke[], notes: Annotation[], metresPerPoint: number): Bay[] {
    const bays: Bay[] = [];
    const sills = notes.filter(n => n.sill !== null);
    for (const note of notes) {
        if (note.width === null) continue;
        let best: { wall: PlanWall; along: number; distance: number; len: number } | null = null;
        for (const wall of walls) {
            const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
            if (!len) continue;
            const ux = (wall.b.x - wall.a.x) / len, uy = (wall.b.y - wall.a.y) / len;
            const dx = note.x - wall.a.x, dy = note.y - wall.a.y;
            const along = Math.max(0, Math.min(len, dot(dx, dy, ux, uy)));
            const distance = Math.hypot(dx - ux * along, dy - uy * along);
            if (distance > wall.thickness / 2 + 14 || note.width / metresPerPoint > len) continue;
            if (!best || distance < best.distance) best = { wall, along, distance, len };
        }
        if (!best) continue;
        const span = note.width / metresPerPoint;
        const marks = revealMarks(best.wall, strokes);
        let centre = Math.max(span / 2, Math.min(best.len - span / 2, best.along));
        for (let i = 0; i < marks.length - 1; i++) for (let j = i + 1; j < marks.length; j++) {
            if (Math.abs(marks[j] - marks[i] - span) > Math.max(2, span * .15)) continue;
            const middle = (marks[i] + marks[j]) / 2;
            if (Math.abs(middle - best.along) < Math.abs(centre - best.along)) centre = middle;
        }
        const ux = (best.wall.b.x - best.wall.a.x) / best.len, uy = (best.wall.b.y - best.wall.a.y) / best.len;
        const cx = best.wall.a.x + ux * centre, cy = best.wall.a.y + uy * centre;
        const closest = sills.filter(n => n.width === null).map(n => ({ n, d: Math.hypot(n.x - cx, n.y - cy) })).sort((a, b) => a.d - b.d)[0];
        const sill = note.sill ?? (closest && closest.d < Math.max(40, span * 1.5) ? closest.n.sill : null);
        const arc = strokes.some(s => s.curved && Math.hypot((s.x0 + s.x1) / 2 - cx, (s.y0 + s.y1) / 2 - cy) < span * 1.6);
        bays.push({ wall: best.wall, centre, width: note.width, kind: note.kind ?? (arc || sill === 0 ? 'door' : 'window'), sill, height: note.height, stated: note.kind !== undefined });
    }
    return bays;
}

// `zone` : pièce sans cloison propre (séjour + chambre d'un même volume) ; `computed` est
// alors la surface du volume entier, à comparer à la somme des zones qu'il réunit.
/** Traits qui dessinent des murs. Un mur se dessine en coupe : aplat grisé, ou contour
 *  sombre de plume forte. Le mobilier, les équipements, les cotes et les calepinages sont en
 *  plume fine ou en gris — c'est ce qui les écarte (baignoire, plan de travail : aplat blanc
 *  cerné de gris 0,5). S'y ajoutent les cloisons légères reconnues à leur forme. */
export function structuralStrokes(page: PageVectors, pen = .5, options: { black?: boolean } = {}): Stroke[] {
    const frame = Math.min(page.width, page.height) * .34;   // cadre
    const banner = Math.max(page.width, page.height) * .7;     // filets du cartouche, qui barrent la page
    // une courbe en aplat est un mur courbe ; une courbe au trait, le battement d'une porte
    const solid = page.strokes.filter(s => !s.chroma && (s.fill || !s.curved) && spanOf(s) > 4 && spanOf(s) < banner && !(Math.abs(s.x1 - s.x0) > frame && Math.abs(s.y1 - s.y0) > frame)
        && (s.fill ? s.gray < .7 : s.gray < .4 && s.width >= pen || (options.black ?? true) && s.gray < .05));
    // (échelle d'essai 1/50 si le cartouche est muet : la forme d'une cloison tolère l'écart)
    const metres = printedScale(page.texts) ?? 25.4 / 72 / 1000 * 50;
    return [...solid, ...paleWalls(page.strokes, metres), ...thinPartitions(page.strokes, solid, metres)];
}

/** Aplats gris clair : un même gris sert aux murs (ici le mur courbe de l'entrée) et aux
 *  cimaises ou plinthes. Seule l'épaisseur les sépare — quelques centimètres pour une moulure,
 *  une quinzaine au moins pour un mur. L'épaisseur d'une bande se lit sans connaître sa forme,
 *  droite ou courbe : aire ÷ demi-périmètre. */
export function paleWalls(strokes: Stroke[], metresPerPoint: number, { min = .07, max = .6 } = {}): Stroke[] {
    const byPath = new Map<number, Stroke[]>();
    for (const s of strokes) if (s.fill && !s.chroma && s.gray >= .7 && s.gray < .95 && s.path !== undefined) byPath.set(s.path, [...(byPath.get(s.path) ?? []), s]);
    const kept: Stroke[] = [];
    for (const edges of byPath.values()) {
        const twice = Math.abs(edges.reduce((n, e) => n + e.x0 * e.y1 - e.x1 * e.y0, 0));
        const half = edges.reduce((n, e) => n + spanOf(e), 0) / 2;
        const thickness = half ? twice / 2 / half * metresPerPoint : 0;
        // (sans condition de longueur : une gaine ou un poteau de 20 cm ferme un angle de mur)
        if (thickness >= min && thickness <= max) kept.push(...edges.filter(e => spanOf(e) > 1));
    }
    return kept;
}

/** Cloisons légères dessinées en aplat blanc, comme le mobilier : on les reconnaît à leur
 *  forme — un rectangle long et mince (5 à 22 cm) — et à ce qu'un de leurs bouts bute contre
 *  un mur. Un radiateur ou un meuble longe le mur sans s'y raccrocher par l'extrémité. */
export function thinPartitions(strokes: Stroke[], walls: Stroke[], metresPerPoint: number): Stroke[] {
    const byPath = new Map<number, Stroke[]>();
    for (const s of strokes) if (s.fill && s.gray >= .7 && s.path !== undefined && spanOf(s) > .5) byPath.set(s.path, [...(byPath.get(s.path) ?? []), s]);
    const near = (p: Point, reach: number, self: Stroke[]) => anchors.some(w => {
        if (self.includes(w)) return false;
        const L = spanOf(w), ux = (w.x1 - w.x0) / L, uy = (w.y1 - w.y0) / L;
        const t = Math.max(0, Math.min(L, (p.x - w.x0) * ux + (p.y - w.y0) * uy));
        return Math.hypot(p.x - w.x0 - ux * t, p.y - w.y0 - uy * t) < reach;
    });
    // de proche en proche : une cloison qui bute contre une cloison déjà reconnue compte aussi
    // (les cloisons d'un WC ne touchent souvent que d'autres cloisons)
    const kept: Stroke[] = [];
    const candidates = [...byPath.values()];
    const tips = strokes.filter(s => s.curved && !s.fill).flatMap(s => [{ x: s.x0, y: s.y0 }, { x: s.x1, y: s.y1 }]);
    let grew = true;
    const anchors = walls.slice();
    while (grew) {
        grew = false;
        for (let c = candidates.length - 1; c >= 0; c--) {
            const edges = candidates[c];
            if (accept(edges)) { kept.push(...edges); anchors.push(...edges); candidates.splice(c, 1); grew = true; }
        }
    }
    return kept;

    function accept(edges: Stroke[]) {
        if (edges.length !== 4) return false;
        const lengths = edges.map(spanOf);
        const [a, b, c, d] = lengths;
        if (Math.abs(a - c) > Math.max(1, a * .08) || Math.abs(b - d) > Math.max(1, b * .08)) return false;   // pas un rectangle
        const short = Math.min(a, b) * metresPerPoint, long = Math.max(a, b) * metresPerPoint;
        if (short < .04 || short > .22 || long < .4) return false;
        const ends = edges.filter(e => Math.abs(spanOf(e) - Math.min(a, b)) < 1);
        const reach = .06 / metresPerPoint;
        // un vantail de porte a la même forme : on le reconnaît à l'arc de son battement, qui part
        // de son extrémité
        if (long <= 1.1 && ends.some(e => tips.some(t => Math.hypot(t.x - (e.x0 + e.x1) / 2, t.y - (e.y0 + e.y1) / 2) < reach))) return false;
        return ends.some(e => near({ x: (e.x0 + e.x1) / 2, y: (e.y0 + e.y1) / 2 }, reach, edges));
    }
}

/** Zones de pièces. Certains logiciels (ArchiCAD) posent sous chaque pièce un aplat blanc dont
 *  l'aire est exactement la surface imprimée : c'est le contour de la pièce au centimètre, et
 *  l'espace entre deux zones est un mur, même quand il n'est dessiné que d'un filet clair. */
export function roomZones(strokes: Stroke[], rooms: PrintedRoom[], metresPerPoint: number): Stroke[][] {
    const byPath = new Map<number, Stroke[]>();
    for (const s of strokes) if (s.fill && s.gray >= .9 && s.path !== undefined) byPath.set(s.path, [...(byPath.get(s.path) ?? []), s]);
    const shapes = [...byPath.values()].filter(e => e.length >= 3).map(edges => ({ edges, area: Math.abs(edges.reduce((n, e) => n + e.x0 * e.y1 - e.x1 * e.y0, 0)) / 2 * metresPerPoint ** 2 }));
    const zones: Stroke[][] = [];
    for (const r of rooms) {
        let best: Stroke[] | null = null, err = .01;   // à 1 % de la surface imprimée
        for (const { edges, area } of shapes) {
            const e = Math.abs(area - r.area) / r.area;
            if (e <= err && holds(edges, r)) { best = edges; err = e; }
        }
        if (best && !zones.includes(best)) zones.push(best);
    }
    return zones;
}

/** Point dans un polygone donné par ses arêtes (règle pair-impair). */
function holds(edges: Stroke[], p: Point) {
    let inside = false;
    for (const e of edges) if ((e.y0 > p.y) !== (e.y1 > p.y) && p.x < (e.x1 - e.x0) * (p.y - e.y0) / (e.y1 - e.y0) + e.x0) inside = !inside;
    return inside;
}

/** Peint en mur l'espace pris en sandwich entre deux zones de pièces, puis une paroi le long des
 *  réduits clos — placard en biais, gaine — qu'aucune zone ne couvre : la pièce s'arrête à sa
 *  zone, il y a donc une paroi. Tailles en cases : `span`, largeur maximale d'un mur entre deux
 *  zones ; `front`, épaisseur de la paroi d'un réduit ; `depth` et `room`, profondeur et aire
 *  minimales d'un réduit (en deçà, c'est un interstice du dessin, pas un volume). */
export function paintBetweenZones(g: Grid, zones: Stroke[][], { span, front, depth, room }: { span: number; front: number; depth: number; room: number }) {
    const { W, H, res, data } = g;
    const label: Grid = { W, H, res, data: new Uint8Array(W * H) }, L = label.data;
    zones.forEach((z, k) => paintPolygon(label, z, k + 1));
    // distance aux deux zones les plus proches, et direction qui s'en éloigne (gradient)
    const best1 = new Float32Array(W * H).fill(Infinity), best2 = new Float32Array(W * H).fill(Infinity), lab1 = new Int16Array(W * H);
    const g1 = new Float32Array(W * H * 2), g2 = new Float32Array(W * H * 2);
    zones.forEach((z, k) => {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const e of z) { x0 = Math.min(x0, e.x0, e.x1); y0 = Math.min(y0, e.y0, e.y1); x1 = Math.max(x1, e.x0, e.x1); y1 = Math.max(y1, e.y0, e.y1); }
        const c0 = Math.max(0, Math.floor(x0 * res - span - 2)), r0 = Math.max(0, Math.floor(y0 * res - span - 2));
        const c1 = Math.min(W - 1, Math.ceil(x1 * res + span + 2)), r1 = Math.min(H - 1, Math.ceil(y1 * res + span + 2));
        const w = c1 - c0 + 1, h = r1 - r0 + 1;
        const d = distanceTo(w, h, i => L[(r0 + Math.floor(i / w)) * W + c0 + i % w] === k + 1);
        for (let r = 1; r < h - 1; r++) for (let c = 1; c < w - 1; c++) {
            const i = (r0 + r) * W + c0 + c, j = r * w + c, v = d[j];
            if (v > span || v >= best2[i]) continue;
            const gx = d[j + 1] - d[j - 1], gy = d[j + w] - d[j - w], n = Math.hypot(gx, gy) || 1;
            if (v < best1[i]) { best2[i] = best1[i]; g2[2 * i] = g1[2 * i]; g2[2 * i + 1] = g1[2 * i + 1]; best1[i] = v; lab1[i] = k + 1; g1[2 * i] = gx / n; g1[2 * i + 1] = gy / n; }
            else { best2[i] = v; g2[2 * i] = gx / n; g2[2 * i + 1] = gy / n; }
        }
    });
    // entre deux zones = les deux zones sont de part et d'autre (directions opposées), pas en
    // équerre de part et d'autre d'un coin
    for (let i = 0; i < W * H; i++)
        if (!L[i] && best1[i] + best2[i] <= span && g1[2 * i] * g2[2 * i] + g1[2 * i + 1] * g2[2 * i + 1] < -.9) data[i] = 1;
    // réduits clos : cases libres (ni zone ni mur) qu'on n'atteint pas depuis le bord de la page
    const seen = new Uint8Array(W * H), stack: number[] = [];
    const flood = (from: number[], mark: number, visit?: (i: number) => void) => {
        stack.push(...from);
        while (stack.length) {
            const i = stack.pop()!;
            if (seen[i] || data[i] || L[i]) continue;
            seen[i] = mark; visit?.(i);
            const x = i % W;
            if (x > 0) stack.push(i - 1); if (x < W - 1) stack.push(i + 1); if (i >= W) stack.push(i - W); if (i < W * (H - 1)) stack.push(i + W);
        }
    };
    const border: number[] = [];
    for (let x = 0; x < W; x++) border.push(x, (H - 1) * W + x);
    for (let y = 0; y < H; y++) border.push(y * W, y * W + W - 1);
    flood(border, 1);
    const inner = distanceTo(W, H, i => !!(seen[i] || data[i] || L[i]));
    for (let i = 0; i < W * H; i++) {
        if (seen[i] || data[i] || L[i]) continue;
        const cells: number[] = [];
        let deepest = 0;
        flood([i], 2, j => { cells.push(j); deepest = Math.max(deepest, inner[j]); });
        // petit réduit (gaine, interstice du dessin) : plein ; volume (placard) : une paroi le long
        // de la zone
        if (cells.length < room || deepest < depth) { for (const j of cells) data[j] = 1; continue; }
        for (const j of cells) if (best1[j] <= front) data[j] = 1;
    }
}

/** Contour de chaque mur, prolongé aux angles (voir joints.ts), en points. */
export function wallRings(walls: PlanWall[], metresPerPoint: number): Point[][] {
    const as = walls.map((w, i) => ({ id: String(i), name: '', a: w.a, b: w.b, ...(w.angle ? { angle: w.angle } : {}), thickness: w.thickness, height: 1, openings: [] }));
    const ext = faceEnds(as, .01 / metresPerPoint);
    return as.map(w => {
        const h = w.thickness / 2, L = wallLength(w);
        if (!L) return [];
        if (sweep(w)) {
            const n = Math.max(2, Math.ceil(Math.abs(sweep(w)) / (3 * Math.PI / 180)));
            const side = (k: number) => Array.from({ length: n + 1 }, (_, i) => { const at = pointAt(w, L * i / n); return { x: at.point.x - Math.sin(at.heading) * h * k, y: at.point.y + Math.cos(at.heading) * h * k }; });
            return [...side(1), ...side(-1).reverse()];
        }
        return straightOutline(w, ext.get(w.id)!);
    });
}

/** Pièces par remplissage sur la grille des murs : l'espace libre est rempli depuis chaque
 *  étiquette. Une case compte si son centre est libre — l'aire est celle de la pièce jusqu'aux
 *  faces des murs. */
export function floodRooms(g: Grid, seeds: Point[]) {
    const { W, H, res, data: grid } = g;
    const label = new Int32Array(W * H), areas: number[] = [0], open: boolean[] = [false], sums: { x: number; y: number }[] = [{ x: 0, y: 0 }];
    const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [{ x0: 0, y0: 0, x1: 0, y1: 0 }];
    const stack = new Int32Array(W * H);
    const region = (seed: Point) => {
        let sx = Math.floor(seed.x * res), sy = Math.floor(seed.y * res);
        // une étiquette peut mordre sur un trait : on cherche la case libre la plus proche
        for (let r = 0; r < 12 && (sx < 0 || sy < 0 || sx >= W || sy >= H || grid[sy * W + sx]); r++)
            for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]])
                if (sx + dx >= 0 && sy + dy >= 0 && sx + dx < W && sy + dy < H && !grid[(sy + dy) * W + sx + dx]) { sx += dx; sy += dy; r = 99; break; }
        if (sx < 0 || sy < 0 || sx >= W || sy >= H || grid[sy * W + sx]) return 0;
        if (label[sy * W + sx]) return label[sy * W + sx];
        const id = areas.length; areas.push(0); open.push(false); sums.push({ x: 0, y: 0 }); boxes.push({ x0: sx, y0: sy, x1: sx, y1: sy });
        let top = 0; stack[top++] = sy * W + sx; label[sy * W + sx] = id;
        while (top) {
            const i = stack[--top], x = i % W, y = (i - x) / W;
            areas[id]++; sums[id].x += x + .5; sums[id].y += y + .5;
            const bx = boxes[id]; if (x < bx.x0) bx.x0 = x; if (x > bx.x1) bx.x1 = x; if (y < bx.y0) bx.y0 = y; if (y > bx.y1) bx.y1 = y;
            if (x === 0 || y === 0 || x === W - 1 || y === H - 1) open[id] = true;
            for (const j of [i - 1, i + 1, i - W, i + W]) {
                if (j < 0 || j >= W * H || Math.abs((j % W) - x) > 1) continue;
                if (!grid[j] && !label[j]) { label[j] = id; stack[top++] = j; }
            }
        }
        return id;
    };
    const results = seeds.map(seed => {
        const id = region(seed);
        if (!id || open[id]) return null;
        const b = boxes[id];
        return { id, area: areas[id] / (res * res), centre: { x: sums[id].x / areas[id] / res, y: sums[id].y / areas[id] / res },
            box: { x0: b.x0 / res, y0: b.y0 / res, x1: (b.x1 + 1) / res, y1: (b.y1 + 1) / res } };
    });
    const at = (p: Point) => { const x = Math.floor(p.x * res), y = Math.floor(p.y * res); return x >= 0 && y >= 0 && x < W && y < H ? label[y * W + x] : 0; };
    /** Le point est-il dans un espace clos — pièce nommée ou non (dégagement, palier) — plutôt
     *  que dehors ? null s'il tombe dans l'épaisseur d'un mur. */
    const enclosed = (p: Point) => { const id = region(p); return id ? !open[id] : null; };
    return { results, at, enclosed };
}

/** Accord entre le masque des murs du PDF et les murs reconstruits, à une case (~1 cm) près :
 *  précision = part de mes murs posée sur un mur du PDF, rappel = part des murs du PDF couverte.
 *  Les plus gros écarts sont rendus avec leur position, pour aller les voir. */
export function agreement(reference: Grid, mine: Grid, box: { x0: number; y0: number; x1: number; y1: number }) {
    const { W, H, res } = reference;
    const c0 = Math.max(1, Math.floor(box.x0 * res)), c1 = Math.min(W - 2, Math.ceil(box.x1 * res)), r0 = Math.max(1, Math.floor(box.y0 * res)), r1 = Math.min(H - 2, Math.ceil(box.y1 * res));
    const near = (g: Uint8Array, i: number) => g[i] || g[i - 1] || g[i + 1] || g[i - W] || g[i + W] || g[i - W - 1] || g[i - W + 1] || g[i + W - 1] || g[i + W + 1];
    let mineN = 0, mineOk = 0, refN = 0, refOk = 0;
    const extra = new Uint8Array(W * H), missing = new Uint8Array(W * H);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const i = r * W + c;
        if (mine.data[i]) { mineN++; if (near(reference.data, i)) mineOk++; else extra[i] = 1; }
        if (reference.data[i]) { refN++; if (near(mine.data, i)) refOk++; else missing[i] = 1; }
    }
    const blobs = (g: Uint8Array, kind: 'en trop' | 'manquant') => {
        const out: { x: number; y: number; cells: number; kind: typeof kind }[] = [];
        for (let i = 0; i < W * H; i++) {
            if (!g[i]) continue;
            let n = 0, sx = 0, sy = 0;
            const stack = [i]; g[i] = 0;
            while (stack.length) {
                const j = stack.pop()!; n++; sx += j % W; sy += Math.floor(j / W);
                for (const k of [j - 1, j + 1, j - W, j + W]) if (g[k]) { g[k] = 0; stack.push(k); }
            }
            out.push({ x: sx / n / res, y: sy / n / res, cells: n, kind });
        }
        return out;
    };
    const faults = [...blobs(extra, 'en trop'), ...blobs(missing, 'manquant')].sort((a, b) => b.cells - a.cells);
    return { precision: mineN ? mineOk / mineN : 1, recall: refN ? refOk / refN : 1, faults };
}

export type RoomCheck = { name: string; printed: number; computed: number | null; zone?: { with: string[]; printed: number } };
// fidelity : accord entre les murs du PDF et les murs reconstruits (voir agreement), bouts de mur
// orphelins (le mur du PDF continue au-delà) et murs de moins de 10 cm
export type Fidelity = { precision: number; recall: number; faults: { x: number; y: number; area: number; kind: 'en trop' | 'manquant' }[]; orphans: number; short: number; zones: number };
export type PlanReport = { pageWidth: number; pageHeight: number; scale: number | null; scaleSource: 'cartouche' | 'surfaces' | null; ceiling: number | null; rooms: RoomCheck[]; walls: number; bays: number; annotated: number; warnings: string[]; fidelity: Fidelity };

const MIN_WALL = .05, MAX_WALL = .6;   // épaisseurs plausibles, en mètres

/** Chaîne complète : vecteurs de la page → projet éditable, plus le rapport de
 *  contrôle. Les surfaces imprimées servent d'arbitre, aucune vérité extérieure. */
export function planFromPage(page: PageVectors, name: string, options: { pen?: number; log?: (m: string) => void } = {}): { project: Project; report: PlanReport } {
    const warnings: string[] = [];
    const rooms = printedRooms(page.texts), notes = annotations(page.texts);
    const ceiling = printedCeiling(page.texts);
    // traits de gris moyen à foncé, ou arêtes d'aplats foncés (poché des murs) ; les aplats
    // clairs sont des sols, des zones ou des masques blancs
    const structural = structuralStrokes(page, options.pen);

    let scale = printedScale(page.texts);
    let scaleSource: PlanReport['scaleSource'] = scale ? 'cartouche' : null;
    if (!scale) {
        // sans cartouche : on part d'une échelle d'essai pour obtenir des faces, puis
        // on la corrige avec les surfaces imprimées
        const guess = bandsFrom(structural, { minThickness: .4, maxThickness: 40 });
        scale = scaleFromAreas(facesFrom([...new Set(guess.flatMap(b => b.faces))]), rooms);
        scaleSource = scale ? 'surfaces' : null;
    }
    if (!scale) { warnings.push("Échelle introuvable : ni cartouche lisible, ni surface imprimée exploitable."); scale = 25.4 / 72 / 1000 * 50; }

    // emprise du logement d'après ses étiquettes de pièces, élargie de 4 m (une étiquette est au
    // centre de sa pièce) : ce qui est au-delà — légende, cadre — ne délimite ni ne referme rien
    const labelBox = rooms.length ? { x0: Math.min(...rooms.map(r => r.x)) - 4 / scale, y0: Math.min(...rooms.map(r => r.y)) - 4 / scale, x1: Math.max(...rooms.map(r => r.x)) + 4 / scale, y1: Math.max(...rooms.map(r => r.y)) + 4 / scale } : null;
    const inLabelBox = (p: Point) => !labelBox || (p.x >= labelBox.x0 && p.x <= labelBox.x1 && p.y >= labelBox.y0 && p.y <= labelBox.y1);
    const housedStroke = (s: Stroke) => inLabelBox({ x: s.x0, y: s.y0 }) || inLabelBox({ x: s.x1, y: s.y1 });

    // --- masque des murs, à ~1 cm par case : aplats de murs peints pleins, et murs dessinés par
    // leurs deux faces peints sur toute leur épaisseur
    const res = Math.max(1, Math.min(6, scale / .01));
    const drawn = makeGrid(page.width, page.height, res);
    const byPath = new Map<number, Stroke[]>();
    for (const s of structural) if (s.fill && s.path !== undefined && housedStroke(s)) byPath.set(s.path, [...(byPath.get(s.path) ?? []), s]);
    for (const polygon of byPath.values()) paintPolygon(drawn, polygon);
    const bands = bandsFrom(structural, { minThickness: MIN_WALL / scale, maxThickness: MAX_WALL / scale, minOverlap: Math.max(4, .15 / scale), maxLoose: .3 / scale });
    for (const b of bands) {
        if (!inLabelBox(b.a) && !inLabelBox(b.b)) continue;
        const L = Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y) || 1, nx = -(b.b.y - b.a.y) / L * b.thickness / 2, ny = (b.b.x - b.a.x) / L * b.thickness / 2;
        paintRing(drawn, [{ x: b.a.x + nx, y: b.a.y + ny }, { x: b.b.x + nx, y: b.b.y + ny }, { x: b.b.x - nx, y: b.b.y - ny }, { x: b.a.x - nx, y: b.a.y - ny }]);
    }
    // zones de pièces : l'espace entre deux zones est un mur, même non dessiné en poché
    const mask: Grid = { ...drawn, data: drawn.data.slice() };
    const zones = roomZones(page.strokes, rooms, scale);
    const cells = (m: number) => m / scale * res;
    if (zones.length >= 2) paintBetweenZones(mask, zones, { span: cells(.45), front: Math.max(2, cells(.05)), depth: cells(.15), room: cells(.25) ** 2 });

    // --- vectorisation : axes, épaisseurs recalées sur les faces du dessin, angles raccordés
    const faces: Edge[] = [...structural.filter(s => !s.curved && housedStroke(s)), ...zones.flat()];
    // une porte se reconnaît à l'arc de son battement, ou à défaut à son vantail : un trait
    // accroché à un tableau, de la longueur d'un vantail, en biais sur la baie (porte d'entrée à
    // deux vantaux dessinée sans arc)
    // (un battement est un arc ouvert à l'échelle d'une porte, souvent en pointillés : on regroupe
    // les tirets bout à bout ; un cercle — rosace, descente, grille — ou un petit symbole n'en est pas un)
    const curved = page.strokes.filter(s => s.curved && !s.fill && !s.chroma && housedStroke(s));
    const clusterOf = curved.map((_, i) => i), rootOf = (i: number): number => clusterOf[i] === i ? i : (clusterOf[i] = rootOf(clusterOf[i]));
    const link = .06 / scale;
    for (let i = 0; i < curved.length; i++) for (let j = i + 1; j < curved.length; j++) {
        const a = curved[i], b = curved[j];
        if (Math.min(Math.hypot(a.x0 - b.x0, a.y0 - b.y0), Math.hypot(a.x0 - b.x1, a.y0 - b.y1), Math.hypot(a.x1 - b.x0, a.y1 - b.y0), Math.hypot(a.x1 - b.x1, a.y1 - b.y1)) < link) clusterOf[rootOf(i)] = rootOf(j);
    }
    const clusters = new Map<number, Stroke[]>();
    curved.forEach((s, i) => clusters.set(rootOf(i), [...(clusters.get(rootOf(i)) ?? []), s]));
    const swings = [...clusters.values()].filter(list => {
        const pts = list.flatMap(s => [{ x: s.x0, y: s.y0 }, { x: s.x1, y: s.y1 }]);
        let span = 0;
        for (const p of pts) for (const q of pts) span = Math.max(span, Math.hypot(p.x - q.x, p.y - q.y));
        if (span * scale < .45) return false;
        // couverture angulaire autour du centre du cercle ajusté : un battement couvre un quart de
        // tour (jusqu'à un demi), un cercle le tour entier
        const n = pts.length, mx = pts.reduce((t, p) => t + p.x, 0) / n, my = pts.reduce((t, p) => t + p.y, 0) / n;
        let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
        for (const p of pts) { const u = p.x - mx, v = p.y - my; suu += u * u; svv += v * v; suv += u * v; suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u; }
        const det = suu * svv - suv * suv;
        if (Math.abs(det) < 1e-9) return false;
        const cx = mx + ((suuu + suvv) / 2 * svv - (svvv + svuu) / 2 * suv) / det, cy = my + ((svvv + svuu) / 2 * suu - (suuu + suvv) / 2 * suv) / det;
        const angles = pts.map(p => Math.atan2(p.y - cy, p.x - cx)).sort((a, b) => a - b);
        let gap = angles[0] + 2 * Math.PI - angles[angles.length - 1];
        for (let k = 1; k < angles.length; k++) gap = Math.max(gap, angles[k] - angles[k - 1]);
        return 2 * Math.PI - gap <= 200 * Math.PI / 180;
    }).flat();
    const leaves = page.strokes.filter(s => !s.curved && !s.fill && !s.chroma && s.gray < .7 && spanOf(s) > .25 / scale && spanOf(s) < 1.2 / scale && housedStroke(s));
    const swingNear = (p: Point, q: Point): 'arc' | 'leaf' | false => {
        const L = Math.hypot(q.x - p.x, q.y - p.y), mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, reach = Math.max(L * 1.2, .5 / scale);
        if (swings.some(s => Math.hypot((s.x0 + s.x1) / 2 - mx, (s.y0 + s.y1) / 2 - my) < reach)) return 'arc';
        const ux = (q.x - p.x) / (L || 1), uy = (q.y - p.y) / (L || 1), hinge = .3 / scale;
        // (un vantail est dans le vide : la diagonale d'un bloc d'angle, dans l'épaisseur du mur, n'en est pas un)
        const inWall = (x: number, y: number) => { const c = Math.floor(x * res), r = Math.floor(y * res); return c >= 0 && r >= 0 && c < drawn.W && r < drawn.H && drawn.data[r * drawn.W + c] === 1; };
        return leaves.some(s => {
            const len = spanOf(s);
            if (len < L * .25 || len > L * 1.1 || Math.abs((s.x1 - s.x0) * ux + (s.y1 - s.y0) * uy) / len > .94) return false;
            if (inWall((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2)) return false;
            // (ni le filet qui borde la face d'un mur)
            const nx = -(s.y1 - s.y0) / len * 2 / res, ny = (s.x1 - s.x0) / len * 2 / res;
            if ([1, -1].some(k => [.25, .5, .75].filter(f => inWall(s.x0 + (s.x1 - s.x0) * f + nx * k, s.y0 + (s.y1 - s.y0) * f + ny * k)).length >= 2)) return false;
            return [p, q].some(j => Math.min(Math.hypot(s.x0 - j.x, s.y0 - j.y), Math.hypot(s.x1 - j.x, s.y1 - j.y)) < hinge);
        }) ? 'leaf' : false;
    };
    // une baie est dessinée : un trait (vitrage, appui, tableau) dans l'alignement du mur, dans la
    // brèche, sur au moins un tiers de sa largeur — ou le battement d'une porte
    const drawnBay = (p: Point, q: Point, thickness: number) => {
        const L = Math.hypot(q.x - p.x, q.y - p.y), ux = (q.x - p.x) / L, uy = (q.y - p.y) / L;
        if (swingNear(p, q)) return true;
        return page.strokes.some(s => {
            if (s.curved || s.chroma) return false;
            const len = spanOf(s);
            if (len < L / 3 || Math.abs((s.x1 - s.x0) * ux + (s.y1 - s.y0) * uy) / len < .98) return false;
            const mx = (s.x0 + s.x1) / 2 - p.x, my = (s.y0 + s.y1) / 2 - p.y, along = mx * ux + my * uy;
            return along > 0 && along < L && Math.abs(-uy * mx + ux * my) < thickness / 2 + .5;
        });
    };
    const walls: PlanWall[] = traceWalls({ ...mask, data: mask.data.slice() }, { scale, faces, door: swingNear, bay: drawnBay, log: options.log })
        .filter(w => inLabelBox(w.a) || inLabelBox(w.b));
    // portes entre deux zones : là où seul l'écart entre zones dessine le mur, sur une largeur de
    // porte, avec un battement — sans battement, c'est une paroi légère (fond de placard)
    if (zones.length >= 2) for (const w of walls) {
        if (w.angle) continue;
        const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y), ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L, q = w.thickness / 4;
        const hit = (x: number, y: number) => { const c = Math.floor(x * res), r = Math.floor(y * res); return c >= 0 && r >= 0 && c < drawn.W && r < drawn.H && drawn.data[r * drawn.W + c] === 1; };
        const solid = (t: number) => { const x = w.a.x + ux * t, y = w.a.y + uy * t; return hit(x, y) || hit(x - uy * q, y + ux * q) || hit(x + uy * q, y - ux * q); };
        let start = -1;
        for (let t = 0; t <= L; t += .5 / res) {
            if (!solid(t)) { if (start < 0) start = t; continue; }
            if (start > 0) {
                const width = (t - start) * scale, p = { x: w.a.x + ux * start, y: w.a.y + uy * start }, r = { x: w.a.x + ux * t, y: w.a.y + uy * t };
                // (à une porte, les faces de la cloison s'interrompent — un seuil s'arrête aux tableaux ;
                // un fond de placard garde une face continue qui déborde la brèche des deux côtés, même
                // si les battements des portes de placard sont tout près)
                const beyond = .05 / scale;
                const faced = page.strokes.some(s => {
                    if (s.curved || s.fill) return false;
                    const len = spanOf(s);
                    if (len < 1 || Math.abs((s.x1 - s.x0) * ux + (s.y1 - s.y0) * uy) / len < .98) return false;
                    const off = Math.abs(-uy * ((s.x0 + s.x1) / 2 - w.a.x) + ux * ((s.y0 + s.y1) / 2 - w.a.y));
                    if (Math.abs(off - w.thickness / 2) > 1) return false;
                    const u = (s.x0 - w.a.x) * ux + (s.y0 - w.a.y) * uy, v = (s.x1 - w.a.x) * ux + (s.y1 - w.a.y) * uy;
                    return Math.min(u, v) < start - beyond && Math.max(u, v) > t + beyond;
                });
                if (width >= .5 && width <= 1.6 && !faced && !w.gaps.some(g => g.from < t && g.to > start) && swingNear(p, r)) w.gaps.push({ from: start, to: t, kind: 'door' });
            }
            start = -1;
        }
        w.gaps.sort((g, h) => g.from - h.from);
    }
    const bays = baysFrom(walls, page.strokes, notes, scale);

    // --- pièces : remplissage entre les murs reconstruits, baies fermées. La surface calculée
    // mesure donc la reconstruction elle-même, pas le dessin
    const bodies = makeGrid(page.width, page.height, res);
    const rings = wallRings(walls, scale);
    for (const ring of rings) if (ring.length) paintRing(bodies, ring);
    const flood = floodRooms(bodies, rooms);
    const found = flood.results;
    // plusieurs étiquettes dans une même région : zones d'un volume ouvert (séjour + chambre),
    // à comparer à la somme de leurs surfaces imprimées
    const shared = new Map<number, number[]>();
    found.forEach((f, i) => { if (f) shared.set(f.id, [...(shared.get(f.id) ?? []), i]); });
    const checks: RoomCheck[] = rooms.map((r, i) => {
        const f = found[i], together = f ? shared.get(f.id)! : [];
        const computed = f && (together.length > 1 || Math.abs(f.area * scale * scale - r.area) <= Math.max(.1, r.area * .35)) ? f.area * scale * scale : null;
        return { name: r.name, printed: r.area, computed,
            ...(computed !== null && together.length > 1 ? { zone: { with: together.filter(j => j !== i).map(j => rooms[j].name), printed: together.reduce((n, j) => n + rooms[j].area, 0) } } : {}) };
    });
    for (const c of checks) {
        if (c.computed === null) warnings.push(`${c.name} : aucune pièce fermée trouvée autour de l'étiquette.`);
        else if (c.zone) { if (Math.abs(c.computed - c.zone.printed) > Math.max(.02, c.zone.printed * .02)) warnings.push(`${c.name} partage un volume de ${c.computed.toFixed(2)} m² avec ${c.zone.with.join(', ')} (${c.zone.printed.toFixed(2)} imprimés au total).`); }
        else if (Math.abs(c.computed - c.printed) > Math.max(.02, c.printed * .02)) warnings.push(`${c.name} : ${c.computed.toFixed(2)} m² calculés contre ${c.printed.toFixed(2)} imprimés.`);
    }

    // repère du projet : mètres, origine au coin de la page, pour que les murs se
    // superposent exactement au plan affiché en fond
    const place = (p: Point): Point => ({ x: Math.round(p.x * scale * 1000) / 1000, y: Math.round(p.y * scale * 1000) / 1000 });
    const height = ceiling ?? 2.5;
    // une baie entre deux pièces est une porte ; sur l'enveloppe, c'est une fenêtre —
    // sauf allège nulle, qui est une porte-fenêtre et s'ouvre donc du sol au linteau
    // dedans = espace clos, nommé ou non ; on sonde à plusieurs distances du mur pour ne pas
    // tomber dans l'épaisseur d'un trait
    const indoors = (p: Point, nx = 0, ny = 0) => {
        for (const d of [0, 4, 9, 16]) { const r = flood.enclosed({ x: p.x + nx * d, y: p.y + ny * d }); if (r !== null) return r; }
        return false;
    };
    for (const bay of bays) {
        const len = Math.hypot(bay.wall.b.x - bay.wall.a.x, bay.wall.b.y - bay.wall.a.y);
        if (!len) continue;
        const ux = (bay.wall.b.x - bay.wall.a.x) / len, uy = (bay.wall.b.y - bay.wall.a.y) / len;
        const cx = bay.wall.a.x + ux * bay.centre, cy = bay.wall.a.y + uy * bay.centre;
        const step = bay.wall.thickness / 2 + 3;
        const both = indoors({ x: cx - uy * step, y: cy + ux * step }, -uy, ux) && indoors({ x: cx + uy * step, y: cy - ux * step }, uy, -ux);
        if (!bay.stated) bay.kind = both || bay.sill === 0 ? 'door' : 'window';
    }
    // emprise des pièces retrouvées, élargie de 0,7 m (l'épaisseur d'une façade ; le cartouche et
    // la légende sont plus loin) — 1,5 m sans pièce retrouvée. Les étiquettes comptent aussi : une
    // pièce non refermée reste dans le logement
    const ring = [...found.flatMap(f => f ? [{ x: f.box.x0, y: f.box.y0 }, { x: f.box.x1, y: f.box.y1 }] : []), ...rooms.map(r => ({ x: r.x, y: r.y }))], pad = (found.some(f => f) ? .7 : 1.5) / scale;
    const box = ring.length ? { x0: Math.min(...ring.map(p => p.x)) - pad, y0: Math.min(...ring.map(p => p.y)) - pad, x1: Math.max(...ring.map(p => p.x)) + pad, y1: Math.max(...ring.map(p => p.y)) + pad } : null;
    const inside = (p: Point) => !box || (p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 && p.y <= box.y1);
    const byWall = new Map<PlanWall, Bay[]>();
    for (const bay of bays) byWall.set(bay.wall, [...(byWall.get(bay.wall) ?? []), bay]);
    // on garde tout ensemble de murs raccordés dont un mur touche l'emprise : une façade reste
    // entière même si la pièce qu'elle ferme n'est pas retrouvée ; la légende, isolée, s'en va
    const group = walls.map((_, i) => i);
    const top = (i: number): number => group[i] === i ? i : (group[i] = top(group[i]));
    const graph = junctions(walls.map((w, i) => ({ id: String(i), name: '', a: w.a, b: w.b, ...(w.angle ? { angle: w.angle } : {}), thickness: w.thickness, height: 1, openings: [] })), .01 / scale);
    for (const n of graph) { const ids = [...n.ends.map(e => +e.wall), ...n.hosts.map(Number)]; for (const j of ids.slice(1)) group[top(j)] = top(ids[0]); }
    // (un groupe isolé de moins de 60 cm de murs est un symbole — flèche d'entrée, repère —, pas un mur)
    const extent = new Map<number, number>();
    walls.forEach((w, i) => extent.set(top(i), (extent.get(top(i)) ?? 0) + wallLength(w) * scale));
    const housed = new Set(walls.map((w, i) => (inside(w.a) || inside(w.b)) && extent.get(top(i))! >= .6 ? top(i) : -1));
    const projectWalls: Wall[] = [];
    const kept: PlanWall[] = [];
    walls.forEach((w, i) => {
        const a = place(w.a), b = place(w.b);
        if (!housed.has(top(i))) return;
        const span = wallLength({ a, b, angle: w.angle });
        if (span < .05) return;
        kept.push(w);
        const thickness = Math.min(MAX_WALL, Math.max(MIN_WALL, w.thickness * scale));
        const openings: Opening[] = [];
        // baies annotées, puis brèches du mur que rien n'annote : une porte si elle relie deux
        // pièces, une fenêtre si elle donne dehors — sans quoi la brèche serait murée en 3D
        const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y), ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L;
        const annotated = byWall.get(w) ?? [];
        const openingsHere: Bay[] = [...annotated];
        for (const g of w.gaps) {
            const width = (g.to - g.from) * scale, centre = (g.from + g.to) / 2;
            if (width < .4 || width > 2.6 || annotated.some(b => Math.abs(b.centre - centre) * scale < (b.width + width) / 2)) continue;
            const cx = w.a.x + ux * centre, cy = w.a.y + uy * centre, step = w.thickness / 2 + 3;
            const between = indoors({ x: cx - uy * step, y: cy + ux * step }, -uy, ux) && indoors({ x: cx + uy * step, y: cy - ux * step }, uy, -ux);
            // (le dessin dit la nature de la brèche — battement, vantail, vitrage — ; sinon, porte entre
            // deux pièces, fenêtre sur l'extérieur)
            const kind = g.kind ?? (between ? 'door' : 'window');
            openingsHere.push({ wall: w, centre, width, kind, sill: kind === 'door' ? 0 : null, stated: false });
        }
        for (const bay of openingsHere.sort((p, q) => p.centre - q.centre)) {
            // 10 cm de jambage à chaque bout : sans lui la baie mord sur le mur en retour
            // (1 cm de marge en plus : les arrondis au centimètre ne doivent pas l'entamer)
            const width = Math.floor(Math.min(bay.width, span - .22) * 100) / 100;
            if (width < .2) continue;
            const margin = (width / 2 + .11) / span;
            const offset = Math.min(1 - margin, Math.max(margin, bay.centre * scale / span));
            const last = openings[openings.length - 1];
            if (last && Math.abs(last.offset - offset) * span < (last.width + width) / 2) continue;   // pas de recouvrement
            openings.push({ id: `${i}-${openings.length}`, kind: bay.kind, offset: Math.round(offset * 1e4) / 1e4, width, height: bay.kind === 'door' ? Math.min(bay.height ?? 2.1, height - .05) : Math.max(.2, Math.min(bay.height ?? 1.2, height - (bay.sill ?? .9) - .05)), sill: bay.kind === 'door' ? 0 : Math.min(bay.sill ?? .9, height - .25) });
        }
        projectWalls.push({ id: `mur-${i}`, name: w.angle ? `Mur courbe ${i + 1}` : `Mur ${i + 1}`, a, b, ...(w.angle ? { angle: w.angle } : {}), thickness: Math.round(thickness * 1000) / 1000, height, openings });
    });

    const labels = rooms.map((r, i) => {
        // une zone d'un volume ouvert garde la position de son étiquette : au centre du
        // volume, les zones qu'il réunit s'empileraient
        // (le centre d'une pièce en L ou en C peut tomber hors de la pièce : on garde alors le texte)
        const f = found[i], alone = f && shared.get(f.id)!.length === 1 && flood.at(f.centre) === f.id;
        const centre = alone ? f!.centre : r;
        const p = place(centre);
        return { name: `${r.name} · ${r.area.toFixed(2)} m²`, x: p.x, y: p.y };
    });

    // --- fidélité, mesurée dans les deux sens : murs du PDF (baies refermées par les miennes)
    // contre murs reconstruits, baies fermées
    const reference: Grid = { ...mask, data: mask.data.slice() };
    const mine = makeGrid(page.width, page.height, res);
    wallRings(kept, scale).forEach(r => { if (r.length) paintRing(mine, r); });
    kept.forEach(w => {
        const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
        if (!L || w.angle) return;
        const ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L, h = w.thickness / 2;
        const spans = [...w.gaps.map(g => [g.from, g.to]), ...(byWall.get(w) ?? []).map(b => [b.centre - b.width / scale / 2, b.centre + b.width / scale / 2])];
        for (const [f, t] of spans) paintRing(reference, [{ x: w.a.x + ux * f - uy * h, y: w.a.y + uy * f + ux * h }, { x: w.a.x + ux * t - uy * h, y: w.a.y + uy * t + ux * h }, { x: w.a.x + ux * t + uy * h, y: w.a.y + uy * t - ux * h }, { x: w.a.x + ux * f + uy * h, y: w.a.y + uy * f - ux * h }]);
    });
    const measured = agreement(reference, mine, box ?? { x0: 0, y0: 0, x1: page.width, y1: page.height });
    const nodes = junctions(projectWalls);
    let orphans = 0;
    for (const n of nodes) {
        if (n.ends.length > 1 || n.hosts.length) continue;
        const w = projectWalls.find(o => o.id === n.ends[0].wall)!, L = wallLength(w);
        if (w.angle || !L) continue;
        const s = n.ends[0].end === 'b' ? 1 : -1, ux = (w.b.x - w.a.x) / L * s, uy = (w.b.y - w.a.y) / L * s;
        const beyond = [.03, .05, .08].filter(d => { const x = (n.point.x + ux * d) / scale, y = (n.point.y + uy * d) / scale, c = Math.floor(x * res), r = Math.floor(y * res); return mask.data[r * mask.W + c] === 1; }).length;
        if (beyond >= 2) orphans++;
    }
    const fidelity: Fidelity = { precision: measured.precision, recall: measured.recall, orphans, short: projectWalls.filter(w => wallLength(w) < .1).length, zones: zones.length,
        faults: measured.faults.slice(0, 5).map(f => ({ x: Math.round(f.x * scale * 100) / 100, y: Math.round(f.y * scale * 100) / 100, area: Math.round(f.cells / (res * res) * scale * scale * 1e4) / 1e4, kind: f.kind })) };

    const project: Project = { version: 1, name, walls: projectWalls, items: [], labels, background: null, calibrated: true, assets: {} };
    return { project, report: { pageWidth: page.width * scale, pageHeight: page.height * scale, scale, scaleSource, ceiling, rooms: checks, walls: projectWalls.length, bays: bays.length, annotated: notes.filter(n => n.width !== null).length, warnings, fidelity } };
}
