import { readFile } from 'node:fs/promises';
const dir = new URL('file:///Users/vincenttribouillois/Sites/localhost/Conceptuo-Atelier-3D/.sites-runtime/tests/');
const { wallObject, exportGlb, validateGlb } = await import(new URL('scene.js', dir));
const { validateProject } = await import(new URL('model.js', dir));
globalThis.FileReader = class { readAsArrayBuffer(b) { b.arrayBuffer().then(r => { this.result = r; this.onloadend?.() }) } };
globalThis.ProgressEvent = class { constructor(t, i) { this.type = t; Object.assign(this, i) } };
const project = validateProject(JSON.parse(await readFile('/Users/vincenttribouillois/Sites/localhost/Conceptuo-Atelier-3D/.sites-runtime/pdf/plan.json', 'utf8')));
const THREE = await import('three');
const group = new THREE.Group();
let boxes = 0;
for (const w of project.walls) { const o = wallObject(w); group.add(o); boxes += o.children.length || 1; }
console.log(`${project.walls.length} murs → ${boxes} volumes 3D`);
const blob = await exportGlb(project);
console.log(`GLB exporté (${blob.type})`);
await validateGlb(blob);
console.log('GLB relu sans erreur');
