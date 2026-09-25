import { pointAt, wallLength } from './arc';
import { round, uid, type JournalEntry, type Opening, type Point, type Project, type Wall } from './model';

// Journal des actions sur le plan. Chaque modification est décrite en comparant le projet avant / après :
// tous les chemins d'édition (outils, glisser, clic droit, inspecteur) sont couverts sans être annotés un à un.
// Il ne compte qu'une fois l'existant figé : les corrections du relevé ne sont pas des travaux.

export type Action = Omit<JournalEntry, 'id' | 'at'>;
const MAX = 500;
const m = (n: number) => `${n.toFixed(2).replace('.', ',')} m`;
const mid = (w: Wall): Point => { const p = pointAt(w, wallLength(w) / 2).point; return { x: round(p.x), y: round(p.y) }; };
const same = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
const bay = (o: Opening) => o.kind === 'door' ? 'Porte' : 'Fenêtre';

/** Le plan devient l'existant : référence des démolitions / constructions, journal remis à zéro. */
export function startWork(p: Project, at = new Date().toISOString()): Project {
    return { ...p, existing: { walls: p.walls, labels: p.labels, validatedAt: at }, journal: [] };
}

/** Retour au relevé : le plan revient à l'existant et peut être corrigé sans compter comme travaux. */
export function reopenSurvey(p: Project): Project {
    return { ...p, walls: p.existing?.walls ?? p.walls, labels: p.existing?.labels ?? p.labels, existing: null, journal: [] };
}

/** Annule toutes les modifications : le plan revient à l'existant, le journal repart de zéro. */
export function resetWork(p: Project): Project {
    if (!p.existing) return p;
    return { ...p, walls: p.existing.walls, labels: p.existing.labels ?? p.labels, journal: [] };
}

