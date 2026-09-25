import { z } from 'zod';
import { MAX_SWEEP, pointAt, sweep, wallLength } from './arc';
import { moveWall } from './joints';
export const pointSchema = z.object({ x: z.number().finite().min(-200).max(200), y: z.number().finite().min(-200).max(200) });
export const openingSchema = z.object({ id: z.string().max(100), kind: z.enum(['door', 'window']), offset: z.number().min(0).max(1), width: z.number().min(.2).max(8), height: z.number().min(.2).max(5), sill: z.number().min(0).max(4) });
// a/b = AXE du mur : le trait 2D et la boîte 3D sont centrés dessus. Voir example-plan.ts.
// angle = angle au centre d'un mur courbe, en degrés (absent ou 0 : mur droit). Voir arc.ts.
export const wallSchema = z.object({ id: z.string().max(100), name: z.string().max(100), a: pointSchema, b: pointSchema, angle: z.number().finite().min(-MAX_SWEEP).max(MAX_SWEEP).optional(), thickness: z.number().min(.05).max(1), height: z.number().min(.5).max(6), openings: z.array(openingSchema).max(12) });
export const kinds = ['sofa', 'table', 'bed', 'chair', 'cabinet', 'island', 'custom'] as const;
export const itemSchema = z.object({ id: z.string().max(100), name: z.string().max(100), kind: z.enum(kinds), x: z.number().finite().min(-200).max(200), y: z.number().finite().min(-200).max(200), rotation: z.number().finite(), width: z.number().min(.05).max(20), depth: z.number().min(.05).max(20), height: z.number().min(.05).max(10), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), assetId: z.string().optional(),sourceUrl:z.string().url().max(3000).refine(u=>u.startsWith('https://')).optional() });
// Étiquette de pièce : nom et position ; `printed` = surface imprimée par l'architecte. Les pièces
// elles-mêmes sont calculées à partir des murs (voir rooms.ts).
export const labelSchema = z.object({ name: z.string().max(80), x: z.number().finite(), y: z.number().finite(), printed: z.number().positive().max(10000).optional() });
// Journal des actions faites depuis que le plan est l'existant (voir journal.ts). Il vit dans le projet :
// annuler / rétablir le fait suivre sans autre logique.
export const journalKinds = ['built', 'demolished', 'moved', 'modified', 'split', 'merged', 'opening-added', 'opening-removed', 'opening-modified'] as const;
export const journalEntrySchema = z.object({ id: z.string().max(100), at: z.string().max(40), kind: z.enum(journalKinds), label: z.string().max(200), detail: z.string().max(200).optional(), point: pointSchema.optional(), wallId: z.string().max(100).optional() });
// background.scale : mètres par point PDF, pour retrouver une position sur la page d'origine (x_pt = x / scale).
// existing : l'existant, référence des démolitions et constructions (voir changes.ts). Figé dès qu'un plan est
// chargé ; absent ou null : relevé en cours (« Corriger l'existant », ou PDF sans tracé exploitable).
export const projectSchema = z.object({ version: z.literal(1), name: z.string().max(120), walls: z.array(wallSchema).max(200), items: z.array(itemSchema).max(100), labels: z.array(labelSchema).max(100), background: z.object({ data: z.string().max(8000000).regex(/^data:image\/(png|jpeg|webp);base64,/), width: z.number().positive().max(200), height: z.number().positive().max(200), fileName: z.string().max(200), page: z.number().int().positive(), scale: z.number().positive().optional() }).nullable(), calibrated: z.boolean(), assets: z.record(z.string().max(40000000).regex(/^data:model\/gltf-binary;base64,/)).default({}), existing: z.object({ walls: z.array(wallSchema).max(200), labels: z.array(labelSchema).max(100).optional(), validatedAt: z.string().max(40) }).nullable().optional(), journal: z.array(journalEntrySchema).max(500).optional() });
export type Point = z.infer<typeof pointSchema>;
export type Opening = z.infer<typeof openingSchema>;
export type Wall = z.infer<typeof wallSchema>;
export type Item = z.infer<typeof itemSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Label = z.infer<typeof labelSchema>;
export type JournalEntry = z.infer<typeof journalEntrySchema>;
export type Tool = 'select' | 'wall' | 'scale' | 'door' | 'window';
export const uid = () => crypto.randomUUID();
/** Longueur développée : longueur d'arc pour un mur courbe. */
export const length = (w: Wall) => wallLength(w);
export const round = (n: number) => Math.round(n * 100) / 100;
export const catalog: Omit<Item, 'id' | 'x' | 'y' | 'rotation'>[] = [
    { name: 'Canapé', kind: 'sofa', width: 2.2, depth: .9, height: .82, color: '#bfa98b' },
    { name: 'Table', kind: 'table', width: 1.6, depth: .9, height: .75, color: '#aa794e' },
    { name: 'Lit double', kind: 'bed', width: 1.6, depth: 2, height: .65, color: '#c5c4b3' },
    { name: 'Fauteuil', kind: 'chair', width: .8, depth: .8, height: .85, color: '#818b7c' },
    { name: 'Rangement', kind: 'cabinet', width: 1.2, depth: .45, height: 1.8, color: '#b9a180' },
    { name: 'Îlot cuisine', kind: 'island', width: 1.8, depth: .9, height: .92, color: '#d2caba' },
];
export { exampleProject } from './example-plan';
export { exampleProject2 } from './example-plan-2';
import { exampleProject as example1 } from './example-plan';
import { exampleProject2 as example2 } from './example-plan-2';
/** Plans d'exemple, tirés de PDF d'architecte réels par l'extraction vectorielle. */
export const examples: { id: string; label: string; project: () => Project }[] = [
    { id: 'lefebvre', label: 'Exemple 1 · Lefebvre', project: example1 },
    { id: 'mamoun', label: 'Exemple 2 · Mamoun', project: example2 },
];
export function bounds(p: Project) {
    // (un mur courbe déborde de sa corde : on échantillonne l'arc)
    const points = p.walls.flatMap(w => sweep(w) ? Array.from({ length: 13 }, (_, i) => pointAt(w, wallLength(w) * i / 12).point) : [w.a, w.b]);
    p.items.forEach(i => { const r = Math.hypot(i.width, i.depth) / 2; points.push({ x: i.x - r, y: i.y - r }, { x: i.x + r, y: i.y + r }); });
    if (p.background)
        points.push({ x: 0, y: 0 }, { x: p.background.width, y: p.background.height });
    if (!points.length)
        points.push({ x: 0, y: 0 }, { x: 10, y: 8 });
    const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
    return { x, y, width: Math.max(2, Math.max(...points.map(p => p.x)) - x), height: Math.max(2, Math.max(...points.map(p => p.y)) - y) };
}
/** Déplace un mur ou un objet. Un mur entraîne les murs qui lui sont raccordés (voir joints.ts). */
export function moveEntity(p: Project, id: string, dx: number, dy: number): Project {
    if (p.walls.some(w => w.id === id)) return moveWall(p, id, dx, dy);
    return { ...p, items: p.items.map(i => i.id === id ? { ...i, x: round(i.x + dx), y: round(i.y + dy) } : i) };
}
export function rescale(p: Project, factor: number): Project {
    const scaleWall = (w: Wall): Wall => ({ ...w, a: { x: w.a.x * factor, y: w.a.y * factor }, b: { x: w.b.x * factor, y: w.b.y * factor }, openings: w.openings.map(o => ({ ...o, width: o.width * factor })) });
    return { ...p, calibrated: true, background: p.background ? { ...p.background, width: p.background.width * factor, height: p.background.height * factor, ...(p.background.scale ? { scale: p.background.scale * factor } : {}) } : null, walls: p.walls.map(scaleWall), ...(p.existing ? { existing: { ...p.existing, walls: p.existing.walls.map(scaleWall), ...(p.existing.labels ? { labels: p.existing.labels.map(l => ({ ...l, x: l.x * factor, y: l.y * factor })) } : {}) } } : {}), items: p.items.map(i => ({ ...i, x: i.x * factor, y: i.y * factor })), labels: p.labels.map(l => ({ ...l, x: l.x * factor, y: l.y * factor })), ...(p.journal ? { journal: p.journal.map(e => e.point ? { ...e, point: { x: e.point.x * factor, y: e.point.y * factor } } : e) } : {}) };
}
export function validateProject(value: unknown): Project {
    const p = projectSchema.parse(value);
    const ids = [...p.walls, ...p.items, ...p.walls.flatMap(w=>w.openings)].map(o => o.id);
    if (new Set(ids).size !== ids.length)
        throw new Error('Identifiants dupliqués dans le projet.');
    if (p.walls.some(w => length(w) < .05))
        throw new Error('Un mur est trop court.');
    if (p.items.some(i => i.kind === 'custom' && (!i.assetId || !p.assets[i.assetId])))
        throw new Error('Un modèle 3D est manquant.');
    return p;
}
