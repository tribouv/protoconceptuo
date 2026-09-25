import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import ts from 'typescript';
// Compile the same production modules for a Node-based geometry/API check.
const directory=new URL('../.sites-runtime/tests/',import.meta.url);await mkdir(directory,{recursive:true});
for(const name of ['arc','model','joints','wall-trace','example-plan','example-plan-2','analysis','scene','openings','remote','product','pdf-vector','units','edits','rooms','changes','history']){const source=await readFile(new URL(`../lib/editor/${name}.ts`,import.meta.url),'utf8');const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replaceAll("'./model'","'./model.js'").replaceAll("'./arc'","'./arc.js'").replaceAll("'./joints'","'./joints.js'").replaceAll("'./wall-trace'","'./wall-trace.js'").replaceAll("'./example-plan'","'./example-plan.js'").replaceAll("'./example-plan-2'","'./example-plan-2.js'").replaceAll("'./pdf-vector'","'./pdf-vector.js'").replaceAll("'./remote'","'./remote.js'").replaceAll("'./openings'","'./openings.js'").replaceAll("'./edits'","'./edits.js'").replaceAll("'./rooms'","'./rooms.js'");await writeFile(new URL(`${name}.js`,directory),js)}
const routeSource=await readFile(new URL('../app/api/analyze/route.ts',import.meta.url),'utf8');await writeFile(new URL('route.js',directory),ts.transpileModule(routeSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replaceAll("'@/lib/editor/analysis'","'./analysis.js'"));
const {exampleProject,validateProject,moveEntity,rescale,length,catalog,round}=await import(new URL('model.js',directory));
const {exampleRooms}=await import(new URL('example-plan.js',directory));
const {convertAnalysis}=await import(new URL('analysis.js',directory));
const {wallObject,exportGlb,validateGlb,loadAsset,disposeObject}=await import(new URL('scene.js',directory));
const THREE=await import('three');
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.()})}readAsDataURL(blob){blob.arrayBuffer().then(result=>{this.result=`data:${blob.type};base64,${Buffer.from(result).toString('base64')}`;this.onloadend?.()})}};
globalThis.ProgressEvent=class{constructor(type,init){this.type=type;Object.assign(this,init)}};
const p=validateProject(exampleProject());
assert.equal(p.items.length,0,'Le plan de base est livré nu');assert.equal(p.background,null);assert.equal(p.labels.length,9,'9 pièces imprimées sur le PDF');
const seenAxes=new Set();
for(const w of p.walls){
 assert.equal(w.height,2.73,`${w.id} : hauteur sous plafond du plan (Hsp 2.73m) non reprise`);
 const key=`${w.a.x},${w.a.y},${w.b.x},${w.b.y}`,reversed=`${w.b.x},${w.b.y},${w.a.x},${w.a.y}`;
 assert.ok(!seenAxes.has(key)&&!seenAxes.has(reversed),`${w.id} : mur en double, invisible en 2D et z-fighting en 3D`);seenAxes.add(key);
 const span=length(w);
 const bays=[];
 for(const o of w.openings){
  const from=o.offset*span-o.width/2,to=o.offset*span+o.width/2;
  assert.ok(from>=-1e-9&&to<=span+1e-9,`${o.id} déborde de ${w.id} et serait rogné en silence`);
  assert.ok(o.sill+o.height<=w.height+1e-9,`${o.id} : allège + hauteur dépasse ${w.height} m sur ${w.id}`);
  // Un jambage d'au moins 10 cm à chaque bout : sans lui la baie meurt dans l'angle,
  // derrière le retour de la façade perpendiculaire, et le jour passe au travers.
  assert.ok(from>=.1-1e-9&&to<=span-.1+1e-9,`${o.id} : jambage insuffisant à l'extrémité de ${w.id}`);
  bays.push({id:o.id,from,to});
 }
 // Deux baies qui se chevauchent fusionnent en un seul percement, sans appui ni trumeau.
 bays.sort((a,b)=>a.from-b.from);
 for(let k=1;k<bays.length;k++)assert.ok(bays[k].from>=bays[k-1].to-1e-9,`${bays[k-1].id} et ${bays[k].id} se chevauchent sur ${w.id} : les percements fusionnent`);
}
const rooms=exampleRooms();
assert.ok(rooms.filter(r=>r.computed!==null).length>=8,'au moins 8 pièces sur 9 retrouvées fermées');
// les 9 pièces à moins de 2 % de leur surface imprimée (le placard de 15 cm compris), chacune fermée
const within=rooms.filter(r=>r.computed!==null&&Math.abs(r.computed-r.area)<=Math.max(.02,r.area*.02));
assert.ok(within.length>=9,`seulement ${within.length}/9 pièces à moins de 2 % : ${rooms.map(r=>`${r.name} ${r.computed?.toFixed(2)}/${r.area}`).join(', ')}`);
// exemple 2 (Mamoun, dossier ArchiCAD aux calques aplatis) : mêmes garde-fous que tout
// projet — ids uniques, baies contenues dans leur mur avec jambages, sans chevauchement
{
 const {exampleProject2,exampleRooms2}=await import(new URL('example-plan-2.js',directory));
 const p2=validateProject(exampleProject2());
 assert.equal(p2.background,null);assert.equal(p2.labels.length,10,'10 pièces imprimées');
 assert.ok(p2.labels.some(l=>l.name.startsWith('Chambre 2')),'un nom de pièce peut contenir un chiffre');
 assert.ok(p2.walls.every(w=>w.height===2.9),'hauteur sous plafond médiane du plan (2,90 m)');
 for(const w of p2.walls){const span=length(w),bays=w.openings.map(o=>({id:o.id,from:o.offset*span-o.width/2,to:o.offset*span+o.width/2,o})).sort((a,b)=>a.from-b.from);
  for(const b of bays){assert.ok(b.from>=.1-1e-9&&b.to<=span-.1+1e-9,`${b.id} : jambage insuffisant sur ${w.id}`);assert.ok(b.o.sill+b.o.height<=w.height+1e-9,`${b.id} dépasse la hauteur de ${w.id}`);}
  for(let k=1;k<bays.length;k++)assert.ok(bays[k].from>=bays[k-1].to-1e-9,`${bays[k-1].id} et ${bays[k].id} se chevauchent`);}
 const exact=exampleRooms2().filter(r=>r.computed!==null&&Math.abs(r.computed-(r.zone??r.area))<=Math.max(.02,(r.zone??r.area)*.02));
 assert.ok(exact.length>=9,`seulement ${exact.length}/10 pièces à moins de 2 % de leur surface imprimée`);
}
// un mur seul se translate ; raccordé, il entraîne ses voisins (voir les tests de jonctions)
const solo=validateProject({...p,walls:[{...p.walls[0],a:{x:1,y:1},b:{x:4,y:1.5},openings:[]}]});
const moved=moveEntity(solo,solo.walls[0].id,1.2,-.4);assert.equal(moved.walls[0].a.x,round(solo.walls[0].a.x+1.2));assert.equal(moved.walls[0].a.y,round(solo.walls[0].a.y-.4));assert.ok(Math.abs(length(moved.walls[0])-length(solo.walls[0]))<1e-9);
moveEntity(p,p.walls[0].id,1.2,-.4);assert.equal(p.walls[0].a.x,exampleProject().walls[0].a.x,'le projet d’origine ne doit pas être muté');
const furnished=validateProject({...p,items:[{...catalog[0],id:'item-rescale',x:1.6,y:1,rotation:0}]});
const scaled=rescale(furnished,2);assert.equal(length(scaled.walls[0]),length(furnished.walls[0])*2);assert.equal(scaled.items[0].width,furnished.items[0].width);assert.equal(scaled.items[0].x,furnished.items[0].x*2);assert.equal(scaled.labels[0].x,furnished.labels[0].x*2);
assert.throws(()=>validateProject({...p,walls:[p.walls[0],p.walls[0]]}));
const sample={walls:[{x1:100,y1:200,x2:900,y2:200,openings:[{kind:'door',offset:.5,fraction:.1}]}],rooms:[{name:'Séjour',x:500,y:500}],warnings:[]};
const analyzed=convertAnalysis(sample,{...p,background:{data:'data:image/jpeg;base64,AA==',width:10,height:6,fileName:'test',page:1}});assert.equal(analyzed.walls[0].a.x,1);assert.ok(Math.abs(analyzed.walls[0].a.y-1.2)<1e-9);assert.equal(length(analyzed.walls[0]),8);assert.ok(Math.abs(analyzed.walls[0].openings[0].width-.8)<1e-9);assert.equal(analyzed.labels[0].y,3);
assert.throws(()=>convertAnalysis({...sample,walls:[{...sample.walls[0],x1:1001}]},analyzed));
const w={id:'test',name:'Test',a:{x:0,y:0},b:{x:4,y:0},thickness:.2,height:2.6,openings:[{id:'door',kind:'door',offset:.5,width:1,height:2.1,sill:0}]};
const object=wallObject(w);object.updateMatrixWorld(true);
const ray=new THREE.Raycaster(new THREE.Vector3(2,1,2),new THREE.Vector3(0,0,-1));assert.equal(ray.intersectObject(object,true).length,0,'Door must be an actual opening');ray.set(new THREE.Vector3(2,2.4,2),new THREE.Vector3(0,0,-1));assert.ok(ray.intersectObject(object,true).length>0,'Lintel must remain');disposeObject(object);
const buffer=await exportGlb(furnished);validateGlb(buffer);const dv=new DataView(buffer),json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,dv.getUint32(12,true))));const entities=json.nodes.filter(n=>n.extras?.entityId&&n.extras.kind!=='opening');assert.equal(entities.length,furnished.walls.length+furnished.items.length,'Walls and products must remain separate GLB nodes');assert.ok(!JSON.stringify(json).includes('apiKey'));
const loaded=await loadAsset(`data:model/gltf-binary;base64,${Buffer.from(buffer).toString('base64')}`);assert.ok(loaded.children.length>0);disposeObject(loaded);assert.throws(()=>validateGlb(new ArrayBuffer(20)));
const {POST}=await import(new URL('route.js',directory));
const request=body=>new Request('http://localhost/api/analyze',{method:'POST',headers:{'Content-Type':'application/json',origin:'http://localhost'},body:JSON.stringify(body)});
assert.equal((await POST(request({image:'data:image/jpeg;base64,AA=='}))).status,400);
assert.equal((await POST(new Request('http://localhost/api/analyze',{method:'POST',headers:{origin:'https://elsewhere.test'},body:'{}'}))).status,403);
const originalFetch=globalThis.fetch;let payload;
globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');payload=JSON.parse(options.body);return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(sample)}]}]})};
const response=await POST(request({key:'test-not-a-real-key',image:'data:image/jpeg;base64,AA==',model:'gpt-4.1'}));assert.equal(response.status,200);assert.equal(payload.store,false);assert.equal(payload.text.format.strict,true);assert.equal((await response.json()).walls.length,1);
globalThis.fetch=async()=>Response.json({error:'rate limit'},{status:429});assert.equal((await POST(request({key:'test',image:'data:image/jpeg;base64,AA=='}))).status,502);globalThis.fetch=originalFetch;
console.log('PASS: movement, calibration, validation, AI coordinates, real wall openings, GLB export/re-import with independent objects, and API success/error handling.');

