// Régénère les plans d'exemple à partir de PDF d'architecte, par la même extraction
// vectorielle que l'import de l'application :
//   node scripts/build-example-plan.mjs          → les deux exemples
//   node scripts/build-example-plan.mjs 2        → l'exemple 2 seulement
import { writeFile } from 'node:fs/promises';
const { readPlan } = await import('./pdf-plan-check.mjs');
const { validateProject } = await import('../.sites-runtime/pdf/model.js');

const EXAMPLES = [
    { n: 1, source: 'tests/fixtures/plan-exemple.pdf', page: 1, out: 'lib/editor/example-plan.ts', suffix: '', label: 'Lefebvre' },
    { n: 2, source: 'tests/fixtures/plan-exemple-2.pdf', page: 1, out: 'lib/editor/example-plan-2.ts', suffix: '2', label: 'Mamoun, plan existant' },
];
for (const ex of EXAMPLES.filter(e => !process.argv[2] || String(e.n) === process.argv[2])) await build(ex);

async function build({ source, page: pageNumber, out, suffix, label }) {
    const { V, page } = await readPlan(source, pageNumber);
    const { project, report } = V.planFromPage(page, 'exemple');

    // on recale le plan près de l'origine, à 50 cm des murs, au millimètre : les bouts d'un même
    // angle restent confondus, et un raccord en T reste sur l'axe de son hôte
    const points = project.walls.flatMap(w => [w.a, w.b]);
    const dx = .5 - Math.min(...points.map(p => p.x)), dy = .5 - Math.min(...points.map(p => p.y));
    const mm = n => Math.round(n * 1000) / 1000;
    const shift = p => ({ x: mm(p.x + dx), y: mm(p.y + dy) });
    const walls = project.walls.map((w, i) => ({ ...w, id: `mur-${i + 1}`, name: `Mur ${i + 1}`, a: shift(w.a), b: shift(w.b),
        openings: w.openings.map((o, k) => ({ ...o, id: `baie-${i + 1}-${k + 1}` })) }));
    const labels = project.labels.map(l => ({ ...l, ...shift(l) }));
    const total = report.rooms.reduce((n, r) => n + r.printed, 0);
    const example = validateProject({ ...project, name: `Appartement ${Math.round(total)} m² — ${label}`, walls, labels });
    // `zone` : surface imprimée cumulée quand la pièce partage un volume ouvert avec d'autres
    const rooms = report.rooms.map(r => ({ name: r.name, area: r.printed, computed: r.computed === null ? null : mm(r.computed), ...(r.zone ? { zone: mm(r.zone.printed) } : {}) }));

    const json = v => JSON.stringify(v).replace(/"(\w+)":/g, '$1:');
    await writeFile(out, `// Plan d'exemple GÉNÉRÉ — ne pas éditer à la main.
// Source : ${source}, page ${pageNumber}, relu par l'extraction vectorielle (pdf-vector.ts), échelle
// 1/${Math.round(report.scale / (25.4 / 72 / 1000))} lue au cartouche, hauteur sous plafond ${report.ceiling ?? '?'} m lue sur le plan.
// Pour le régénérer : node scripts/build-example-plan.mjs${suffix ? ' ' + suffix : ''}
// a/b = AXE de chaque mur : le trait 2D et la boîte 3D sont centrés dessus.
import { type Project, type Wall } from './model';

const NAME = ${JSON.stringify(example.name)};
const WALLS: Wall[] = [
${example.walls.map(w => '    ' + json(w)).join(',\n')}
];
const LABELS = ${json(example.labels)};

/** Surfaces imprimées sur le plan et surfaces retrouvées par l'extraction (null : pièce non fermée ;
 *  zone : surface imprimée cumulée du volume ouvert que la pièce partage). */
const ROOMS: { name: string; area: number; computed: number | null; zone?: number }[] = ${json(rooms)};

export function exampleRooms${suffix}() {
    return ROOMS.map(r => ({ ...r }));
}

export function exampleProject${suffix}(): Project {
    return { version: 1, name: NAME, walls: structuredClone(WALLS), items: [], labels: LABELS.map(l => ({ ...l })), background: null, calibrated: true, assets: {} };
}
`);
    console.log(`${out} : ${example.walls.length} murs, ${example.walls.flatMap(w => w.openings).length} baies, ${example.labels.length} pièces`);
}
