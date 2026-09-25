import { z } from 'zod';
export const pointSchema = z.object({ x: z.number().finite().min(-200).max(200), y: z.number().finite().min(-200).max(200) });
export const openingSchema = z.object({ id: z.string().max(100), kind: z.enum(['door', 'window']), offset: z.number().min(0).max(1), width: z.number().min(.2).max(8), height: z.number().min(.2).max(5), sill: z.number().min(0).max(4) });
// a/b = AXE du mur : le trait 2D et la boîte 3D sont centrés dessus. Voir example-plan.ts.
export const wallSchema = z.object({ id: z.string().max(100), name: z.string().max(100), a: pointSchema, b: pointSchema, thickness: z.number().min(.05).max(1), height: z.number().min(.5).max(6), openings: z.array(openingSchema).max(12) });
export const kinds = ['sofa', 'table', 'bed', 'chair', 'cabinet', 'island', 'custom'];
export const itemSchema = z.object({ id: z.string().max(100), name: z.string().max(100), kind: z.enum(kinds), x: z.number().finite().min(-200).max(200), y: z.number().finite().min(-200).max(200), rotation: z.number().finite(), width: z.number().min(.05).max(20), depth: z.number().min(.05).max(20), height: z.number().min(.05).max(10), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), assetId: z.string().optional(), sourceUrl: z.string().url().max(3000).refine(u => u.startsWith('https://')).optional() });
export const projectSchema = z.object({ version: z.literal(1), name: z.string().max(120), walls: z.array(wallSchema).max(200), items: z.array(itemSchema).max(100), labels: z.array(z.object({ name: z.string().max(80), x: z.number().finite(), y: z.number().finite() })).max(100), background: z.object({ data: z.string().max(8000000).regex(/^data:image\/(png|jpeg|webp);base64,/), width: z.number().positive().max(200), height: z.number().positive().max(200), fileName: z.string().max(200), page: z.number().int().positive() }).nullable(), calibrated: z.boolean(), assets: z.record(z.string().max(40000000).regex(/^data:model\/gltf-binary;base64,/)).default({}) });
export const uid = () => crypto.randomUUID();
export const length = (w) => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
export const round = (n) => Math.round(n * 100) / 100;
export const catalog = [
    { name: 'Canapé', kind: 'sofa', width: 2.2, depth: .9, height: .82, color: '#bfa98b' },
    { name: 'Table', kind: 'table', width: 1.6, depth: .9, height: .75, color: '#aa794e' },
    { name: 'Lit double', kind: 'bed', width: 1.6, depth: 2, height: .65, color: '#c5c4b3' },
    { name: 'Fauteuil', kind: 'chair', width: .8, depth: .8, height: .85, color: '#818b7c' },
    { name: 'Rangement', kind: 'cabinet', width: 1.2, depth: .45, height: 1.8, color: '#b9a180' },
    { name: 'Îlot cuisine', kind: 'island', width: 1.8, depth: .9, height: .92, color: '#d2caba' },
];
export { exampleProject } from './example-plan.js';
export function bounds(p) {
    const points = p.walls.flatMap(w => [w.a, w.b]);
    p.items.forEach(i => { const r = Math.hypot(i.width, i.depth) / 2; points.push({ x: i.x - r, y: i.y - r }, { x: i.x + r, y: i.y + r }); });
    if (p.background)
        points.push({ x: 0, y: 0 }, { x: p.background.width, y: p.background.height });
    if (!points.length)
        points.push({ x: 0, y: 0 }, { x: 10, y: 8 });
    const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
    return { x, y, width: Math.max(2, Math.max(...points.map(p => p.x)) - x), height: Math.max(2, Math.max(...points.map(p => p.y)) - y) };
}
export function moveEntity(p, id, dx, dy) {
    return { ...p, walls: p.walls.map(w => w.id === id ? { ...w, a: { x: round(w.a.x + dx), y: round(w.a.y + dy) }, b: { x: round(w.b.x + dx), y: round(w.b.y + dy) } } : w), items: p.items.map(i => i.id === id ? { ...i, x: round(i.x + dx), y: round(i.y + dy) } : i) };
}
export function rescale(p, factor) {
    return { ...p, calibrated: true, background: p.background ? { ...p.background, width: p.background.width * factor, height: p.background.height * factor } : null, walls: p.walls.map(w => ({ ...w, a: { x: w.a.x * factor, y: w.a.y * factor }, b: { x: w.b.x * factor, y: w.b.y * factor }, openings: w.openings.map(o => ({ ...o, width: o.width * factor })) })), items: p.items.map(i => ({ ...i, x: i.x * factor, y: i.y * factor })), labels: p.labels.map(l => ({ ...l, x: l.x * factor, y: l.y * factor })) };
}
export function validateProject(value) {
    const p = projectSchema.parse(value);
    const ids = [...p.walls, ...p.items, ...p.walls.flatMap(w => w.openings)].map(o => o.id);
    if (new Set(ids).size !== ids.length)
        throw new Error('Identifiants dupliqués dans le projet.');
    if (p.walls.some(w => length(w) < .05))
        throw new Error('Un mur est trop court.');
    if (p.items.some(i => i.kind === 'custom' && (!i.assetId || !p.assets[i.assetId])))
        throw new Error('Un modèle 3D est manquant.');
    return p;
}