const {moveOpening,openingSelection,openingCenter,projectedOffset}=await import(new URL('openings.js',directory));
// projet de test autonome : un mur vertical descendant de 4 m portant une porte au premier tiers
const doorPlan=validateProject({...p,walls:[{id:'mur-porte',name:'Mur porte',a:{x:0,y:0},b:{x:0,y:4},thickness:.1,height:2.5,openings:[{id:'door-1',kind:'door',offset:.3,width:.8,height:2.1,sill:0}]}],labels:[]});
const source=openingSelection(doorPlan,'door-1');assert.ok(source,'door-1 introuvable');const movedDoor=moveOpening(doorPlan,'door-1',{x:20,y:5});const movedSelection=openingSelection(movedDoor,'door-1');assert.equal(movedSelection.wall.id,source.wall.id);assert.ok(movedSelection.opening.offset>.7);assert.deepEqual(movedSelection.wall.a,source.wall.a);assert.deepEqual(movedDoor.items,doorPlan.items);
const clamped=moveOpening(doorPlan,'door-1',{x:5,y:500});const end=openingSelection(clamped,'door-1');assert.ok(end.opening.offset<1);assert.ok(Math.abs(end.opening.offset-(1-end.opening.width/(2*length(end.wall))))<1e-8);
const {extractProductPage}=await import(new URL('product.js',directory));
const {permittedUrl,retailerHosts,fetchTrusted}=await import(new URL('remote.js',directory));
assert.throws(()=>permittedUrl('http://127.0.0.1/',retailerHosts));assert.throws(()=>permittedUrl('https://ikea.com.evil.test/',retailerHosts));assert.throws(()=>permittedUrl('https://www.ikea.com:8443/',retailerHosts));
const fixture='<title>Table</title><meta property="og:image" content="https://www.ikea.com/photo.jpg"><script type="application/ld+json">{"@type":"Product","name":"Table","image":"https://www.ikea.com/second.jpg","width":{"value":55,"unitCode":"CMT"}}</script><div>Hauteur 45 cm</div>';
const info=extractProductPage(fixture,'https://www.ikea.com/fr/fr/p/table/');assert.equal(info.images.length,2);assert.ok(info.structured.includes('55'));assert.ok(info.text.includes('45 cm'));
for(const name of ['product','generate-product']){const source=await readFile(new URL(`../app/api/${name}/route.ts`,import.meta.url),'utf8');await writeFile(new URL(name+'-route.js',directory),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replaceAll("'@/lib/editor/remote'","'./remote.js'").replaceAll("'@/lib/editor/product'","'./product.js'"));}
const {POST:generate}=await import(new URL('generate-product-route.js',directory));let captured;
globalThis.fetch=async(url,options)=>{captured={url,body:options.body?JSON.parse(options.body):null};return Response.json({result:'task-test-1'})};
let generated=await generate(request({action:'start',key:'meshy-test-key',image:'data:image/jpeg;base64,AA=='}));assert.equal(generated.status,200);assert.equal((await generated.json()).id,'task-test-1');assert.equal(captured.body.enable_pbr,true);assert.equal(captured.body.should_texture,true);assert.equal(captured.body.target_formats[0],'glb');
globalThis.fetch=async()=>Response.json({status:'IN_PROGRESS',progress:42});generated=await generate(request({action:'status',key:'meshy-test-key',id:'task-test-1'}));assert.equal((await generated.json()).progress,42);
globalThis.fetch=async()=>Response.json({error:'payment'},{status:402});generated=await generate(request({action:'start',key:'meshy-test-key',image:'data:image/jpeg;base64,AA=='}));assert.equal(generated.status,422);assert.ok((await generated.json()).error.includes('Crédits'));
globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/secret'}});await assert.rejects(()=>fetchTrusted('https://www.ikea.com/product',retailerHosts,10000));
globalThis.fetch=originalFetch;
console.log('PASS: opening drag projection and endpoint clamping, retailer extraction and URL boundaries, Meshy start/status/payment error.');

