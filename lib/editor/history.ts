// Historique d'annulation enregistré sur l'appareil. Chaque état porte l'image du plan (jusqu'à
// 8 Mo) et les modèles GLB : 30 copies brutes seraient trop lourdes. Ces contenus sont donc
// rangés une seule fois dans `blobs`, et les états n'en gardent que la clé.
// Module pur, testé dans Node (tests/core.mjs).
import type { Project } from './model';

type Packed = Omit<Project, 'background' | 'assets'> & { background: (Omit<NonNullable<Project['background']>, 'data'> & { data: string }) | null; assets: Record<string, string> };
export type PackedHistory = { past: Packed[]; future: Packed[]; blobs: Record<string, string> };

export function packHistory(past: Project[], future: Project[]): PackedHistory {
    const keys = new Map<string, string>(), blobs: Record<string, string> = {};
    const key = (content: string) => {
        let k = keys.get(content);
        if (!k) { k = `b${keys.size}`; keys.set(content, k); blobs[k] = content; }
        return k;
    };
    const pack = (p: Project): Packed => ({
        ...p,
        background: p.background ? { ...p.background, data: key(p.background.data) } : null,
        assets: Object.fromEntries(Object.entries(p.assets).map(([id, data]) => [id, key(data)])),
    });
    return { past: past.map(pack), future: future.map(pack), blobs };
}

/** Inverse de packHistory. Un état dont un contenu manque est écarté, avec ceux qui le
 *  précèdent (côté passé) ou le suivent (côté futur) : l'historique reste continu. */
export function unpackHistory(h: PackedHistory): { past: Project[]; future: Project[] } {
    const unpack = (p: Packed): Project | null => {
        const data = p.background ? h.blobs[p.background.data] : undefined;
        if (p.background && data === undefined) return null;
        const assets: Record<string, string> = {};
        for (const [id, k] of Object.entries(p.assets)) { if (h.blobs[k] === undefined) return null; assets[id] = h.blobs[k]; }
        return { ...p, background: p.background ? { ...p.background, data: data! } : null, assets } as Project;
    };
    const past: Project[] = [], future: Project[] = [];
    for (const p of [...(h.past ?? [])].reverse()) { const q = unpack(p); if (!q) break; past.unshift(q); }
    for (const p of h.future ?? []) { const q = unpack(p); if (!q) break; future.push(q); }
    return { past, future };
}
