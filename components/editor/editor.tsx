"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Box, MousePointer2, PencilRuler, Armchair, Layers, Download, Save, FolderOpen, Undo2, Redo2, Trash2, Copy, RotateCw, Sparkles, Settings2, Ruler, Plus, DoorOpen, AppWindow, ChevronLeft, ChevronRight, Loader2, Scissors, Combine, SquareDashedBottom, Sofa, BedDouble, Table2, Archive, CookingPot, FileText, Check, Info, Link2, RotateCcw } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import PlanView from './plan-view';
import SceneView from './scene-view';
import ProductDialog,{type GeneratedProduct} from './product-dialog';
import OpeningInspector from './opening-inspector';
import ChangesDialog from './changes-dialog';
import ChangesPanel from './changes-panel';
import RoomInspector from './room-inspector';
import {openingSelection,projectedOffset,editOpening,moveOpening,openingCenter} from '@/lib/editor/openings';
import NumberField from './number-field';
import { bounds, catalog, exampleProject, examples, length, moveEntity, rescale, round, uid, validateProject, type Item, type JournalEntry, type Point, type Project, type Tool, type Wall } from '@/lib/editor/model';
import { isPdf, readPlan, renderPlan } from '@/lib/editor/pdf';
import { finalize, mergeCandidate, mergeWalls, newWallSize, orientWall, placeOpeningAt, removeWall, resizeWall, setOpeningWidth, splitWall, squareCorner, type Anchor } from '@/lib/editor/edits';
import { record, reopenSurvey as surveyOf, resetWork, startWork } from '@/lib/editor/journal';
import { convertAnalysis } from '@/lib/editor/analysis';
import { readHistory, readLocal, saveHistory, saveLocal } from '@/lib/editor/storage';
import { packHistory, unpackHistory } from '@/lib/editor/history';
import { diffWalls, type ChangeRow } from '@/lib/editor/changes';
import { renameRoom, roomsOf } from '@/lib/editor/rooms';
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 3000); }
const icons = { sofa: Sofa, table: Table2, bed: BedDouble, chair: Armchair, cabinet: Archive, island: CookingPot, custom: Box };
export default function Editor() {
    const [project, setProject] = useState<Project>(() => startWork(exampleProject())), projectRef = useRef(project);
    projectRef.current = project;
    const [selected, setSelected] = useState<string | null>(null), selectedRef = useRef(selected), [tool, setTool] = useState<Tool>('select'), [revision, setRevision] = useState(0), [opacity, setOpacity] = useState(.65), [tab, setTab] = useState('plan'), [anchor, setAnchor] = useState<Anchor>('a');
    selectedRef.current = selected;
    const [past, setPast] = useState<Project[]>([]), [future, setFuture] = useState<Project[]>([]), [loaded, setLoaded] = useState(false), [saved, setSaved] = useState('Chargement…');
    const [productOpen,setProductOpen]=useState(false),[meshyKey,setMeshyKey]=useState('');
    // écarts avec l'existant (lib/editor/changes.ts) et journal des actions (lib/editor/journal.ts)
    const [showChanges, setShowChanges] = useState(true), [changesOpen, setChangesOpen] = useState(false), [confirm, setConfirm] = useState<'survey' | 'reset' | null>(null), [focus, setFocus] = useState<{ point: Point; ref: number; key: number } | null>(null);
    const historyWarned = useRef(false);
    const [busy, setBusy] = useState(''), busyRef = useRef(false), [settings, setSettings] = useState(false), [apiKey, setApiKey] = useState(''), [model, setModel] = useState('gpt-6-astra'), [warnings, setWarnings] = useState<string[]>([]);
    const [scaleDistance, setScaleDistance] = useState<number | null>(null), [realDistance, setRealDistance] = useState(''), [pdfPages, setPdfPages] = useState(1), [pdfPage, setPdfPage] = useState(1), [sourceFile, setSourceFile] = useState<File | null>(null);
    const planInput = useRef<HTMLInputElement>(null), jsonInput = useRef<HTMLInputElement>(null), assetInput = useRef<HTMLInputElement>(null), abort = useRef<AbortController | null>(null);
    const [library, setLibrary] = useState<{
        id: string;
        name: string;
        width: number;
        depth: number;
        height: number;
    }[]>([]);
    // `merge` : des modifications rapprochées de même clé (flèches du clavier) font un seul pas d'annulation.
    // `track` : la modification est inscrite au journal ; false pour un chargement, une mise à l'échelle…
    const lastMerge = useRef<{ key: string; time: number } | null>(null);
    const commit = useCallback((next: Project, merge?: string, track = true) => { const previous = projectRef.current, now = Date.now(), last = lastMerge.current; lastMerge.current = merge ? { key: merge, time: now } : null; const merging = !!(merge && last && last.key === merge && now - last.time < 800);
        if (!merging)
            setPast(prev => [...prev.slice(-29), previous]);
        if (track)
            next = record(previous, next, { merge: merging, subject: selectedRef.current });
        setFuture([]); setProject(next); projectRef.current = next; setSaved('Modifications…'); }, []);
    // nouveau plan de travail : l'existant est figé, le journal et l'historique d'annulation repartent de zéro
    function load(next: Project) { lastMerge.current = null; setPast([]); setFuture([]); setProject(next); projectRef.current = next; setSaved('Modifications…'); setSelected(null); setTool('select'); setRevision(r => r + 1); }
    // toute modification du plan passe par ici : recalage des baies et contrôle (lib/editor/edits.ts)
    const apply = useCallback((edit: (p: Project) => Project, merge?: string) => { const previous = projectRef.current; try {
        const next = edit(previous);
        if (next === previous) { toast.info('Déjà en place : rien à changer.'); return true; }
        commit(finalize(next, previous), merge);
        return true;
    }
    catch (e) {
        toast.error(e instanceof Error ? e.message : 'Modification impossible.');
        return false;
    } }, [commit]);
    const undo = useCallback(() => { if (!past.length || busyRef.current)
        return; const p = past[past.length - 1], current = projectRef.current; setFuture(f => [current, ...f].slice(0, 30)); setPast(past.slice(0, -1)); setProject(p); projectRef.current = p; setSelected(null); setRevision(r => r + 1); }, [past]);
    const redo = useCallback(() => { if (!future.length || busyRef.current)
        return; const p = future[0], current = projectRef.current; setPast(h => [...h, current].slice(-30)); setFuture(future.slice(1)); setProject(p); projectRef.current = p; setSelected(null); setRevision(r => r + 1); }, [future]);
    useEffect(() => { let alive = true; readLocal().then(async value => { if (alive && value) {
        const p = validateProject(value);
        // l'ancien plan d'exemple relevé à la main est remplacé par celui tiré du PDF
        if (p.name === 'Appartement 154 m\u00b2 \u2014 relev\u00e9')
            return;
        setProject(p);
        projectRef.current = p;
        setRevision(r => r + 1);
        // l'historique d'annulation survit au rechargement ; un état illisible l'interrompt
        const packed = await readHistory().catch(() => undefined);
        if (!alive || !packed)
            return;
        const valid = (list: Project[]) => { const out: Project[] = []; for (const q of list) { try { out.push(validateProject(q)); } catch { break; } } return out; };
        const h = unpackHistory(packed);
        setPast(valid([...h.past].reverse()).reverse());
        setFuture(valid(h.future));
    } }).catch(() => { toast.info('La sauvegarde locale est indisponible. Utilisez Enregistrer pour conserver votre projet.'); }).finally(() => { if (alive)
        setLoaded(true); }); return () => { alive = false; }; }, []);
    useEffect(() => { if (!loaded)
        return; setSaved('Enregistrement…'); let current = true; const timer = setTimeout(() => { saveLocal(project).then(() => { if (current)
        setSaved('Enregistré sur cet appareil'); }).catch(() => { if (current)
        setSaved('Exportez pour conserver le projet'); }); }, 600); return () => { current = false; clearTimeout(timer); }; }, [project, loaded]);
    useEffect(() => { if (!loaded)
        return; const timer = setTimeout(() => { saveHistory(packHistory(past, future)).catch(() => { if (!historyWarned.current) {
        historyWarned.current = true;
        toast.info('L’historique d’annulation ne sera pas conservé après rechargement : espace de stockage insuffisant.');
    } }); }, 600); return () => clearTimeout(timer); }, [past, future, loaded]);
    const changes = useMemo(() => project.existing ? diffWalls(project.existing.walls, project.walls) : null, [project.existing, project.walls]);
    // pièces calculées à partir des murs (lib/editor/rooms.ts), une fois par modification
    const rooms = useMemo(() => roomsOf(project.walls, project.labels, project.existing?.walls), [project.walls, project.labels, project.existing]);
    // une modification vient de réunir des pièces : proposer de renommer la nouvelle. Pas après un
    // chargement ni une annulation (ils changent `revision`)
    const seenMerges = useRef<{ revision: number; keys: Set<string> } | null>(null);
    useEffect(() => { const merged = rooms.filter(r => r.merged), keys = new Set(merged.map(r => `${r.key}:${r.labels.length}`)), seen = seenMerges.current;
        seenMerges.current = { revision, keys };
        if (!seen || seen.revision !== revision)
            return;
        for (const r of merged) if (!seen.keys.has(`${r.key}:${r.labels.length}`))
            toast.info(`${r.names.join(' et ')} sont réunies`, { description: 'Donnez un nom à la nouvelle pièce.', action: { label: 'Renommer', onClick: () => { setTab('plan'); select(r.key); } } }); }, [rooms, revision]); // eslint-disable-line react-hooks/exhaustive-deps
    function finishSurvey() { commit(startWork(projectRef.current), undefined, false); setSelected(null); toast.success('Relevé terminé. Chaque modification du plan est maintenant enregistrée.'); }
    // les corrections du relevé ne comptent pas comme travaux : on repart de l'existant, sans les modifications
    function correctSurvey() { commit(surveyOf(projectRef.current), undefined, false); setConfirm(null); setSelected(null); setRevision(r => r + 1); toast.info('Corrigez le relevé, puis cliquez sur « Terminer le relevé ».'); }
    function resetChanges() { commit(resetWork(projectRef.current), undefined, false); setConfirm(null); setSelected(null); setRevision(r => r + 1); toast.success('Modifications annulées : retour à l’existant.'); }
    function loadExample(ex: typeof examples[number]) { load(startWork(ex.project())); setSourceFile(null); setWarnings([]); setFocus(null); toast.success(`${ex.label} chargé`, { description: 'Modifications remises à zéro.' }); }
    function showRow(row: ChangeRow) { setChangesOpen(false); setTab('plan'); if (projectRef.current.walls.some(w => w.id === row.wallId)) setSelected(row.wallId); setShowChanges(true); setFocus({ point: row.mid, ref: row.ref, key: Date.now() }); }
    function showEntry(entry: JournalEntry) { setTab('plan'); setSelected(entry.wallId && projectRef.current.walls.some(w => w.id === entry.wallId) ? entry.wallId : null); setShowChanges(true); if (entry.point) setFocus({ point: entry.point, ref: -1, key: Date.now() }); }
    const opening = openingSelection(project,selected);
    const wall = project.walls.find(w => w.id === selected), item = project.items.find(i => i.id === selected);
    const room = rooms.find(r => r.key === selected);
    const remove = useCallback(() => { if (!selected || busyRef.current || selected.startsWith('piece-'))
        return; const current = projectRef.current; if (current.walls.some(w => w.id === selected)) apply(q => removeWall(q, selected)); else commit({ ...current, walls: current.walls.map(w=>({...w,openings:w.openings.filter(o=>o.id!==selected)})), items: current.items.filter(i => i.id !== selected) }); setSelected(null); }, [selected, commit, apply]);
    useEffect(() => { const handler = (e: KeyboardEvent) => { const target = e.target as HTMLElement; if (target.closest('input,textarea,[contenteditable=true],[role=dialog]') || busyRef.current)
        return; if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
    }
    else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        remove();
    }
    else if (e.key.startsWith('Arrow') && selected && !selected.startsWith('piece-')) {
        // flèches : 1 cm, 10 cm avec Maj ; un seul pas d'annulation par rafale
        e.preventDefault();
        const step = e.shiftKey ? .1 : .01, dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        move(selected, dx, dy, `nudge:${selected}`);
    }
    else if (e.key === 'Escape') {
        setSelected(null);
        setTool('select');
    }
    else if (e.key.toLowerCase() === 'v')
        setTool('select');
    else if (e.key.toLowerCase() === 'm')
        setTool('wall'); }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); });
    function select(id: string | null) { setSelected(id); if (id)
        setTool('select'); }
    function updateWall(changes: Partial<Wall>) { if (!wall)
        return; const id = wall.id, edit = (q: Project) => ({ ...q, walls: q.walls.map(w => w.id === id ? { ...w, ...changes } : w) }); if (Object.keys(changes).every(k => k === 'name'))
        commit(edit(project)); else apply(edit); }
    function updateItem(changes: Partial<Item>) { if (!item)
        return; commit({ ...project, items: project.items.map(i => i.id === item.id ? { ...i, ...changes } : i) }); }
    function move(id: string, dx: number, dy: number, merge?: string) { if (dx === 0 && dy === 0)
        return; apply(p => { const o=openingSelection(p,id);if(o){const center=openingCenter(o.wall,o.opening);return moveOpening(p,id,{x:center.x+dx,y:center.y+dy});} return moveEntity(p,id,dx,dy); }, merge); }
    function addWall(a: Point, b: Point) { const w: Wall = { id: uid(), name: `Mur ${project.walls.length + 1}`, a, b, ...newWallSize(project, a, b), openings: [] }; commit({ ...project, walls: [...project.walls, w] }); setSelected(w.id); }
    function addItem(base: Omit<Item, 'id' | 'x' | 'y' | 'rotation'>) { if (project.items.length >= 100) {
        toast.error('Limite de 100 objets pour ce prototype.');
        return;
    } const b = bounds(project), i: Item = { ...base, id: uid(), x: round(b.x + b.width / 2), y: round(b.y + b.height / 2), rotation: 0 }; commit({ ...project, items: [...project.items, i] }); select(i.id); toast.success(`${base.name} ajouté`); return i.id; }
    function duplicate() { if (wall) {
        const w = { ...wall, id: uid(), name: `${wall.name} (copie)`, a: { x: wall.a.x + .4, y: wall.a.y + .4 }, b: { x: wall.b.x + .4, y: wall.b.y + .4 }, openings: wall.openings.map(o => ({ ...o, id: uid() })) };
        commit({ ...project, walls: [...project.walls, w] });
        select(w.id);
    }
    else if (item) {
        const i = { ...item, id: uid(), x: item.x + .4, y: item.y + .4 };
        commit({ ...project, items: [...project.items, i] });
        select(i.id);
    } }
    // Équerre : à l'angle du début s'il n'y a qu'un autre mur, sinon à celui de la fin
    function squareWall(id: string) { const q = projectRef.current; for (const end of ['a', 'b'] as const) { try {
        const next = squareCorner(q, id, end);
        apply(() => next);
        return;
    }
    catch (e) { if (end === 'b') toast.error(e instanceof Error ? e.message : 'Équerre impossible.'); } } }
    function placeOpening(wallId:string,kind:'door'|'window',point:Point){
        const target=project.walls.find(w=>w.id===wallId);if(!target)return;
        if(target.openings.length>=12||length(target)<.3){toast.error('Ce mur ne peut pas recevoir une ouverture supplémentaire.');return;}
        const width=Math.min(kind==='door'?.9:1.2,length(target)*.7),id=uid();
        const next={id,kind,offset:projectedOffset(target,point,width),width,height:Math.min(kind==='door'?2.1:1.2,target.height),sill:kind==='door'?0:Math.max(0,Math.min(.9,target.height-1.2))};
        commit({...project,walls:project.walls.map(w=>w.id===wallId?{...w,openings:[...w.openings,next]}:w)});select(id);
    }
    function addOpening(kind:'door'|'window'){if(wall)placeOpening(wall.id,kind,{x:(wall.a.x+wall.b.x)/2,y:(wall.a.y+wall.b.y)/2});}
    // sans numéro de page : premier import, on cherche la page qui porte le plan
    async function loadPlan(file: File, requested?: number) { if (busyRef.current)
        return; busyRef.current = true; setBusy('Lecture du plan…'); try {
        if (!isPdf(file))
            throw new Error('Importez le PDF d’origine du plan : une image ne contient pas les tracés nécessaires.');
        setBusy('Lecture des tracés du plan…');
        const read = await readPlan(file, requested, (n, total) => { if (!requested && total > 1) setBusy(`Recherche du plan — page ${n} / ${total}…`); });
        const page = read?.page ?? requested ?? 1;
        const rendered = await renderPlan(file, page);
        const ratio = rendered.height / rendered.width;
        const width = read?.report.pageWidth || 12;
        const background = { data: rendered.data, width, height: width * ratio, fileName: file.name, page, ...(read?.report.scale ? { scale: read.report.scale } : {}) };
        const next: Project = read
            ? startWork({ ...read.project, background })
            : { version: 1, name: file.name.replace(/\.[^.]+$/, ''), walls: [], items: [], labels: [], background: { ...background, width: 12, height: 12 * ratio }, calibrated: false, assets: {} };
        commit(next, undefined, false);
        setSourceFile(file);
        setPdfPages(read?.pages ?? rendered.pages);
        setPdfPage(page);
        setSelected(null);
        setTool('select');
        setTab('plan');
        setWarnings(read ? read.report.warnings : []);
        setRevision(r => r + 1);
        if (read) {
            const done = read.report.rooms.filter(r => r.computed !== null).length;
            const where = !requested && read.pages > 1 ? ` (page ${page} / ${read.pages})` : '';
            toast.success(`${read.project.walls.length} murs et ${read.project.walls.reduce((n, w) => n + w.openings.length, 0)} ouvertures reconstruits — ${done}/${read.report.rooms.length} pièces retrouvées${where}.`);
        }
        else {
            setTool('scale');
            toast.info(requested ? 'Cette page ne porte pas de plan vectoriel exploitable. Changez de page, ou définissez l’échelle puis tracez les murs.' : 'Aucune page de ce PDF ne porte de tracé vectoriel exploitable. Définissez l’échelle, puis tracez les murs.');
        }
    }
    catch (e) {
        toast.error(e instanceof Error ? e.message : 'Impossible de lire ce fichier.');
    }
    finally {
        busyRef.current = false;
        setBusy('');
    } }
    async function analyze() { if (!project.background)
        return; if (!apiKey.trim()) {
        setSettings(true);
        return;
    } if (!project.calibrated) {
        setTool('scale');
        toast.info('Définissez d’abord une distance de référence sur le plan.');
        return;
    } busyRef.current = true; setBusy('L’IA repère les murs et les ouvertures…'); const controller = new AbortController(); abort.current = controller; const timer = setTimeout(() => controller.abort(), 120000); try {
        const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: project.background.data, key: apiKey, model }), signal: controller.signal });
        const data = await response.json() as {
            error?: string;
            warnings?: string[];
            modelUsed?: string;
        };
        if (!response.ok)
            throw new Error(data.error ?? 'Analyse impossible.');
        const next = startWork(convertAnalysis(data, project));
        commit(next, undefined, false);
        setWarnings([`Modèle utilisé : ${data.modelUsed ?? model}. Comparez les murs au plan avant de poursuivre.`, ...(data.warnings ?? [])]);
        setTool('select');
        setSelected(null);
        setRevision(r => r + 1);
        toast.success(`${next.walls.length} murs reconstruits. Vérifiez le résultat sur le plan.`);
    }
    catch (e) {
        toast.error(controller.signal.aborted ? 'Analyse interrompue. Votre projet est inchangé.' : e instanceof Error ? e.message : 'Connexion impossible.');
    }
    finally {
        clearTimeout(timer);
        abort.current = null;
        busyRef.current = false;
        setBusy('');
    } }
    async function exportScene() { busyRef.current = true; setBusy('Préparation du fichier 3D…'); try {
        const { exportGlb } = await import('@/lib/editor/scene');
        const buffer = await exportGlb(project);
        download(new Blob([buffer], { type: 'model/gltf-binary' }), `${project.name || 'conceptuo'}.glb`);
        toast.success('Maquette GLB exportée');
    }
    catch (e) {
        toast.error(e instanceof Error ? e.message : 'Export impossible.');
    }
    finally {
        busyRef.current = false;
        setBusy('');
    } }
    async function openProject(file: File) { try {
        if (file.size > 80 * 1024 * 1024)
            throw new Error('Le projet dépasse 80 Mo.');
        const p = validateProject(JSON.parse(await file.text()));
        commit(p, undefined, false);
        setSelected(null);
        setSourceFile(null);
        setPdfPages(1);
        setWarnings([]);
        setRevision(r => r + 1);
        toast.success('Projet ouvert');
    }
    catch (e) {
        toast.error(e instanceof Error && e.name !== 'ZodError' ? e.message : 'Le fichier ne correspond pas à un projet Conceptuo valide.');
    } }
    async function importAsset(file: File) { busyRef.current = true; setBusy('Lecture du modèle 3D…'); try {
        const { validateGlb, loadAsset, disposeObject } = await import('@/lib/editor/scene');
        const buffer = await file.arrayBuffer();
        validateGlb(buffer);
        const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve((reader.result as string).replace(/^data:[^;]*;/, 'data:model/gltf-binary;')); reader.onerror = reject; reader.readAsDataURL(file); });
        const object = await loadAsset(data);
        const THREE = await import('three');
        const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
        disposeObject(object);
        if (Math.min(size.x, size.y, size.z) <= 0 || Math.max(size.x, size.y, size.z) > 20)
            throw new Error('Dimensions non prises en charge. Exportez le modèle en mètres, entre 5 cm et 20 m.');
        const id = uid(), name = file.name.replace(/\.glb$/i, '');
        commit({ ...project, assets: { ...project.assets, [id]: data } });
        setLibrary(l => [...l, { id, name, width: Math.max(.05, size.x), depth: Math.max(.05, size.z), height: Math.max(.05, Math.min(10, size.y)) }]);
        setTab('catalog');
        toast.success('Modèle ajouté à la bibliothèque. Cliquez dessus pour le placer.');
    }
    catch (e) {
        toast.error(e instanceof Error ? e.message : 'Ce modèle ne peut pas être importé.');
    }
    finally {
        busyRef.current = false;
        setBusy('');
    } }
    async function insertGenerated(result:GeneratedProduct){
        const {loadAsset,disposeObject}=await import('@/lib/editor/scene');
        const object=await loadAsset(result.data);disposeObject(object);
        const p=projectRef.current;if(p.items.length>=100)throw new Error('Limite de 100 objets atteinte.');
        if(Object.values(p.assets).reduce((n,s)=>n+s.length,0)+result.data.length>60_000_000)throw new Error('Bibliothèque trop volumineuse pour ce prototype. Ouvrez un nouveau projet.');
        const assetId=uid(),id=uid(),b=bounds(p);
        let sourceUrl:string|undefined;try{const u=new URL(result.sourceUrl);if(u.protocol==='https:')sourceUrl=u.href}catch{}
        const product:Item={id,name:result.name,kind:'custom',assetId,x:round(b.x+b.width/2),y:round(b.y+b.height/2),rotation:0,width:result.width,depth:result.depth,height:result.height,color:'#c2b69f',sourceUrl};
        const next=validateProject({...p,assets:{...p.assets,[assetId]:result.data},items:[...p.items,product]});commit(next);
        setLibrary(l=>[...l,{id:assetId,name:product.name,width:product.width,depth:product.depth,height:product.height}]);select(id);setTab('catalog');toast.success('Modèle texturé ajouté aux dimensions du produit.');
    }
    const actions = useRef({ project, addItem });
    actions.current = { project, addItem };
    useEffect(() => { const context = (document as unknown as {
        modelContext?: {
            registerTool: (tool: unknown, options: unknown) => void | Promise<void>;
        };
    }).modelContext; if (!context?.registerTool)
        return; const lifecycle = new AbortController(); for (const t of [{ name: 'read_floor_plan', description: 'Lire les murs, objets et dimensions du projet actuellement ouvert.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: () => { const p = actions.current.project; return { name: p.name, calibrated: p.calibrated, walls: p.walls, items: p.items }; } }, { name: 'add_catalog_item', description: 'Ajouter immédiatement un objet du catalogue au centre du projet.', inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: catalog.map(c => c.kind) } }, required: ['kind'], additionalProperties: false }, annotations: { readOnlyHint: false }, execute: async (input: unknown) => { const kind = (input as {
                kind?: string;
            })?.kind, base = catalog.find(c => c.kind === kind); if (!base)
                throw new Error('Objet inconnu'); if (busyRef.current)
                throw new Error('Une opération est en cours'); if (actions.current.project.items.length >= 100)
                throw new Error('Limite de 100 objets'); const id = actions.current.addItem(base); await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); if (!actions.current.project.items.some(i => i.id === id))
                throw new Error('Ajout non confirmé'); return { id, added: base.name }; } }])
        try {
            Promise.resolve(context.registerTool(t, { signal: lifecycle.signal })).catch(() => { });
        }
        catch { } return () => lifecycle.abort(); }, []);
    const customEntries = [...library.filter(a => project.assets[a.id]), ...Object.keys(project.assets).filter(id => !library.some(a => a.id === id)).map(id => { const i = project.items.find(i => i.assetId === id); return { id, name: i?.name ?? 'Modèle importé', width: i?.width ?? 1, depth: i?.depth ?? 1, height: i?.height ?? 1 }; })];
    const currentLength = wall ? length(wall) : 0, currentAngle = wall ? Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x) * 180 / Math.PI : 0;
    return <main className="atelier"><ProductDialog open={productOpen} onOpenChange={setProductOpen} apiKey={apiKey} meshyKey={meshyKey} model={model} onSettings={()=>{setProductOpen(false);setSettings(true)}} onInsert={insertGenerated}/><Toaster richColors theme="light" position="bottom-right"/>
 <input ref={planInput} hidden type="file" accept=".pdf" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f)
        void loadPlan(f); }}/>
 <input ref={jsonInput} hidden type="file" accept=".json" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f)
        void openProject(f); }}/>
 <input ref={assetInput} hidden type="file" accept=".glb" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f)
        void importAsset(f); }}/>
 <header className="topbar"><div className="brand">conceptuo<span>ATELIER 3D</span></div><input aria-label="Nom du projet" value={project.name} maxLength={120} onChange={e => commit({ ...projectRef.current, name: e.target.value }, 'name')}/><div className="top-actions"><button className="icon-button" title="Ouvrir un projet JSON" aria-label="Ouvrir un projet JSON" onClick={() => jsonInput.current?.click()}><FolderOpen /></button><button className="plain-button" onClick={() => { download(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), `${project.name || 'conceptuo'}.json`); toast.success('Projet éditable enregistré'); }}><Save /><span>Enregistrer</span></button><button className="primary-button" disabled={!project.walls.length && !project.items.length} onClick={() => void exportScene()}><Download /><span>Exporter GLB</span></button></div></header>
 <div className="workspace"><aside className="left-panel"><div className="panel-title"><Layers size={18}/> Votre projet <span className="small-badge">MVP</span></div>
 <button className="import-card" onClick={() => planInput.current?.click()} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f)
        void loadPlan(f); }}><Upload /><strong>{project.background ? 'Changer de plan' : 'Importer un plan'}</strong><span>PDF d’architecte · 25 Mo max.</span></button>
 <Tabs value={tab} onValueChange={setTab} className="side-tabs"><TabsList className="w-full"><TabsTrigger value="plan">Plan</TabsTrigger><TabsTrigger value="catalog">Objets</TabsTrigger></TabsList>
 <TabsContent value="plan"><p className="eyebrow">CONSTRUIRE</p><button className={`tool ${tool === 'select' ? 'active' : ''}`} onClick={() => setTool('select')}><MousePointer2 /> Sélectionner <kbd>V</kbd></button><button className={`tool ${tool === 'wall' ? 'active' : ''}`} onClick={() => { setTool('wall'); setSelected(null); }}><PencilRuler /> Dessiner un mur <kbd>M</kbd></button><button className={`tool ${tool==='door'?'active':''}`} onClick={()=>{setTool('door');setSelected(null)}}><DoorOpen/> Ajouter une porte</button><button className={`tool ${tool==='window'?'active':''}`} onClick={()=>{setTool('window');setSelected(null)}}><AppWindow/> Ajouter une fenêtre</button><button className={`tool ${tool === 'scale' ? 'active' : ''}`} onClick={() => { setTool('scale'); setSelected(null); }}><Ruler /> Définir l’échelle</button>
 {project.background && <><div className="source-info"><FileText size={16}/><span>{project.background.fileName}</span></div>{pdfPages > 1 && sourceFile && <div className="page-picker"><button className="icon-button" disabled={pdfPage <= 1} aria-label="Page précédente" onClick={() => void loadPlan(sourceFile, pdfPage - 1)}><ChevronLeft /></button><span>Page {pdfPage} / {pdfPages}</span><button className="icon-button" disabled={pdfPage >= pdfPages} aria-label="Page suivante" onClick={() => void loadPlan(sourceFile, pdfPage + 1)}><ChevronRight /></button></div>}<label className="opacity-label">Visibilité du plan</label><Slider aria-label="Visibilité du plan PDF" value={[opacity * 100]} min={0} max={100} step={5} onValueChange={v => setOpacity(v[0] / 100)}/><button className="primary-button analyze" onClick={() => void analyze()}><Sparkles /> {project.walls.length ? 'Reconstruire avec l’IA' : 'Analyser avec l’IA'}</button><p className="small-text">La page affichée est envoyée à OpenAI à votre demande. Les murs détectés restent à vérifier.</p></>}
 <div className={`scale-status ${project.calibrated ? 'valid' : ''}`}><Ruler size={15}/>{project.calibrated ? 'Échelle définie en mètres' : 'Échelle à définir'}</div>
 <p className="eyebrow">PLANS D’EXEMPLE</p>
 {examples.map(ex => <button key={ex.id} className="tool muted-tool" title="Charger ce plan : les modifications repartent de zéro" onClick={() => loadExample(ex)}><Box /> {ex.label}<RotateCcw className="tool-end"/></button>)}
 </TabsContent><TabsContent value="catalog"><button className="primary-button full" onClick={()=>setProductOpen(true)}><Link2/> Depuis un lien produit</button><p className="eyebrow">MOBILIER</p><p className="small-text">Cliquez pour ajouter, puis déplacez l’objet dans le plan 2D.</p><div className="catalog-grid">{catalog.map(c => { const Icon = icons[c.kind]; return <button className="catalog-item" key={c.kind} onClick={() => addItem(c)}><Icon /><strong>{c.name}</strong><span>{c.width.toFixed(1)} × {c.depth.toFixed(1)} m</span><Plus className="catalog-plus"/></button>; })}</div><button className="outline-button full" onClick={() => assetInput.current?.click()}><Upload /> Importer un objet GLB</button><p className="small-text">Modèles autonomes non compressés, en mètres. 24 Mo maximum.</p>{customEntries.map(a => <button className="tool" key={a.id} onClick={() => addItem({ kind: 'custom', name: a.name, width: a.width, depth: a.depth, height: a.height, color: '#b9a180', assetId: a.id })}><Box /><span className="ellipsis">{a.name}</span><Plus /></button>)}</TabsContent></Tabs>
 <button className="connection-button" onClick={() => setSettings(true)}><Settings2 size={17}/><span>Connexion IA</span><span className="connection-state">{apiKey||meshyKey ? 'Prête' : 'À configurer'}</span></button></aside>
 <section className="canvas-workspace"><div className="workspace-heading"><div><p className="eyebrow">ESPACE DE TRAVAIL</p><h1>Du plan à l’espace.</h1></div><div className="history-buttons"><button className="icon-button" aria-label="Annuler" title="Annuler · ⌘ Z" disabled={!past.length} onClick={undo}><Undo2 /></button><button className="icon-button" aria-label="Rétablir" title="Rétablir · ⌘ ⇧ Z" disabled={!future.length} onClick={redo}><Redo2 /></button><span className="badge">{project.walls.length} murs · {project.items.length} objets</span></div></div>
 {warnings.length > 0 && <details className="analysis-warnings"><summary><Info size={15}/> Points à vérifier ({warnings.length})</summary><ul>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
 <div className="views"><div className="view-card"><div className="view-title">01 <strong>Plan 2D</strong><span>{project.calibrated ? 'mètres' : 'échelle provisoire'}</span></div><PlanView project={project} selected={selected} tool={tool} opacity={opacity} revision={revision} anchor={anchor} onAnchor={setAnchor} onSelect={select} onCommit={next => apply(() => next)} onEdit={apply} onDuplicate={duplicate} onRemove={remove} onWall={addWall} onOpening={placeOpening} onScale={d => { setScaleDistance(d); setRealDistance(''); }} changes={showChanges ? changes : null} focus={focus} rooms={rooms}/><div className="view-footer">{tool==='door'||tool==='window'?'Cliquez sur le mur à l’emplacement souhaité':tool === 'wall' ? 'Cliquez les deux extrémités du mur · Échap pour annuler' : tool === 'scale' ? 'Cliquez deux points dont vous connaissez la distance' : 'Glissez un mur, un objet ou une extrémité sélectionnée'}</div></div><div className="view-card"><div className="view-title">02 <strong>Maquette 3D</strong><Box size={16}/></div><SceneView project={project} selected={selected} onSelect={select} revision={revision}/><div className="view-footer">Représentation du plan 2D · les modifications se font dans le plan</div></div></div>
 <section className="inspector" aria-label="Propriétés de la sélection">{room ? <RoomInspector room={room} labels={project.labels} onRename={name => commit(renameRoom(projectRef.current, room.labels, name), `room-name:${room.key}`)}/> : opening?<OpeningInspector wall={opening.wall} opening={opening.opening} onChange={change=>apply(q=>editOpening(q,opening.opening.id,change))} onDelete={remove}/>:wall || item ? <><div className="inspector-heading"><div><p className="eyebrow">{wall ? 'MUR SÉLECTIONNÉ' : 'OBJET SÉLECTIONNÉ'}</p><input className="entity-name" aria-label="Nom de l’élément" value={(wall ?? item)!.name} maxLength={100} onChange={e => wall ? updateWall({ name: e.target.value }) : updateItem({ name: e.target.value })}/></div><div className="selection-actions"><button className="icon-button" aria-label="Dupliquer la sélection" title="Dupliquer" onClick={duplicate}><Copy /></button><button className="icon-button" aria-label="Tourner de 90 degrés" title="Tourner de 90°" onClick={() => wall ? apply(q => orientWall(q, wall.id, currentAngle + 90, anchor)) : updateItem({ rotation: (item!.rotation + 90) % 360 })}><RotateCw /></button><button className="icon-button danger" aria-label="Supprimer la sélection" title="Supprimer" onClick={remove}><Trash2 /></button></div></div>
 <div className="property-grid">{wall ? <><NumberField label="Longueur" value={currentLength} min={.2} max={100} onChange={v => apply(q => resizeWall(q, wall.id, v, anchor))}/><div className="anchor-field"><span>Point fixe</span><div className="anchor-toggle" role="radiogroup" aria-label="Point fixe quand la longueur change">{([['a', 'Début'], ['centre', 'Milieu'], ['b', 'Fin']] as const).map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={anchor === value} className={anchor === value ? 'active' : ''} onClick={() => setAnchor(value)}>{label}</button>)}</div></div><NumberField label="Hauteur" value={wall.height} min={.5} max={6} onChange={v => updateWall({ height: v })}/><NumberField label="Épaisseur" value={wall.thickness} min={.05} max={1} step={.01} onChange={v => updateWall({ thickness: v })}/><NumberField label="Orientation" value={currentAngle} min={-360} max={360} step={1} unit="°" onChange={v => apply(q => orientWall(q, wall.id, v, anchor))}/><NumberField label="Courbure" value={wall.angle ?? 0} min={-300} max={300} step={5} unit="°" onChange={v => updateWall({ angle: Math.abs(v) < .5 ? undefined : v })}/><NumberField label="Position X" value={(wall.a.x + wall.b.x) / 2} onChange={v => move(wall.id, v - (wall.a.x + wall.b.x) / 2, 0)}/><NumberField label="Position Y" value={(wall.a.y + wall.b.y) / 2} onChange={v => move(wall.id, 0, v - (wall.a.y + wall.b.y) / 2)}/></> : item && <><NumberField label="Largeur" value={item.width} min={.05} max={20} onChange={v => updateItem({ width: v })}/><NumberField label="Profondeur" value={item.depth} min={.05} max={20} onChange={v => updateItem({ depth: v })}/><NumberField label="Hauteur" value={item.height} min={.05} max={10} onChange={v => updateItem({ height: v })}/><NumberField label="Rotation" value={item.rotation} min={-360} max={360} step={1} unit="°" onChange={v => updateItem({ rotation: v })}/><NumberField label="Position X" value={item.x} onChange={v => updateItem({ x: v })}/><NumberField label="Position Y" value={item.y} onChange={v => updateItem({ y: v })}/></>}</div>
 {wall && <div className="wall-actions"><button className="outline-button" title="Couper le mur en deux en son milieu (clic droit sur le mur : couper à l’endroit voulu)" onClick={() => apply(q => splitWall(q, wall.id, currentLength / 2))}><Scissors /> Couper au milieu</button><button className="outline-button" title="Réunir avec le mur dans son prolongement" disabled={!mergeCandidate(project, wall.id, 'a') && !mergeCandidate(project, wall.id, 'b')} onClick={() => { const end = mergeCandidate(project, wall.id, 'b') ? 'b' : 'a', other = mergeCandidate(project, wall.id, end)!.wall; if (other.thickness !== wall.thickness || other.height !== wall.height) toast.info(`Épaisseur et hauteur de « ${wall.name} » conservées.`); apply(q => mergeWalls(q, wall.id, end)); }}><Combine /> Fusionner</button><button className="outline-button" title="Mettre le mur à 90° de son voisin, en pivotant autour de l’angle" onClick={() => squareWall(wall.id)}><SquareDashedBottom /> Équerre</button></div>}
 {wall && <div className="openings"><div className="opening-actions"><button className="outline-button" disabled={wall.openings.length >= 12} onClick={() => addOpening('door')}><DoorOpen /> Ajouter une porte</button><button className="outline-button" disabled={wall.openings.length >= 12} onClick={() => addOpening('window')}><AppWindow /> Ajouter une fenêtre</button></div>{wall.openings.map((o, index) => <div className="opening-row" key={o.id}><span>{o.kind === 'door' ? 'Porte' : 'Fenêtre'} {index + 1}</span><NumberField label="Largeur" value={o.width} min={.2} max={8} onChange={v => apply(q => setOpeningWidth(q, o.id, v))}/><NumberField label="Position" value={o.offset * 100} min={0} max={100} unit="%" step={1} onChange={v => apply(q => placeOpeningAt(q, o.id, currentLength * v / 100))}/><NumberField label="Hauteur" value={o.height} min={.2} max={5} onChange={v => apply(q => editOpening(q, o.id, { height: v }))}/>{o.kind === 'window' && <NumberField label="Allège" value={o.sill} min={0} max={4} onChange={v => apply(q => editOpening(q, o.id, { sill: v }))}/>}<button className="icon-button danger" aria-label={`Supprimer ${o.kind === 'door' ? 'la porte' : 'la fenêtre'} ${index + 1}`} onClick={() => updateWall({ openings: wall.openings.filter(x => x.id !== o.id) })}><Trash2 /></button></div>)}</div>}
 </> : <div className="selection-empty"><MousePointer2 /><div><strong>{project.background && !project.calibrated ? 'Commencez par définir l’échelle' : 'Sélectionnez un mur ou un objet'}</strong><p>{project.background && !project.calibrated ? 'Repérez deux points cotés sur le plan, puis indiquez leur distance réelle.' : 'Modifiez ses dimensions ici, ou déplacez-le directement dans le plan 2D.'}</p></div><button className="outline-button" onClick={() => setTab('catalog')}><Armchair /> Ajouter du mobilier</button></div>}</section>
 <footer className="statusbar"><span><Check size={13}/>{saved}</span><span>{project.calibrated ? '1 unité = 1 mètre' : 'Dimensions provisoires'} · Reconstruction à vérifier</span></footer></section>
 <ChangesPanel project={project} changes={changes} showChanges={showChanges} onShowChanges={setShowChanges} canUndo={past.length > 0 && past[past.length - 1].journal?.at(-1)?.id !== project.journal?.at(-1)?.id} onUndo={undo} onEntry={showEntry} onDetails={() => setChangesOpen(true)} onReset={() => setConfirm('reset')} onCorrect={() => project.journal?.length || changes?.count ? setConfirm('survey') : correctSurvey()} onFinish={finishSurvey}/></div>
 <Dialog open={settings} onOpenChange={setSettings}><DialogContent><DialogTitle>Connexions IA</DialogTitle><DialogDescription>Utilisez votre clé API OpenAI pour analyser vos plans. L’éditeur et l’exemple fonctionnent sans connexion.</DialogDescription><label className="form-label">Clé API OpenAI<input type="password" autoComplete="off" spellCheck={false} placeholder="sk-…" value={apiKey} onChange={e => setApiKey(e.target.value)}/></label><label className="form-label">Clé API Meshy · produits 3D<input type="password" autoComplete="off" spellCheck={false} placeholder="msy_…" value={meshyKey} onChange={e=>setMeshyKey(e.target.value)}/></label><label className="form-label">Identifiant du modèle OpenAI<input value={model} onChange={e => setModel(e.target.value)} placeholder="gpt-6-astra"/></label><p className="small-text">Le modèle choisi dans cette application est indépendant de celui de votre conversation ChatGPT ou Codex.</p><p className="small-text">Les clés restent en mémoire dans cet onglet, sans sauvegarde dans le projet. Elles sont transmises au serveur uniquement pour appeler le service correspondant. OpenAI analyse les plans et les fiches produit ; Meshy génère les modèles 3D avec vos crédits.</p><div className="dialog-actions"><button className="outline-button" onClick={() => { setApiKey('');setMeshyKey(''); setSettings(false); }}>Déconnecter</button><button className="primary-button" disabled={!apiKey.trim()&&!meshyKey.trim()} onClick={() => setSettings(false)}><Check /> Utiliser cette connexion</button></div></DialogContent></Dialog>
 <Dialog open={scaleDistance !== null} onOpenChange={open => { if (!open)
        setScaleDistance(null); }}><DialogContent><DialogTitle>Quelle est la distance réelle ?</DialogTitle><DialogDescription>Indiquez la longueur entre les deux points choisis. Les positions des murs et objets seront remises à l’échelle. Le mobilier conserve ses dimensions.</DialogDescription><label className="form-label">Distance en mètres<input autoFocus type="number" min="0.1" max="100" step="0.01" placeholder="Ex. 4.20" value={realDistance} onChange={e => setRealDistance(e.target.value)}/></label><button className="primary-button" disabled={!(Number(realDistance) >= .1 && Number(realDistance) <= 100)} onClick={() => { try {
        const p = validateProject(rescale(project, Number(realDistance) / scaleDistance!));
        commit(p, undefined, false);
        setScaleDistance(null);
        setTool('select');
        setRevision(r => r + 1);
        toast.success('Échelle appliquée');
    }
    catch {
        toast.error('Cette échelle produit des dimensions trop grandes. Vérifiez les deux points.');
    } }}><Ruler /> Appliquer l’échelle</button></DialogContent></Dialog>
 {changes && <ChangesDialog open={changesOpen} onOpenChange={setChangesOpen} project={project} changes={changes} onRow={showRow} onDownload={json => { download(new Blob([json], { type: 'application/json' }), `${project.name || 'conceptuo'}-modifications.json`); toast.success('Modifications téléchargées'); }}/>}
 <Dialog open={confirm !== null} onOpenChange={open => { if (!open) setConfirm(null); }}><DialogContent><DialogTitle>{confirm === 'survey' ? 'Corriger l’existant ?' : 'Annuler toutes les modifications ?'}</DialogTitle><DialogDescription>{confirm === 'survey' ? 'Le plan revient à l’existant pour que vous corrigiez le relevé : les modifications en cours sont retirées. Annuler (⌘ Z) permet de revenir en arrière.' : 'Le plan revient à l’existant et le journal repart de zéro. Annuler (⌘ Z) permet de revenir en arrière.'}</DialogDescription><div className="dialog-actions"><button className="outline-button" onClick={() => setConfirm(null)}>Garder les modifications</button><button className="primary-button" onClick={confirm === 'survey' ? correctSurvey : resetChanges}><RotateCcw /> {confirm === 'survey' ? 'Corriger l’existant' : 'Tout annuler'}</button></div></DialogContent></Dialog>
 {(busy || !loaded) && <div className="busy-overlay" role="status" aria-live="polite"><div><Loader2 className="animate-spin"/><h2>{busy || 'Ouverture de votre atelier…'}</h2><p>{abort.current ? 'Cela peut prendre une à deux minutes.' : 'Un instant, votre projet se prépare.'}</p>{abort.current && <button className="outline-button" onClick={() => abort.current?.abort()}>Annuler l’analyse</button>}</div></div>}
 </main>;
}