// A display name must never silently fall back to another paid model.
assert.equal((await POST(request({key:'test',image:'data:image/jpeg;base64,AA==',model:'ChatGPT 6 Astra'}))).status,400);
globalThis.fetch=async(url,options)=>{payload=JSON.parse(options.body);return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(sample)}]}]})};
const astraResponse=await POST(request({key:'test',image:'data:image/jpeg;base64,AA==',model:'gpt-6-astra'}));
assert.equal(astraResponse.status,200);assert.equal(payload.model,'gpt-6-astra');assert.equal(payload.reasoning.effort,'high');assert.equal((await astraResponse.json()).modelUsed,'gpt-6-astra');globalThis.fetch=originalFetch;
console.log('PASS: exact Astra model, reasoning configuration, model reporting, invalid name rejected.');

// --- extraction vectorielle : un plan de synthèse aux cotes connues ---
const {planFromPage,printedScale,printedCeiling,printedRooms,annotations}=await import(new URL('pdf-vector.js',directory));
const PT=25.4/72/1000*80;                       // 1 point PDF à l'échelle 1/80, en mètres
const pt=m=>m/PT;
const stroke=(x0,y0,x1,y1)=>({x0:pt(x0),y0:pt(y0),x1:pt(x1),y1:pt(y1),gray:0,width:.5,curved:false});
const rect=(x0,y0,x1,y1)=>[stroke(x0,y0,x1,y0),stroke(x1,y0,x1,y1),stroke(x1,y1,x0,y1),stroke(x0,y1,x0,y0)];
const label=(text,x,y,size=.14)=>({text,x:pt(x),y:pt(y),size:pt(size),angle:0});
// (page de 12 × 9 m à l'échelle : un plan réel a des marges, et le filtre du cartouche écarte
// les traits qui barrent presque toute la page)
const synthetic={width:pt(12),height:pt(9),
 strokes:[...rect(0,0,6,4),...rect(.2,.2,5.8,3.8),stroke(2.45,.2,2.45,3.8),stroke(2.55,.2,2.55,3.8)],
 texts:[label('Sejour',1.3,1.9),label('8.10 m²',1.3,2.1,.1),label('Chambre',4.2,1.9),label('11.70 m²',4.2,2.1,.1),
        label('Hsp 2.50m',1,3.5,.1),label('Echelle : 1 /',6.4,5.4,.2),label('80',7.2,5.4,.2),label('La: 0.80',2.6,2.9,.06)]};
