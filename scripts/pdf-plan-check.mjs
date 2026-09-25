// Banc d'essai hors application : lit un vrai PDF d'architecte, reconstruit le plan
// et confronte chaque surface calculée à la surface imprimée sur le document.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';
const dir = new URL('../.sites-runtime/pdf/', import.meta.url);
await mkdir(dir, { recursive: true });
for (const name of ['arc', 'model', 'joints', 'wall-trace', 'pdf-vector']) {
    const src = await readFile(new URL(`../lib/editor/${name}.ts`, import.meta.url), 'utf8');
    await writeFile(new URL(`${name}.js`, dir), ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText.replaceAll("'./model'", "'./model.js'").replaceAll("'./arc'", "'./arc.js'").replaceAll("'./joints'", "'./joints.js'").replaceAll("'./wall-trace'", "'./wall-trace.js'").replaceAll("'./example-plan'", "'./example-plan.js'").replaceAll("'./example-plan-2'", "'./example-plan-2.js'"));
}
// les exemples sont justement ce que ce banc régénère : on les remplace par des bouchons
await writeFile(new URL('example-plan.js', dir), 'export const exampleProject=()=>({});export const exampleRooms=[];');
await writeFile(new URL('example-plan-2.js', dir), 'export const exampleProject2=()=>({});export const exampleRooms2=[];');
const V = await import(new URL('pdf-vector.js', dir));
const { validateProject } = await import(new URL('model.js', dir));
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

export async function readPlan(file, pageNumber = 1) {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await readFile(file)), isEvalSupported: false, verbosity: 0 }).promise;
    return { V, pages: doc.numPages, page: await vectorsOf(doc, pageNumber) };
}

async function vectorsOf(doc, pageNumber) {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const ops = await page.getOperatorList(), content = await page.getTextContent();
    return { width: viewport.width, height: viewport.height,
        strokes: V.strokesFrom(ops.fnArray, ops.argsArray, viewport.transform),
        texts: V.textsFrom(content.items.filter(i => 'str' in i), viewport.transform) };
}

// rapport seulement quand le banc est lancé directement, pas quand un script l'importe
if (process.argv[2] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const file = process.argv[2];
    let pageNumber = Number(process.argv[3]) || 0;
    if (!pageNumber) {
        // sans numéro : on passe toutes les pages en revue et on garde la plus riche en pièces
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await readFile(file)), isEvalSupported: false, verbosity: 0 }).promise;
        console.log(`${doc.numPages} page(s)`);
        let best = 0, bestScore = -1;
        for (let n = 1; n <= doc.numPages; n++) {
            const page = await vectorsOf(doc, n);
            const summary = `   page ${String(n).padStart(2)} : ${String(page.strokes.length).padStart(6)} segments, ${String(page.texts.length).padStart(4)} textes`;
            if (page.strokes.length < 40) { console.log(`${summary} — pas de tracé vectoriel`); continue; }
            const { project, report } = V.planFromPage(page, 'p');
            const closed = report.rooms.filter(r => r.computed !== null && Math.abs(r.computed - (r.zone?.printed ?? r.printed)) <= Math.max(.02, (r.zone?.printed ?? r.printed) * .02)).length;
            console.log(`${summary} — ${project.walls.length} murs, ${closed}/${report.rooms.length} pièces à moins de 2 %, échelle ${report.scaleSource ?? 'absente'}`);
            const score = closed * 100 + report.rooms.length * 10 + Math.min(project.walls.length, 99);
            if (project.walls.length >= 4 && score > bestScore) { best = n; bestScore = score; }
        }
        if (!best) { console.log('\naucune page ne porte de plan exploitable'); process.exit(0); }
        pageNumber = best;
        console.log(`\n→ détail de la page ${best}`);
    }
    const { page } = await readPlan(file, pageNumber);
    const { project, report } = V.planFromPage(page, file.split('/').pop().replace(/\.pdf$/i, ''));
    const pt = 25.4 / 72 / 1000;
    console.log(`\n${page.width.toFixed(0)}×${page.height.toFixed(0)} pt — ${page.strokes.length} segments, ${page.texts.length} textes`);
    console.log(`échelle 1/${Math.round(report.scale / pt)} (${report.scaleSource ?? 'défaut'})   hauteur sous plafond ${report.ceiling ?? '?'} m`);
    console.log(`\npièces imprimées : ${report.rooms.length}`);
    let ok = 0, worst = 0;
    for (const r of report.rooms) {
        if (r.computed === null) { console.log(`   ${r.name.padEnd(12)} ${r.printed.toFixed(2).padStart(6)} m²   AUCUNE PIÈCE FERMÉE`); continue; }
        const ref = r.zone ? r.zone.printed : r.printed;
        const gap = (r.computed / ref - 1) * 100;
        const good = Math.abs(gap) <= 2 || Math.abs(r.computed - ref) < .02;
        if (good) ok++;
        worst = Math.max(worst, Math.abs(gap));
        const label = r.zone ? `${r.printed.toFixed(2).padStart(6)} m², volume ouvert avec ${r.zone.with.join(', ')} : ${r.zone.printed.toFixed(2)} imprimés →` : `${r.printed.toFixed(2).padStart(6)} m² imprimés →`;
        console.log(`   ${r.name.padEnd(12)} ${label} ${r.computed.toFixed(2).padStart(6)} calculés   ${gap >= 0 ? '+' : ''}${gap.toFixed(1)} %  ${good ? '✓' : '✗'}`);
    }
    console.log(`\n${ok}/${report.rooms.length} pièces à moins de 2 % — écart maximal ${worst.toFixed(1)} %`);
    console.log(`murs : ${report.walls}   ouvertures : ${report.bays} pour ${report.annotated} annotations La:`);
    const doors = project.walls.flatMap(w => w.openings).filter(o => o.kind === 'door').length;
    console.log(`   dont ${doors} portes et ${project.walls.flatMap(w => w.openings).length - doors} fenêtres`);
    const f = report.fidelity;
    console.log(`\nfidélité des murs (à 1 cm près${f.zones ? `, ${f.zones} zones de pièces lues` : ''}) : précision ${(f.precision * 100).toFixed(1)} %, rappel ${(f.recall * 100).toFixed(1)} %`);
    for (const x of f.faults) console.log(`   ${x.kind.padEnd(9)} ${(x.area * 1e4).toFixed(0).padStart(5)} cm²  vers (${x.x.toFixed(2)}, ${x.y.toFixed(2)}) m`);
    console.log(`bouts orphelins : ${f.orphans}   murs de moins de 10 cm : ${f.short}`);
    try { validateProject(project); console.log('validateProject : OK'); }
    catch (e) { console.log(`validateProject : ÉCHEC — ${e.message}`); }
    if (report.warnings.length) { console.log('\navertissements :'); for (const w of report.warnings) console.log(`   • ${w}`); }
    await writeFile(new URL('plan.json', dir), JSON.stringify(project, null, 1));
    console.log(`\nprojet écrit dans .sites-runtime/pdf/plan.json`);
}
