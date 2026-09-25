import { z } from 'zod';
import { type Wall, type Project } from './model';
const coordinate = z.number().finite().min(0).max(1000);
export const analysisSchema = z.object({ walls: z.array(z.object({ x1: coordinate, y1: coordinate, x2: coordinate, y2: coordinate, openings: z.array(z.object({ kind: z.enum(['door', 'window']), offset: z.number().min(0).max(1), fraction: z.number().min(.01).max(.95) })).max(12) })).max(200), rooms: z.array(z.object({ name: z.string().max(80), x: coordinate, y: coordinate })).max(50), warnings: z.array(z.string().max(500)).max(20) });
const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const num = { type: 'number' };
export const analysisJsonSchema = obj({
    walls: { type: 'array', items: obj({ x1: num, y1: num, x2: num, y2: num, openings: { type: 'array', items: obj({ kind: { type: 'string', enum: ['door', 'window'] }, offset: num, fraction: num }) } }) },
    rooms: { type: 'array', items: obj({ name: { type: 'string' }, x: num, y: num }) },
    warnings: { type: 'array', items: { type: 'string' } }
});
export function convertAnalysis(value: unknown, p: Project): Project {
    if (!p.background)
        throw new Error('Importez un plan.');
    const data = analysisSchema.parse(value);
    if (!data.walls.length)
        throw new Error('Aucun mur détecté. Essayez une page plus lisible ou tracez les murs.');
    const { width, height } = p.background;
    const walls: Wall[] = data.walls.map((w, i) => { const a = { x: w.x1 / 1000 * width, y: w.y1 / 1000 * height }, b = { x: w.x2 / 1000 * width, y: w.y2 / 1000 * height }, len = Math.hypot(b.x - a.x, b.y - a.y); return { id: crypto.randomUUID(), name: `Mur ${i + 1}`, a, b, height: 2.6, thickness: .15, openings: w.openings.map(o => ({ id: crypto.randomUUID(), kind: o.kind, offset: o.offset, width: Math.min(8, Math.max(.2, len * o.fraction)), height: o.kind === 'door' ? 2.1 : 1.2, sill: o.kind === 'door' ? 0 : .9 })) }; }).filter(w => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) > .1);
    if (!walls.length)
        throw new Error('La détection ne contient aucun mur exploitable.');
    return { ...p, walls, items: [], labels: data.rooms.map(r => ({ name: r.name, x: r.x / 1000 * width, y: r.y / 1000 * height })) };
}