assert.ok(Math.abs(printedScale(synthetic.texts)-PT)<1e-9,'échelle lue au cartouche');
assert.equal(printedCeiling(synthetic.texts),2.5,'hauteur sous plafond lue');
assert.equal(printedRooms(synthetic.texts).length,2,'deux pièces imprimées');
assert.deepEqual(printedRooms(synthetic.texts).map(r=>r.name),['Sejour','Chambre'],'noms rattachés aux surfaces');
assert.equal(annotations(synthetic.texts).length,1,'une largeur de baie annotée');
const {project:vectorPlan,report}=planFromPage(synthetic,'synthèse');
validateProject(vectorPlan);
assert.equal(report.scaleSource,'cartouche');assert.equal(report.ceiling,2.5);
for(const room of report.rooms){
 assert.ok(room.computed!==null,`${room.name} : pièce non fermée`);
 assert.ok(Math.abs(room.computed-room.printed)<room.printed*.02,`${room.name} : ${room.computed?.toFixed(2)} m² contre ${room.printed} imprimés`);
}
assert.equal(report.warnings.length,0,`avertissements inattendus : ${report.warnings.join(' / ')}`);
assert.ok(vectorPlan.walls.every(w=>w.height===2.5),'hauteur des murs reprise du plan');
assert.ok(vectorPlan.walls.some(w=>Math.abs(w.thickness-.2)<.02),'mur de façade à 20 cm');
assert.ok(vectorPlan.walls.some(w=>Math.abs(w.thickness-.1)<.02),'cloison à 10 cm');
assert.equal(vectorPlan.walls.flatMap(w=>w.openings).length,1,'la baie annotée est posée');
const bay=vectorPlan.walls.flatMap(w=>w.openings)[0];
assert.ok(Math.abs(bay.width-.8)<.01,'largeur de baie reprise de l’annotation');
// une échelle absente se rattrape sur les surfaces imprimées
const {report:withoutTitleBlock}=planFromPage({...synthetic,texts:synthetic.texts.filter(t=>!/chelle|^80$/.test(t.text))},'sans cartouche');
assert.equal(withoutTitleBlock.scaleSource,'surfaces','échelle déduite des surfaces');
assert.ok(Math.abs(withoutTitleBlock.scale-PT)<PT*.02,'échelle déduite proche de l’échelle réelle');
// les hachures courtes ne doivent pas passer pour des murs
const hatched={...synthetic,strokes:[...synthetic.strokes,...Array.from({length:200},(_,i)=>stroke(.3+i*.02,.3,.3+i*.02,.31))]};
assert.equal(planFromPage(hatched,'hachuré').report.warnings.length,0,'les hachures perturbent la reconstruction');
console.log('PASS: extraction vectorielle — échelle, pièces, épaisseurs, baies, repli sans cartouche, rejet des hachures.');
// le plan d'exemple est la sortie de l'extracteur sur le PDF d'origine : s'il dérive
// (extracteur modifié sans régénération), on le voit ici
{
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const doc=await pdfjs.getDocument({data:new Uint8Array(await readFile(new URL('./fixtures/plan-exemple.pdf',import.meta.url))),isEvalSupported:false,verbosity:0}).promise;
 const page=await doc.getPage(1),viewport=page.getViewport({scale:1});
 const ops=await page.getOperatorList(),content=await page.getTextContent();
 const {strokesFrom,textsFrom}=await import(new URL('pdf-vector.js',directory));
 const {project:fresh,report:real}=planFromPage({width:viewport.width,height:viewport.height,strokes:strokesFrom(ops.fnArray,ops.argsArray,viewport.transform),texts:textsFrom(content.items.filter(i=>'str' in i),viewport.transform)},'contrôle');
 assert.equal(fresh.walls.length,p.walls.length,'plan d’exemple périmé : node scripts/build-example-plan.mjs');
 assert.equal(fresh.walls.flatMap(w=>w.openings).length,p.walls.flatMap(w=>w.openings).length,'baies du plan d’exemple périmées');
 assert.equal(Math.round(real.scale/(25.4/72/1000)),80,'échelle 1/80 lue au cartouche');
 assert.equal(real.ceiling,2.73,'hauteur sous plafond lue sur le plan');
 assert.equal(real.annotated,10,'dix largeurs de baie annotées');
 const f1=real.fidelity;assert.ok(f1.precision>=.98&&f1.recall>=.95,`murs Lefebvre : précision ${f1.precision}, rappel ${f1.recall}`);assert.equal(f1.short,0,'aucun mur de moins de 10 cm');
 console.log(`PASS: PDF réel — ${real.rooms.filter(r=>r.computed!==null).length}/${real.rooms.length} pièces fermées, ${real.bays} baies, plan d'exemple à jour.`);
}
{
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const doc=await pdfjs.getDocument({data:new Uint8Array(await readFile(new URL('./fixtures/plan-exemple-2.pdf',import.meta.url))),isEvalSupported:false,verbosity:0}).promise;
 const page=await doc.getPage(1),viewport=page.getViewport({scale:1});
 const ops=await page.getOperatorList(),content=await page.getTextContent();
 const {strokesFrom,textsFrom}=await import(new URL('pdf-vector.js',directory));
 const {exampleProject2}=await import(new URL('example-plan-2.js',directory));
 const {project:fresh,report:real}=planFromPage({width:viewport.width,height:viewport.height,strokes:strokesFrom(ops.fnArray,ops.argsArray,viewport.transform),texts:textsFrom(content.items.filter(i=>'str' in i),viewport.transform)},'contrôle');
 assert.equal(fresh.walls.length,exampleProject2().walls.length,'exemple 2 périmé : node scripts/build-example-plan.mjs 2');
 assert.equal(Math.round(real.scale/(25.4/72/1000)),50,'échelle 1:50 lue sous son libellé dans le cartouche');
 assert.equal(real.rooms.length,10,'« Surface: x m² » reconnu pour les 10 pièces');
 assert.equal(real.ceiling,2.9,'hauteur sous plafond médiane');
 const f2=real.fidelity;assert.equal(f2.zones,10,'les 10 zones de pièces du PDF sont lues');assert.ok(f2.precision>=.99&&f2.recall>=.97,`murs Mamoun : précision ${f2.precision}, rappel ${f2.recall}`);assert.ok(f2.orphans<=4,`${f2.orphans} bouts de mur orphelins`);assert.equal(f2.short,0,'aucun mur de moins de 10 cm');
 console.log(`PASS: PDF Mamoun — échelle 1:50, ${real.rooms.filter(r=>r.computed!==null).length}/${real.rooms.length} pièces fermées, ${real.bays} baies, exemple 2 à jour.`);
}