/** Décrit ce qui a changé entre deux états du plan, ou null (renommage, mobilier, rien de visible). */
export function describe(before: Project, after: Project, subject?: string | null): Action | null {
    const old = new Map(before.walls.map(w => [w.id, w])), now = new Map(after.walls.map(w => [w.id, w]));
    const added = after.walls.filter(w => !old.has(w.id)), removed = before.walls.filter(w => !now.has(w.id));
    if (added.length || removed.length) {
        const gone = removed.find(w => w.id === subject);
        if (gone) return { kind: 'demolished', label: `${gone.name} démoli`, detail: m(wallLength(gone)), point: mid(gone) };
        // coupe : le mur garde son identifiant pour la première moitié, la seconde est ajoutée
        const shortened = after.walls.find(w => old.has(w.id) && Math.abs(wallLength(old.get(w.id)!) - wallLength(w) - added.reduce((n, x) => n + wallLength(x), 0)) < .01 && wallLength(w) < wallLength(old.get(w.id)!) - .01);
        if (!removed.length && added.length === 1 && shortened) {
            const w = old.get(shortened.id)!;
            return { kind: 'split', label: `${w.name} coupé en deux`, detail: `${m(wallLength(shortened))} + ${m(wallLength(added[0]))}`, point: mid(w), wallId: shortened.id };
        }
        // fusion : le mur prolongé garde son identifiant, l'autre disparaît
        const lengthened = after.walls.find(w => old.has(w.id) && Math.abs(wallLength(w) - wallLength(old.get(w.id)!) - removed.reduce((n, x) => n + wallLength(x), 0)) < .01);
        if (!added.length && removed.length === 1 && lengthened)
            return { kind: 'merged', label: `Murs réunis en « ${lengthened.name} »`, detail: m(wallLength(lengthened)), point: mid(lengthened), wallId: lengthened.id };
        if (removed.length && !added.length) {
            const w = removed[0];
            return { kind: 'demolished', label: removed.length > 1 ? `${removed.length} murs démolis` : `${w.name} démoli`, detail: m(wallLength(w)), point: mid(w) };
        }
        if (!removed.length) {
            const w = added[added.length - 1];
            return { kind: 'built', label: added.length > 1 ? `${added.length} murs construits` : `${w.name} construit`, detail: m(wallLength(w)), point: mid(w), wallId: w.id };
        }
        if (removed.length === 1 && added.length === 2) {
            const w = removed[0];
            return { kind: 'split', label: `${w.name} coupé en deux`, detail: `${m(wallLength(added[0]))} + ${m(wallLength(added[1]))}`, point: mid(w), wallId: added[0].id };
        }
        if (added.length === 1) {
            const w = added[0];
            return { kind: 'merged', label: `Murs réunis en « ${w.name} »`, detail: m(wallLength(w)), point: mid(w), wallId: w.id };
        }
        const w = added[0];
        return { kind: 'modified', label: `${removed.length} murs remplacés par ${added.length}`, point: mid(w), wallId: w.id };
    }
    // mêmes murs : géométrie, dimensions, puis baies
    const changed = after.walls.filter(w => { const o = old.get(w.id)!; return !same(o.a, w.a) || !same(o.b, w.b) || (o.angle ?? 0) !== (w.angle ?? 0) || o.thickness !== w.thickness || o.height !== w.height; });
    if (changed.length) {
        const w = changed.find(x => x.id === subject) ?? changed[0], o = old.get(w.id)!;
        const others = changed.length > 1 ? ` (+ ${changed.length - 1} raccordé${changed.length > 2 ? 's' : ''})` : '';
        // déplacé : même longueur et même direction, au centimètre près (les positions sont arrondies)
        const heading = (x: Wall) => Math.atan2(x.b.y - x.a.y, x.b.x - x.a.x), turn = Math.abs(Math.atan2(Math.sin(heading(w) - heading(o)), Math.cos(heading(w) - heading(o))));
        if ((w.angle ?? 0) === (o.angle ?? 0) && w.thickness === o.thickness && w.height === o.height && Math.abs(wallLength(w) - wallLength(o)) < .015 && turn < .02) {
            const a = mid(o), b = mid(w);
            return { kind: 'moved', label: `${w.name} déplacé`, detail: `${m(Math.hypot(b.x - a.x, b.y - a.y))}${others}`, point: b, wallId: w.id };
        }
        const parts: string[] = [];
        if (Math.abs(wallLength(w) - wallLength(o)) > 1e-3) parts.push(`longueur ${m(wallLength(w))}`);
        if (w.thickness !== o.thickness) parts.push(`épaisseur ${m(w.thickness)}`);
        if (w.height !== o.height) parts.push(`hauteur ${m(w.height)}`);
        if ((w.angle ?? 0) !== (o.angle ?? 0)) parts.push('courbure');
        if (!parts.length) parts.push('orientation');
        return { kind: 'modified', label: `${w.name} modifié`, detail: parts.join(', ') + others, point: mid(w), wallId: w.id };
    }
    const bays = (p: Project) => new Map(p.walls.flatMap(w => w.openings.map(o => [o.id, { o, w }] as const)));
    const was = bays(before), is = bays(after);
    for (const [id, { o, w }] of is) if (!was.has(id))
        return { kind: 'opening-added', label: `${bay(o)} ajoutée`, detail: `${w.name} · ${m(o.width)}`, point: mid(w), wallId: w.id };
    for (const [id, { o, w }] of was) if (!is.has(id))
        return { kind: 'opening-removed', label: `${bay(o)} supprimée`, detail: w.name, point: mid(w), wallId: w.id };
    const edited = [...is].filter(([id, { o }]) => { const p = was.get(id)!.o; return p.width !== o.width || p.height !== o.height || p.sill !== o.sill || p.offset !== o.offset; });
    if (edited.length) {
        const [id, { o, w }] = edited.find(([id]) => id === subject) ?? edited[0], p = was.get(id)!.o;
        const what = p.width !== o.width ? `largeur ${m(o.width)}` : p.height !== o.height ? `hauteur ${m(o.height)}` : p.sill !== o.sill ? `allège ${m(o.sill)}` : 'déplacée';
        return { kind: 'opening-modified', label: `${bay(o)} modifiée`, detail: `${w.name} · ${what}`, point: mid(w), wallId: w.id };
    }
    return null;
}

/**
 * Inscrit la modification `before` → `after` au journal de `after`. `merge` : la modification prolonge la
 * précédente (flèches du clavier, même pas d'annulation) ; l'entrée précédente est alors remplacée.
 */
export function record(before: Project, after: Project, options: { merge?: boolean; subject?: string | null; at?: string } = {}): Project {
    if (!after.existing) return after;
    const action = describe(before, after, options.subject);
    if (!action) return after;
    const journal = after.journal ?? [];
    const last = journal[journal.length - 1];
    const entry: JournalEntry = { id: options.merge && last ? last.id : uid(), at: options.at ?? new Date().toISOString(), ...action };
    // une rafale de flèches : une seule entrée, sans la distance du dernier pas seulement
    const next = options.merge && last && last.kind === entry.kind && last.wallId === entry.wallId ? [...journal.slice(0, -1), { ...entry, detail: entry.kind === 'moved' ? undefined : entry.detail }] : [...journal, entry];
    return { ...after, journal: next.slice(-MAX) };
}
