// Pièces du plan, calculées à partir des murs : seules les étiquettes (nom, position, surface
// imprimée) sont enregistrées. Les murs sont peints sur une grille d'un centimètre, puis l'espace
// libre est rempli depuis chaque étiquette, comme à l'extraction (voir floodRooms dans
// pdf-vector.ts) : portes et fenêtres comptent comme du mur plein. Deux étiquettes dans un même
// espace fermé font une seule pièce, à renommer.
// Module pur : ni DOM ni canvas, testé dans Node (tests/core.mjs).
import type { Label, Point, Project, Wall } from './model';
import { floodRooms, wallRings } from './pdf-vector';
import { makeGrid, paintRing } from './wall-trace';

export type Room = {
    /** `piece-<index de sa première étiquette>` : la clé de sélection */
    key: string;
    labels: number[];
    names: string[];
    name: string;
    /** surface calculée entre les faces des murs, null si l'espace n'est pas fermé */
    computed: number | null;
    /** somme des surfaces imprimées, si toutes les étiquettes en ont une */
    printed: number | null;
    /** surface affichée : l'imprimée tant que la pièce est inchangée, sinon la calculée */
    area: number | null;
    source: 'imprimée' | 'recalculée' | null;
    at: Point;
    merged: boolean;
};

const MAX_CELLS = 6e6;

/** Nom et surface imprimée. Les étiquettes de l'extraction portent la surface dans le nom
 *  (« Cuisine · 7.23 m² ») : elles sont lues telles quelles, sans migration. */
export function parseLabel(l: Label): { name: string; printed: number | null } {
    if (l.printed) return { name: l.name, printed: l.printed };
    const m = /^(.*?)\s*·\s*(\d+(?:[.,]\d+)?)\s*m²$/.exec(l.name.trim());
    return m ? { name: m[1], printed: Number(m[2].replace(',', '.')) } : { name: l.name, printed: null };
}

/** Espace fermé autour de chaque point : identifiant de région et surface (null : dehors ou ouvert). */
function spaces(walls: Wall[], seeds: Point[]): ({ id: number; area: number } | null)[] {
    if (!walls.length || !seeds.length) return seeds.map(() => null);
    const xs = [...walls.flatMap(w => [w.a.x, w.b.x]), ...seeds.map(s => s.x)], ys = [...walls.flatMap(w => [w.a.y, w.b.y]), ...seeds.map(s => s.y)];
    const x0 = Math.min(...xs) - .5, y0 = Math.min(...ys) - .5, width = Math.max(...xs) + .5 - x0, height = Math.max(...ys) + .5 - y0;
    const res = Math.min(100, Math.sqrt(MAX_CELLS / (width * height)));   // un centimètre, sauf plan démesuré
    const shift = (p: Point) => ({ x: p.x - x0, y: p.y - y0 });
    const g = makeGrid(width, height, res);
    const rings = wallRings(walls.map(w => ({ a: shift(w.a), b: shift(w.b), thickness: w.thickness, gaps: [], ...(w.angle ? { angle: w.angle } : {}) })), 1);
    for (const ring of rings) if (ring.length) paintRing(g, ring);
    return floodRooms(g, seeds.map(shift)).results.map(r => r ? { id: r.id, area: r.area } : null);
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Pièces des murs `walls`. `reference` : murs de l'existant validé ; une pièce dont l'espace a
 *  la même surface qu'avec eux est inchangée. Sans référence, elle l'est si la surface calculée
 *  rejoint l'imprimée (tolérance de l'extraction : 2 %, au moins 0,1 m²). */
export function roomsOf(walls: Wall[], labels: Label[], reference?: Wall[] | null): Room[] {
    const found = spaces(walls, labels);
    const groups = new Map<string, number[]>();
    found.forEach((f, i) => { const k = f ? `r${f.id}` : `l${i}`; groups.set(k, [...(groups.get(k) ?? []), i]); });
    const list = [...groups.values()];
    const before = reference ? spaces(reference, list.map(g => labels[g[0]])) : null;
    return list.map((indices, n) => {
        const parsed = indices.map(i => parseLabel(labels[i])), f = found[indices[0]];
        const computed = f ? r3(f.area) : null;
        const printed = parsed.every(p => p.printed !== null) ? r3(parsed.reduce((s, p) => s + p.printed!, 0)) : null;
        const ref = before?.[n];
        const unchanged = computed !== null && printed !== null && (before ? !!ref && Math.abs(ref.area - computed) < .01 : Math.abs(computed - printed) <= Math.max(.1, printed * .02));
        // au nom de la première pièce : le milieu des étiquettes tombe souvent sur le mur supprimé
        const at = { x: labels[indices[0]].x, y: labels[indices[0]].y };
        return {
            key: `piece-${indices[0]}`, labels: indices, names: parsed.map(p => p.name), name: parsed.map(p => p.name).join(' + '),
            computed, printed, area: computed === null ? null : unchanged ? printed : computed, source: computed === null ? null : unchanged ? 'imprimée' : 'recalculée',
            at, merged: indices.length > 1,
        };
    });
}

/** Renomme une pièce : ses étiquettes n'en font plus qu'une, à la place de la première, pour
 *  que la clé de la pièce et la position du nom restent les mêmes pendant la saisie. */
export function renameRoom(p: Project, indices: number[], name: string): Project {
    const kept = [...indices].sort((a, b) => a - b), first = kept[0];
    if (first === undefined || !p.labels[first]) return p;
    const parsed = kept.map(i => parseLabel(p.labels[i]));
    const printed = parsed.every(x => x.printed !== null) ? r3(parsed.reduce((s, x) => s + x.printed!, 0)) : undefined;
    const label: Label = { name: name.slice(0, 80), x: p.labels[first].x, y: p.labels[first].y, ...(printed ? { printed } : {}) };
    return { ...p, labels: p.labels.flatMap((l, i) => i === first ? [label] : kept.includes(i) ? [] : [l]) };
}

/** Pièces telles qu'exportées vers Conceptuo. */
export const roomsDocument = (rooms: Room[]) => rooms.map(r => ({ name: r.name, area: r.area, source: r.source, printed: r.printed, computed: r.computed, at: { x: r3(r.at.x), y: r3(r.at.y) } }));