// --- murs courbes ---
{
 const {arcOf,wallLength,pointAt,project,angleThrough}=await import(new URL('arc.js',directory));
 const {projectedOffset,openingCenter}=await import(new URL('openings.js',directory));
 const near=(a,b,e=1e-6,m='')=>assert.ok(Math.abs(a-b)<=e,`${m} ${a} ≠ ${b}`);
 const half={id:'arc',name:'Arc',a:{x:0,y:0},b:{x:2,y:0},angle:180,thickness:.2,height:2.5,openings:[]};
 validateProject({...p,walls:[half]});
 near(length(half),Math.PI,1e-9,'demi-cercle de rayon 1 : longueur π');
 near(arcOf(half).radius,1,1e-9,'rayon');
 const top=pointAt(half,Math.PI/2).point;near(top.x,1);near(top.y,1,1e-9,'angle positif : le mur bombe du côté de la normale gauche (0, 1)');
 near(pointAt({...half,angle:-180},Math.PI/2).point.y,-1,1e-9,'angle négatif : de l’autre côté');
 near(angleThrough(half,top),180,.6,'la poignée au sommet redonne l’angle');
 near(project(half,{x:1,y:5}),Math.PI/2,1e-9,'projection sur l’arc');
 near(length({...half,angle:0}),2,1e-9,'angle nul : mur droit');
 assert.throws(()=>validateProject({...p,walls:[{...half,angle:400}]}),'courbure bornée');
 // une baie posée au milieu de l'arc y reste, et la 3D suit l'arc sans fente
 const door={id:'porte-arc',kind:'door',offset:projectedOffset(half,{x:1,y:3},.8),width:.8,height:2.1,sill:0};
 near(door.offset,.5,1e-9,'baie au milieu de l’arc');near(openingCenter(half,door).y,1,1e-9);
 const arched=wallObject({...half,openings:[door]});arched.updateMatrixWorld(true);
 const box=new THREE.Box3().setFromObject(arched);
 near(box.max.z,1.1,.01,'la 3D suit l’arc jusqu’au sommet (rayon + demi-épaisseur)');near(box.min.x,-.1,.01);near(box.max.x,2.1,.01);
 const through=new THREE.Raycaster(new THREE.Vector3(1,1,0),new THREE.Vector3(0,0,1));assert.equal(through.intersectObject(arched,true).length,0,'la porte perce réellement le mur courbe');
 const side=new THREE.Raycaster(new THREE.Vector3(1+Math.cos(Math.PI/5),1.2,Math.sin(Math.PI/5)-.5),new THREE.Vector3(0,0,1));
 assert.ok(side.intersectObject(arched,true).length>0,'le mur courbe est plein hors de la baie');
 disposeObject(arched);
 // l'exemple 2 porte le mur courbe de l'entrée, en un seul mur
 const {exampleProject2}=await import(new URL('example-plan-2.js',directory));
 const bent=exampleProject2().walls.filter(w=>w.angle);
 assert.equal(bent.length,1,'un seul mur courbe dans l’exemple Mamoun');
 assert.ok(Math.abs(bent[0].angle)>=80&&Math.abs(bent[0].angle)<=110,`arc de l’entrée : ${bent[0].angle}°`);
 console.log(`PASS: murs courbes — géométrie, poignée, baie le long de l’arc, 3D sans fente, arc de ${bent[0].angle}° dans l’exemple Mamoun.`);
}

// --- jonctions : un angle, un raccord en T, un mur seul ---
{
 const {junctions,moveJunction,moveWall,faceEnds,straightOutline}=await import(new URL('joints.js',directory));
 const near=(a,b,e=1e-6,m='')=>assert.ok(Math.abs(a-b)<=e,`${m} ${a} ≠ ${b}`);
 const wall=(id,a,b,t=.2)=>({id,name:id,a,b,thickness:t,height:2.5,openings:[]});
 const plan=validateProject({...p,walls:[wall('bas',{x:0,y:0},{x:4,y:0}),wall('droite',{x:4,y:0},{x:4,y:3}),wall('refend',{x:2,y:0},{x:2,y:3},.1),wall('seul',{x:6,y:0},{x:7,y:1})],labels:[]});
 const nodes=junctions(plan.walls);
 assert.equal(nodes.find(n=>n.point.x===4&&n.point.y===0).ends.length,2,'angle en L : deux bouts confondus');
 assert.deepEqual(nodes.find(n=>n.point.x===2&&n.point.y===0).hosts,['bas'],'raccord en T : le bout est sur l’axe du mur bas');
 // tirer l'angle entraîne les deux murs
 const pulled=moveJunction(plan,'bas','b',{x:5,y:0});
 assert.deepEqual(pulled.walls.find(w=>w.id==='droite').a,{x:5,y:0},'le mur droit suit l’angle');
 // déplacer le mur bas : le mur droit s'étire, le refend reste accroché à son axe
 const slid=moveWall(plan,'bas',0,1);
 assert.deepEqual(slid.walls.find(w=>w.id==='droite').a,{x:4,y:1});
 near(slid.walls.find(w=>w.id==='refend').a.y,1,1e-9,'le refend suit la translation de son hôte');
 near(slid.walls.find(w=>w.id==='refend').a.x,2,1e-9);
 // déplacer le refend le long de l'hôte : son pied glisse sur l'axe
 const along=moveWall(plan,'refend',.5,.3);
 near(along.walls.find(w=>w.id==='refend').a.y,0,1e-9,'le pied du refend reste sur l’axe du mur bas');
 near(along.walls.find(w=>w.id==='refend').a.x,2.5,1e-9);
 assert.deepEqual(moveWall(plan,'seul',1,1).walls.find(w=>w.id==='seul').a,{x:7,y:1},'un mur seul se translate');
 // angle d'onglet : les deux murs se partagent la diagonale, ni fente ni débord
 const ends=faceEnds(plan.walls),bas=straightOutline(plan.walls[0],ends.get('bas')),droite=straightOutline(plan.walls[1],ends.get('droite'));
 const corner=[...bas,...droite];
 assert.ok(corner.some(q=>Math.abs(q.x-4.1)<1e-9&&Math.abs(q.y+.1)<1e-9)&&corner.some(q=>Math.abs(q.x-3.9)<1e-9&&Math.abs(q.y-.1)<1e-9),'coins extérieur (4,1 ; -0,1) et intérieur (3,9 ; 0,1) de l’onglet');
 assert.deepEqual(ends.get('refend'),{a:{l:0,r:0},b:{l:0,r:0}},'en T et sur un bout libre, le mur s’arrête à son extrémité');
 // en 3D, l'angle est plein
 const bent=wallObject(plan.walls[0],false,ends.get('bas')),up=wallObject(plan.walls[1],false,ends.get('droite'));bent.updateMatrixWorld(true);up.updateMatrixWorld(true);
 const probe=new THREE.Raycaster(new THREE.Vector3(4.07,5,-.07),new THREE.Vector3(0,-1,0));
 assert.ok(probe.intersectObjects([bent,up],true).length>0,'le coin extérieur de l’angle est plein en 3D');
 disposeObject(bent);disposeObject(up);
 // l'exemple Mamoun sort raccordé : chaque bout de mur est un angle, un T, ou une vraie fin de mur
 const {exampleProject2}=await import(new URL('example-plan-2.js',directory));
 const lonely=junctions(exampleProject2().walls).filter(n=>n.ends.length===1&&!n.hosts.length).length;
 assert.ok(lonely<=10,`${lonely} bouts libres dans l’exemple Mamoun`);
 console.log(`PASS: jonctions — angle suivi, mur étiré, refend accroché, onglet exact en 2D et plein en 3D, ${lonely} bouts libres dans l’exemple Mamoun.`);
}

