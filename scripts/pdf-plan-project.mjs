// Diagnostic : superpose au PDF le projet produit (murs en rouge, portes en vert, fenêtres en bleu).
//   node scripts/pdf-plan-project.mjs <pdf> <page> <sortie.png> [x0,y0,x1,y1 en pt]
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const { readPlan } = await import('./pdf-plan-check.mjs');
const { wallPath, pointAt } = await import('../.sites-runtime/pdf/arc.js');
const [file, n, out, crop] = process.argv.slice(2);
const { V, page } = await readPlan(file, Number(n));
const { project, report } = V.planFromPage(page, 'x');
execFileSync('pdftoppm', ['-r', '144', '-f', n, '-l', n, '-png', '-singlefile', file, '/tmp/_page_' + process.pid], { stdio: 'ignore' });
const k = 1 / report.scale;   // points par mètre
const [x0, y0, x1, y1] = (crop ?? `0,0,${page.width},${page.height}`).split(',').map(Number);
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" width="1800" height="${Math.round(1800 * (y1 - y0) / (x1 - x0))}"><image href="file:///tmp/_page_${process.pid}.png" x="0" y="0" width="${page.width}" height="${page.height}" opacity=".45"/>`;
const scaled = w => ({ ...w, a: { x: w.a.x * k, y: w.a.y * k }, b: { x: w.b.x * k, y: w.b.y * k } });
for (const w of project.walls) {
  svg += `<path d="${wallPath(scaled(w))}" fill="none" stroke="${w.angle ? '#c0c' : '#d22'}" stroke-opacity=".55" stroke-width="${w.thickness * k}"/>`;
  const s = scaled(w), L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) && (await import('../.sites-runtime/pdf/arc.js')).wallLength(s);
  for (const o of w.openings) { const at = pointAt(s, o.offset * L), h = o.width * k / 2, ux = Math.cos(at.heading), uy = Math.sin(at.heading);
    svg += `<line x1="${at.point.x - ux * h}" y1="${at.point.y - uy * h}" x2="${at.point.x + ux * h}" y2="${at.point.y + uy * h}" stroke="${o.kind === 'door' ? '#0a4' : '#26d'}" stroke-width="${w.thickness * k + 3}"/>`; }
}
// bouts de mur libres (aucun autre mur raccordé) : pastille orange
const { junctions } = await import('../.sites-runtime/pdf/joints.js');
for (const n of junctions(project.walls)) if (n.ends.length === 1 && !n.hosts.length) svg += `<circle cx="${n.point.x * k}" cy="${n.point.y * k}" r="2.2" fill="#f80"/>`;
for (const l of project.labels) svg += `<text x="${l.x * k}" y="${l.y * k}" font-size="7" font-family="Helvetica" text-anchor="middle">${l.name.replace(/[<&]/g, '')}</text>`;
await writeFile(out, svg + '</svg>');
console.log(`${project.walls.length} murs, ${project.walls.flatMap(w => w.openings).filter(o => o.kind === 'door').length} portes, ${project.walls.flatMap(w => w.openings).filter(o => o.kind === 'window').length} fenêtres`);