// --- modifications par saisie : cotes, ancrage, coupe, fusion, décalage, équerre ---
{
 const {resizeWall,orientWall,openingChain,setSegment,splitWall,mergeWalls,mergeCandidate,removeWall,offsetWall,facingWalls,setClearance,squareCorner,finalize,checkProject}=await import(new URL('edits.js',directory));
 const {parseLength}=await import(new URL('units.js',directory));
 const {junctions}=await import(new URL('joints.js',directory));
 const {openingCenter}=await import(new URL('openings.js',directory));
 const near=(a,b,e=1e-6,m='')=>assert.ok(Math.abs(a-b)<=e,`${m} ${a} ≠ ${b}`);
 const wall=(id,a,b,openings=[],t=.2)=>({id,name:id,a,b,thickness:t,height:2.5,openings});
 const door={id:'porte',kind:'door',offset:.25,width:.9,height:2.1,sill:0};
 const room=validateProject({...p,labels:[],walls:[wall('bas',{x:0,y:0},{x:4,y:0},[door]),wall('droite',{x:4,y:0},{x:4,y:3}),wall('haut',{x:4,y:3},{x:0,y:3}),wall('gauche',{x:0,y:3},{x:0,y:0}),wall('refend',{x:2,y:0},{x:2,y:3},[],.1)]});
 const get=(q,id)=>q.walls.find(w=>w.id===id),links=q=>junctions(q.walls).map(n=>`${n.ends.length}+${n.hosts.length}`).sort().join();
 // longueur, selon le point fixe : les angles restent raccordés, les baies restent en place
 for(const [anchor,start,doorX] of [['a',0,1],['b',-1,1],['centre',-.5,1]]){
  const q=finalize(resizeWall(room,'bas',5,anchor),room),bas=get(q,'bas');
  near(length(bas),5,1e-9,`ancrage ${anchor} : longueur`);near(bas.a.x,start,1e-9,`ancrage ${anchor} : début`);
  assert.equal(links(q),links(room),`ancrage ${anchor} : aucune jonction perdue`);
  assert.deepEqual(get(q,'droite').a,bas.b,'le mur droit suit');assert.deepEqual(get(q,'gauche').b,bas.a,'le mur gauche suit');
  near(openingCenter(bas,bas.openings[0]).x,doorX,1e-9,`ancrage ${anchor} : la porte garde sa distance au point fixe`);
 }
 const turned=orientWall(room,'droite',100,'a');assert.deepEqual(get(turned,'haut').a,get(turned,'droite').b,'orientation : le mur suivant reste raccordé');
 // chaîne de cotes de la baie : écart au début, largeur, écart à la fin
 assert.deepEqual(openingChain(get(room,'bas')).map(s=>[s.kind,Math.round(s.from*100),Math.round(s.to*100)]),[['gap',0,55],['width',55,145],['gap',145,400]]);
 const centre=(q)=>openingCenter(get(q,'bas'),get(q,'bas').openings[0]).x;
 near(centre(setSegment(room,'bas',0,.8)),1.25,1e-9,'écart au début de 80 cm');
 near(centre(setSegment(room,'bas',2,1)),2.55,1e-9,'écart à la fin de 1 m : la porte recule depuis b');
 near(centre(setSegment(room,'bas',0,0,50)),2,1e-9,'50 % : porte centrée');
 const wider=setSegment(room,'bas',1,1.2);near(get(wider,'bas').openings[0].width,1.2);near(centre(wider),1,1e-9,'largeur : centre conservé');
 assert.throws(()=>setSegment(room,'bas',0,3.5),/sortirait/,'une porte poussée hors du mur est refusée');
 // contrôle : chevauchement refusé, débord recalé
 const twice={...room,walls:room.walls.map(w=>w.id==='bas'?{...w,openings:[door,{...door,id:'fenetre',kind:'window',offset:.3}]}:w)};
 assert.throws(()=>finalize(twice,room),/chevaucheraient/);
 const out={...room,walls:room.walls.map(w=>w.id==='bas'?{...w,openings:[{...door,offset:.05}]}:w)};
 assert.match(checkProject(out,room),/dépasserait/);near(get(finalize(out,room),'bas').openings[0].offset*4,.45,1e-9,'finalize ramène la porte dans le mur');
 assert.throws(()=>finalize(resizeWall(room,'refend',.01,'a'),room),/moins de 5 cm/);
 // couper puis fusionner redonne le mur d'origine
 const cut=splitWall(room,'bas',3);assert.equal(cut.walls.length,6);
 assert.deepEqual(get(cut,'bas').b,{x:3,y:0});near(centre(cut),1,1e-9,'la porte reste du côté de son centre');
 assert.throws(()=>splitWall(room,'bas',1),/ouverture/,'on ne coupe pas dans une porte');
 assert.ok(mergeCandidate(cut,'bas','b'));assert.equal(mergeCandidate(room,'bas','b'),null,'un angle droit ne se fusionne pas');
 const joined=mergeWalls(cut,'bas','b');assert.equal(joined.walls.length,5);assert.deepEqual(get(joined,'bas').b,{x:4,y:0});near(get(joined,'bas').openings[0].offset,.25,1e-9);
 // supprimer le refend recolle les deux tronçons du mur bas coupés à son pied
 const healed=removeWall(splitWall(room,'bas',2),'refend');
 assert.equal(healed.walls.length,4,'refend supprimé, mur bas recollé');near(length(get(healed,'bas')),4,1e-9);
 // décalage : les T restent accrochés, la cote face à face vaut la saisie
 const shifted=offsetWall(room,'refend',.5);assert.deepEqual(get(shifted,'refend').a,{x:1.5,y:0});assert.deepEqual(get(shifted,'refend').b,{x:1.5,y:3});
 const faces=facingWalls(room,'refend');assert.equal(faces.length,2,'un mur en vis-à-vis de chaque côté');near(faces[0].clear,1.85,1e-9,'face à face : axe 2 m − 5 cm − 10 cm');
 const spaced=setClearance(room,'refend',1,1);near(facingWalls(spaced,'refend').find(f=>f.side===1).clear,1,1e-9,'cote face à face saisie');
 // équerre : le mur pivote autour de l'angle, longueur conservée
 const skew=validateProject({...p,labels:[],walls:[wall('A',{x:0,y:0},{x:4,y:0}),wall('B',{x:4,y:0},{x:4.5,y:3}),wall('C',{x:4.5,y:3},{x:0,y:3})]});
 const squared=squareCorner(skew,'B','a'),B=get(squared,'B');
 near(Math.abs(Math.atan2(B.b.y-B.a.y,B.b.x-B.a.x)*180/Math.PI),90,.1,'angle droit');near(length(B),length(get(skew,'B')),.002,'longueur conservée');assert.deepEqual(get(squared,'C').a,B.b,'le mur suivant reste raccordé');
 assert.equal(squareCorner(room,'droite','a'),room,'déjà d’équerre : rien ne change');
 // saisie des cotes
 for(const [text,value,percent] of [['3,45',3.45],['345cm',3.45],['3450mm',3.45],['345',3.45],['2',2],['+12cm',3.12],['-5cm',2.95],['50%',2,50],['+10%',3.3]]){
  const r=parseLength(text,3,4);near(r.value,value,1e-9,text);assert.equal(r.percent,percent,text);
 }
 assert.equal(parseLength('abc',3),null);assert.equal(parseLength('',3),null);
 console.log('PASS: saisie — longueur selon le point fixe, chaîne de cotes des baies, contrôle avant enregistrement, coupe/fusion/recollage, décalage face à face, équerre, lecture des cotes.');
}
// Modifications par rapport à l'existant validé : ce que le devis Conceptuo chiffrera.
{
 const {diffWalls,changesDocument,changeRows,CHANGES_FORMAT}=await import(new URL('changes.js',directory));
 const {packHistory,unpackHistory}=await import(new URL('history.js',directory));
 const {splitWall,mergeWalls,removeWall}=await import(new URL('edits.js',directory));
 const {moveWall}=await import(new URL('joints.js',directory));
 const near=(a,b,e=1e-6,m='')=>assert.ok(Math.abs(a-b)<=e,`${m} ${a} ≠ ${b}`);
 const wall=(id,a,b,openings=[],t=.2)=>({id,name:id,a,b,thickness:t,height:2.5,openings});
 const door={id:'porte',kind:'door',offset:.25,width:.9,height:2.1,sill:0};
 const room=validateProject({...p,labels:[],walls:[wall('bas',{x:0,y:0},{x:4,y:0},[door]),wall('droite',{x:4,y:0},{x:4,y:3}),wall('haut',{x:4,y:3},{x:0,y:3}),wall('gauche',{x:0,y:3},{x:0,y:0}),wall('refend',{x:2,y:0},{x:2,y:3},[],.1)]});
 const existing=room.walls,diff=q=>diffWalls(existing,q.walls);
 assert.equal(diff(room).count,0,'sans modification : aucun poste');
 // couper puis recoller change les identifiants, pas le chantier
 const cut=splitWall(room,'haut',1);assert.equal(cut.walls.length,6);assert.equal(diff(cut).count,0,'couper un mur : aucun poste');
 assert.equal(diff(mergeWalls(cut,'haut','b')).count,0,'recoller : aucun poste');
 // supprimer le refend : une démolition, à ses coordonnées, surface = longueur × hauteur
 const removed=diff(removeWall(room,'refend'));
 assert.equal(removed.count,1);assert.equal(removed.demolished.length,1);assert.equal(removed.built.length,0);
 const d=removed.demolished[0];assert.equal(d.existingWallId,'refend');assert.deepEqual([d.from,d.to],[{x:2,y:0},{x:2,y:3}]);near(d.length,3);near(d.area,7.5);near(removed.totals.demolishedArea,7.5);
 // démolir la moitié du mur bas emporte sa porte : la surface est nette de la baie
 const half=diff({...room,walls:room.walls.map(w=>w.id==='bas'?{...w,a:{x:2,y:0},openings:[]}:w)});
 assert.equal(half.demolished.length,1);near(half.demolished[0].length,2);near(half.demolished[0].area,2*2.5-.9*2.1,1e-9,'surface nette');assert.equal(half.demolished[0].openings.length,1,'porte déposée avec la portion');assert.equal(half.openingsFilled.length,0,'pas un rebouchage');
 // pousser le mur droit d'1 m : démoli puis reconstruit, et les deux murs raccordés s'allongent
 const pushed=diff(moveWall(room,'droite',1,0));
 assert.equal(pushed.demolished.length,1);assert.equal(pushed.demolished[0].existingWallId,'droite');
 assert.deepEqual(pushed.built.map(b=>[b.wallId,b.length]).sort(),[['bas',1],['droite',3],['haut',1]],'rallonges des murs voisins');
 near(pushed.totals.builtLength,5);near(pushed.totals.demolishedLength,3);
 // baies des murs conservés
 const win={id:'fen',kind:'window',offset:.5,width:1.2,height:1.2,sill:.9};
 const pierced=diff({...room,walls:room.walls.map(w=>w.id==='haut'?{...w,openings:[win]}:w)});
 assert.equal(pierced.openingsCreated.length,1);assert.equal(pierced.count,1);assert.deepEqual(pierced.openingsCreated[0].after.centre,{x:2,y:3});
 const blocked=diff({...room,walls:room.walls.map(w=>w.id==='bas'?{...w,openings:[]}:w)});
 assert.equal(blocked.openingsFilled.length,1);assert.equal(blocked.count,1);assert.equal(blocked.openingsFilled[0].before.width,.9);
 const widened=diff({...room,walls:room.walls.map(w=>w.id==='bas'?{...w,openings:[{...door,width:1.2}]}:w)});
 assert.equal(widened.openingsModified.length,1);assert.equal(widened.count,1);assert.match(changeRows(widened)[0].detail,/élargissement/);
 // épaisseur changée sur place
 const thick=diff({...room,walls:room.walls.map(w=>w.id==='refend'?{...w,thickness:.2}:w)});
 assert.equal(thick.resized.length,1);assert.equal(thick.count,1);near(thick.resized[0].length,3);assert.deepEqual(thick.resized[0].before,{thickness:.1,height:2.5});
 // repères : numérotés de 1 à n, identiques d'un calcul à l'autre, et un par ligne du tableau
 const many=moveWall({...room,walls:room.walls.map(w=>w.id==='haut'?{...w,openings:[win]}:w)},'droite',1,0);
 const r1=diffWalls(existing,many.walls),r2=diffWalls(existing,many.walls);
 const refs=[...r1.demolished,...r1.built,...r1.resized,...r1.openingsCreated,...r1.openingsFilled,...r1.openingsModified].map(x=>x.ref).sort((a,b)=>a-b);
 assert.deepEqual(refs,Array.from({length:r1.count},(_,i)=>i+1));assert.deepEqual(r1,r2,'mêmes repères');
 assert.deepEqual(changeRows(r1).map(r=>r.ref),refs);
 // l'existant suit la mise à l'échelle et le JSON d'échange porte les deux états
 const validated=validateProject({...many,existing:{walls:existing,validatedAt:'2026-09-24T10:00:00.000Z'}});
 const rescaled=rescale(validated,2);near(length(rescaled.existing.walls[0]),length(existing[0])*2);
 assert.deepEqual(diffWalls(rescaled.existing.walls,rescaled.walls).count,r1.count,'même nombre de postes après mise à l’échelle');
 const doc=JSON.parse(JSON.stringify(changesDocument(validated)));
 assert.equal(doc.format,CHANGES_FORMAT);assert.equal(doc.existing.walls.length,existing.length);assert.equal(doc.changes.count,r1.count);assert.equal(doc.frame.origin,'page-top-left');
 // historique : une image partagée par 30 états n'est rangée qu'une fois
 const pic={data:'data:image/png;base64,'+'A'.repeat(200000),width:10,height:8,fileName:'plan.pdf',page:1,scale:.0176};
 const states=Array.from({length:30},(_,i)=>({...room,name:`état ${i}`,background:pic}));
 const packed=packHistory(states.slice(0,20),states.slice(20));
 assert.equal(Object.keys(packed.blobs).length,1);assert.ok(JSON.stringify(packed).length<JSON.stringify(states).length/10);
 const back=unpackHistory(JSON.parse(JSON.stringify(packed)));assert.deepEqual(back.past,states.slice(0,20));assert.deepEqual(back.future,states.slice(20));
 delete packed.blobs.b0;assert.equal(unpackHistory(packed).past.length,0,'contenu manquant : état écarté');
 console.log('PASS: modifications — coupe/recollage sans poste, démolition nette des baies, rallonges des voisins, percement/rebouchage/élargissement, épaisseur, repères stables, mise à l’échelle, JSON d’échange, historique compact.');
}
// Pièces calculées à partir des murs : fusion, renommage, surface imprimée tant qu'inchangée.
{
 const {roomsOf,renameRoom,parseLabel}=await import(new URL('rooms.js',directory));
 const {changesDocument}=await import(new URL('changes.js',directory));
 const {removeWall}=await import(new URL('edits.js',directory));
 const near=(a,b,e=1e-6,m='')=>assert.ok(Math.abs(a-b)<=e,`${m} ${a} ≠ ${b}`);
 const wall=(id,a,b,openings=[],t=.2)=>({id,name:id,a,b,thickness:t,height:2.5,openings});
 const door={id:'porte',kind:'door',offset:.5,width:.8,height:2.1,sill:0};
 // deux pièces de 1,85 × 2,80 m entre les faces, séparées par un refend de 10 cm muni d'une porte
 const room=validateProject({...p,labels:[{name:'A · 5.18 m²',x:1,y:1.5},{name:'B',x:3,y:1.5,printed:5.2}],walls:[wall('bas',{x:0,y:0},{x:4,y:0}),wall('droite',{x:4,y:0},{x:4,y:3}),wall('haut',{x:4,y:3},{x:0,y:3}),wall('gauche',{x:0,y:3},{x:0,y:0}),wall('refend',{x:2,y:0},{x:2,y:3},[door],.1)]});
 assert.deepEqual(parseLabel({name:'Sde + Wc · 5.24 m²',x:0,y:0}),{name:'Sde + Wc',printed:5.24});assert.deepEqual(parseLabel({name:'Bureau',x:0,y:0}),{name:'Bureau',printed:null});
 const two=roomsOf(room.walls,room.labels);
 assert.equal(two.length,2,'une porte ne réunit pas deux pièces');
 for(const r of two){near(r.computed,1.85*2.8,.03,'surface calculée');assert.equal(r.source,'imprimée');}
 assert.equal(two[0].area,5.18);assert.equal(two[1].area,5.2);
 // l'existant validé et inchangé : surfaces imprimées
 assert.deepEqual(roomsOf(room.walls,room.labels,room.walls).map(r=>r.source),['imprimée','imprimée']);
 // refend supprimé : une seule pièce, noms réunis, surface recalculée
 const open=removeWall(room,'refend'),merged=roomsOf(open.walls,open.labels,room.walls);
 assert.equal(merged.length,1);const m=merged[0];
 assert.ok(m.merged);assert.equal(m.name,'A + B');assert.equal(m.source,'recalculée');near(m.area,3.8*2.8,.04,'surface réunie');near(m.printed,10.38,1e-9);
 // renommer : une seule étiquette, à la place de la première, clé inchangée
 const renamed=renameRoom(open,m.labels,'Séjour');
 assert.equal(renamed.labels.length,1);assert.deepEqual(renamed.labels[0],{name:'Séjour',x:1,y:1.5,printed:10.38});
 const after=roomsOf(renamed.walls,renamed.labels,room.walls);assert.equal(after[0].key,m.key);assert.equal(after[0].name,'Séjour');assert.equal(after[0].source,'recalculée');
 // exemple 1 : les 9 pièces gardent leur surface imprimée
 const ex=roomsOf(p.walls,p.labels);
 assert.equal(ex.length,9);assert.ok(ex.every(r=>r.source==='imprimée'),ex.filter(r=>r.source!=='imprimée').map(r=>r.name).join());
 // JSON d'échange : pièces de l'existant (noms d'origine) et du projet (renommée)
 const doc=changesDocument(validateProject({...renamed,existing:{walls:room.walls,labels:room.labels,validatedAt:'2026-09-24T10:00:00.000Z'}}));
 assert.deepEqual(doc.existing.rooms.map(r=>[r.name,r.area,r.source]),[['A',5.18,'imprimée'],['B',5.2,'imprimée']]);
 assert.deepEqual(doc.proposed.rooms.map(r=>[r.name,r.source]),[['Séjour','recalculée']]);
 console.log('PASS: pièces — porte sans fusion, surfaces imprimées tant qu’inchangées, refend supprimé = pièce réunie recalculée, renommage, 9 pièces de l’exemple, pièces avant/après dans le JSON.');
}
