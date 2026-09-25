"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { bounds, length, moveEntity, round, type Point, type Project, type Tool, type Wall } from '@/lib/editor/model';
import {moveOpening,openingSelection} from '@/lib/editor/openings';
import { angleThrough, apex, pointAt, sweep, wallPath } from '@/lib/editor/arc';
import { closestOnAxis, faceEnds, junctionOf, junctions, moveJunction, straightOutline } from '@/lib/editor/joints';
import { facingWalls, offsetWall, openingChain, placeOpeningAt, resizeWall, setClearance, setSegment, type Anchor } from '@/lib/editor/edits';
import { formatLength, parseLength, type Parsed } from '@/lib/editor/units';
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';
import DimensionInput from './dimension-input';
import PlanMenu, { type MenuTarget } from './plan-menu';
import type { PlanChanges } from '@/lib/editor/changes';
import type { Room } from '@/lib/editor/rooms';
import { Maximize, Minus, Plus } from 'lucide-react';
type Props = {
    project: Project;
    selected: string | null;
    tool: Tool;
    opacity: number;
    revision: number;
    /** point fixe quand on change la longueur d'un mur */
    anchor: Anchor;
    onAnchor: (a: Anchor) => void;
    onSelect: (id: string | null) => void;
    onCommit: (p: Project) => void;
    /** modification contrôlée : rend false (et prévient) si elle est refusée */
    onEdit: (edit: (p: Project) => Project) => boolean;
    onWall: (a: Point, b: Point) => void;
    onScale: (distance: number) => void;
    onOpening:(wallId:string,kind:'door'|'window',point:Point)=>void;
    onDuplicate: () => void;
    onRemove: () => void;
    /** écarts avec l'existant validé, dessinés par-dessus le plan (null : masqués) */
    changes?: PlanChanges | null;
    /** repère à montrer : le plan zoome dessus et le repère clignote */
    focus?: { point: Point; ref: number; key: number } | null;
    /** pièces calculées à partir des murs (lib/editor/rooms.ts) : nom et surface, cliquables */
    rooms: Room[];
};
/** Cote du plan. Tracée de `from` à `to`, décalée de `gap` (m) vers la gauche de from→to ;
 *  sans `line`, seul le texte est affiché, en `from`. Un clic ouvre la saisie. */
type Dim = { key: string; from: Point; to: Point; gap: number; value: number; hint: string; label?: string; title?: string; line?: boolean; arrow?: boolean; anchor?: boolean; percentOf?: number; percent?: boolean; apply: (v: Parsed) => (p: Project) => Project };
const mm = (n: number) => Math.round(n * 1000) / 1000;
/** Maj enfoncée : direction ramenée au multiple de 45° le plus proche, longueur au 5 cm. */
function ortho(from: Point, to: Point): Point {
    const step = Math.PI / 4, a = Math.round(Math.atan2(to.y - from.y, to.x - from.x) / step) * step, d = Math.round(Math.hypot(to.x - from.x, to.y - from.y) * 20) / 20;
    return { x: mm(from.x + Math.cos(a) * d), y: mm(from.y + Math.sin(a) * d) };
}
/** Normale gauche d'un mur à l'abscisse s. */
function normalAt(w: Wall, s: number) { const h = pointAt(w, s).heading; return { x: -Math.sin(h), y: Math.cos(h) }; }
const shift = (p: Point, n: Point, d: number) => ({ x: p.x + n.x * d, y: p.y + n.y * d });
export default function PlanView(props: Props) {
    const svg = useRef<SVGSVGElement>(null), area = useRef<HTMLDivElement>(null), [view, setView] = useState(() => bounds(props.project)), [zoom, setZoom] = useState(1), [first, setFirst] = useState<Point | null>(null), [cursor, setCursor] = useState<Point | null>(null), [draft, setDraft] = useState<Project | null>(null);
    const [menu, setMenu] = useState<MenuTarget | null>(null), menuTarget = useRef<MenuTarget | null>(null), [size, setSize] = useState({ w: 0, h: 0 });
    // cote en saisie : oubliée dès que la sélection, l'outil ou le projet chargé change
    const owner = `${props.selected}|${props.tool}|${props.revision}`, [edited, setEdited] = useState<{ key: string; owner: string } | null>(null);
    const editing = edited?.owner === owner ? edited.key : null, setEditing = (key: string | null) => setEdited(key ? { key, owner } : null);
    const drag = useRef<{
        id: string;
        start: Point;
        base: Project;
        endpoint?: 'a' | 'b' | 'bend';
        /** murs raccordés à l'angle saisi : on ne s'aimante pas sur eux */
        linked?: Set<string>;
    } | null>(null);
    useEffect(() => { setView(bounds(props.project)); setZoom(1); setFirst(null); }, [props.revision]);
    useEffect(() => { setFirst(null); setCursor(null); }, [props.tool]);
    // repère demandé depuis le tableau des modifications : cadrage de 4 m autour de lui
    const [framed, setFramed] = useState<number | null>(null);
    if (props.focus && props.focus.key !== framed) { setFramed(props.focus.key); setView({ x: props.focus.point.x - 2, y: props.focus.point.y - 2, width: 4, height: 4 }); setZoom(1); }
    // taille de la zone du plan, pour poser le champ de saisie sur la cote
    useEffect(() => { const el = area.current; if (!el) return; const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height })); ro.observe(el); return () => ro.disconnect(); }, []);
    const p = draft ?? props.project, pad = Math.max(view.width, view.height) * .1, vw = (view.width + pad * 2) / zoom, vh = (view.height + pad * 2) / zoom, vx = view.x + view.width / 2 - vw / 2, vy = view.y + view.height / 2 - vh / 2;
    const point = (e: { clientX: number; clientY: number }) => { const matrix = svg.current?.getScreenCTM(); if (!matrix)
        return { x: 0, y: 0 }; const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse()); return { x: pt.x, y: pt.y }; };
    const snapped = (p: Point) => ({ x: round(Math.round(p.x * 20) / 20), y: round(Math.round(p.y * 20) / 20) });
    // aimant : un bout de mur, sinon l'axe d'un mur, à une dizaine de pixels ; sinon la grille de 5 cm
    const magnet = (p: Point, base: Project, skip: Set<string> = new Set()) => {
        let best: Point | null = null, reach = svg.current?.clientWidth ? vw / svg.current.clientWidth * 10 : .15;
        for (const w of base.walls) if (!skip.has(w.id)) for (const e of [w.a, w.b]) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < reach) { reach = d; best = e; } }
        if (best) return { ...best };
        for (const w of base.walls) if (!skip.has(w.id)) { const q = closestOnAxis(w, p), d = Math.hypot(q.x - p.x, q.y - p.y); if (d < reach) { reach = d; best = q; } }
        return best ? { x: Math.round(best.x * 1000) / 1000, y: Math.round(best.y * 1000) / 1000 } : snapped(p);
    };
    const down = (e: React.PointerEvent, id?: string, endpoint?: 'a' | 'b' | 'bend') => {
        if (e.button !== 0)
            return;
        const pt = point(e);
        if(props.tool==='door'||props.tool==='window'){
            e.stopPropagation();
            const wall=props.project.walls.find(w=>w.id===id)??openingSelection(props.project,id??null)?.wall;
            if(wall)props.onOpening(wall.id,props.tool,pt);
            return;
        }
        if (props.tool === 'select' && id) {
            e.stopPropagation();
            props.onSelect(id);
            const node = endpoint === 'a' || endpoint === 'b' ? junctionOf(junctions(props.project.walls), id, endpoint) : null;
            drag.current = { id, start: pt, base: props.project, endpoint, linked: new Set(node ? node.ends.map(e => e.wall) : []) };
            svg.current?.setPointerCapture(e.pointerId);
            return;
        }
        if (id)
            return;
        if (props.tool === 'select') {
            props.onSelect(null);
            return;
        }
        const next = props.tool === 'scale' ? pt : first && e.shiftKey ? ortho(first, pt) : magnet(pt, props.project);
        if (!first) {
            setFirst(next);
            setCursor(next);
        }
        else {
            const distance = Math.hypot(next.x - first.x, next.y - first.y);
            if (distance > .05) {
                if (props.tool === 'wall')
                    props.onWall(first, next);
                else
                    props.onScale(distance);
                setFirst(null);
                setCursor(null);
            }
        }
    };
    const move = (e: React.PointerEvent) => {
        const pt = point(e);
        if (first)
            setCursor(props.tool === 'scale' ? pt : e.shiftKey ? ortho(first, pt) : magnet(pt, props.project));
        const d = drag.current;
        if (!d)
            return;
        if(openingSelection(d.base,d.id)){setDraft(moveOpening(d.base,d.id,pt));return;}
        if (d.endpoint === 'bend') {
            // poignée centrale : le mur passe par a, b et le pointeur
            setDraft({ ...d.base, walls: d.base.walls.map(w => w.id === d.id ? { ...w, angle: angleThrough(w, pt) || undefined } : w) });
        }
        else if (d.endpoint) {
            // l'angle entier suit : tous les murs raccordés à ce bout ; Maj : angle bloqué à 45°
            const w = d.base.walls.find(o => o.id === d.id)!, fixed = w[d.endpoint === 'a' ? 'b' : 'a'];
            setDraft(moveJunction(d.base, d.id, d.endpoint, e.shiftKey ? ortho(fixed, pt) : magnet(pt, d.base, d.linked)));
        }
        else {
            const delta = snapped({ x: pt.x - d.start.x, y: pt.y - d.start.y });
            // Maj : déplacement sur un seul axe
            if (e.shiftKey) { if (Math.abs(delta.x) > Math.abs(delta.y)) delta.y = 0; else delta.x = 0; }
            setDraft(moveEntity(d.base, d.id, delta.x, delta.y));
        }
    };
    const up = (e: React.PointerEvent) => { if (drag.current) {
        if (draft)
            props.onCommit(draft);
        drag.current = null;
        setDraft(null);
        if (svg.current?.hasPointerCapture(e.pointerId))
            svg.current.releasePointerCapture(e.pointerId);
    } };
    // tracé d'un mur : après le premier clic, on peut taper sa longueur puis Entrée
    const [typing, setTyping] = useState<{ text: string; from: Point | null }>({ text: '', from: null }), typed = typing.from === first ? typing.text : '';
    const onWall = props.onWall;
    useEffect(() => {
        const setTyped = (edit: (t: string) => string) => setTyping(t => ({ text: edit(t.from === first ? t.text : ''), from: first }));
        if (props.tool !== 'wall' || !first) return;
        const onKey = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement).closest('input,textarea,[contenteditable=true],[role=dialog]') || e.metaKey || e.ctrlKey || e.altKey) return;
            if (/^[\d.,cm]$/i.test(e.key)) setTyped(t => t + e.key.toLowerCase());
            else if (e.key === 'Backspace') setTyped(t => t.slice(0, -1));
            else if (e.key === 'Enter' && typed) {
                const c = cursor ?? first, d = Math.hypot(c.x - first.x, c.y - first.y), v = parseLength(typed, d);
                if (!v || v.value < .05 || v.value > 100) { toast.error(`Longueur illisible : « ${typed} ». Exemples : 3,45 · 345cm`); return; }
                const u = d > 1e-6 ? { x: (c.x - first.x) / d, y: (c.y - first.y) / d } : { x: 1, y: 0 };
                onWall(first, { x: mm(first.x + u.x * v.value), y: mm(first.y + u.y * v.value) });
                setFirst(null);
                setCursor(null);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [props.tool, first, cursor, typed, onWall]);
    // bouts de murs coupés d'onglet aux angles : même contour qu'en 3D
    const ends = useMemo(() => faceEnds(p.walls), [p.walls]);
    const font = Math.max(vw, vh) * .021;
    // cotes de la sélection : longueur, chaîne des baies, face à face, position en %
    const dims: Dim[] = [];
    const chosen = props.tool === 'select' ? p.walls.find(w => w.id === props.selected) : undefined, bay = props.tool === 'select' ? openingSelection(p, props.selected) : null, host = chosen ?? bay?.wall;
    if (host) {
        const w = host, L = length(w), curved = !!sweep(w), away = w.thickness / 2 + font * 1.5;
        if (chosen) dims.push({ key: 'length', ...(curved ? { from: shift(apex(w), normalAt(w, L / 2), Math.sign(w.angle ?? 1) * away), to: shift(apex(w), normalAt(w, L / 2), Math.sign(w.angle ?? 1) * away), line: false, label: `${formatLength(L)} m · ${Math.round(w.angle ?? 0)}°` } : { from: w.a, to: w.b }), gap: away, value: L, anchor: true, hint: 'Longueur : 3,45 · 345cm · +12cm · 110%', apply: v => q => resizeWall(q, w.id, v.value, props.anchor) });
        if (!curved) openingChain(w).forEach((s, i) => dims.push({ key: `chain-${i}`, from: pointAt(w, s.from).point, to: pointAt(w, s.to).point, gap: -away, value: s.to - s.from, percentOf: L,
            hint: s.kind === 'gap' ? 'Écart : 0,80 · 80cm · 50% = baie centrée' : 'Largeur de l’ouverture',
            title: s.kind === 'width' ? `Centre à ${Math.round((s.from + s.to) / 2 / L * 100)} % du mur` : undefined,
            apply: v => q => setSegment(q, w.id, i, v.value, s.kind === 'gap' ? v.percent : undefined) }));
        if (chosen) for (const f of facingWalls(p, w.id)) dims.push({ key: `face-${f.side}`, from: f.from, to: f.to, gap: 0, value: f.clear, hint: `Distance face à face avec « ${f.wall.name} »`, apply: v => q => setClearance(q, w.id, f.side, v.value) });
        if (chosen && editing === 'shift') { const s = L / 2, at = pointAt(w, s).point, n = normalAt(w, s); dims.push({ key: 'shift', from: shift(at, n, w.thickness / 2), to: shift(at, n, w.thickness / 2 + font * 3), gap: 0, arrow: true, value: 0, label: 'décaler', hint: 'Décaler dans le sens de la flèche (négatif : sens opposé)', apply: v => q => offsetWall(q, w.id, v.value) }); }
        if (bay) { const o = bay.opening, s = o.offset * L, at = shift(pointAt(w, s).point, normalAt(w, s), away), pct = Math.round(o.offset * 1000) / 10; dims.push({ key: 'percent', from: at, to: at, line: false, gap: 0, value: pct, percent: true, label: `${String(pct).replace('.', ',')} %`, title: 'Position du centre, en % de la longueur du mur', hint: 'Position du centre en % du mur', apply: v => q => placeOpeningAt(q, o.id, v.value) }); }
    }
    const textAt = (d: Dim) => { const a = shift(d.from, dimNormal(d), d.gap), b = shift(d.to, dimNormal(d), d.gap); return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
    function dimNormal(d: Dim) { const dx = d.to.x - d.from.x, dy = d.to.y - d.from.y, l = Math.hypot(dx, dy) || 1; return { x: -dy / l, y: dx / l }; }
    function submit(d: Dim, text: string, step: 0 | 1 | -1) {
        let v: Parsed | null;
        if (d.percent) { const m = /^\s*(\d+(?:[.,]\d*)?)\s*%?\s*$/.exec(text), n = m ? Number(m[1].replace(',', '.')) : NaN; v = Number.isFinite(n) && host ? { value: length(host) * n / 100, percent: n } : null; }
        else v = parseLength(text, d.value, d.percentOf ?? d.value);
        if (!v) { toast.error(`Cote illisible : « ${text} ». ${d.hint}`); return false; }
        if (!props.onEdit(d.apply(v))) return false;
        const i = dims.findIndex(x => x.key === d.key);
        setEditing(step && dims.length > 1 ? dims[(i + step + dims.length) % dims.length].key : null);
        return true;
    }
    const dimNode = (d: Dim) => {
        const n = dimNormal(d), a = shift(d.from, n, d.gap), b = shift(d.to, n, d.gap), mid = textAt(d), stroke = font * .05, tick = font * .3;
        let deg = Math.atan2(d.to.y - d.from.y, d.to.x - d.from.x) * 180 / Math.PI;
        if (deg > 90 || deg <= -90) deg += 180;
        if (d.line === false) deg = 0;
        const text = d.label ?? formatLength(d.value), width = text.length * font * .5 + font * .5, u = { x: n.y, y: -n.x };
        return <g key={d.key} className={`plan-dim ${editing === d.key ? 'editing' : ''}`} onPointerDown={e => e.stopPropagation()} onClick={() => setEditing(d.key)}>
            <title>{d.title ? `${d.title} — cliquer pour saisir` : 'Cliquer pour saisir la cote'}</title>
            {d.line !== false && <g stroke="#8e642d" strokeWidth={stroke}>
                {d.gap !== 0 && <><line x1={d.from.x} y1={d.from.y} x2={a.x + n.x * tick * Math.sign(d.gap)} y2={a.y + n.y * tick * Math.sign(d.gap)} strokeOpacity=".45"/><line x1={d.to.x} y1={d.to.y} x2={b.x + n.x * tick * Math.sign(d.gap)} y2={b.y + n.y * tick * Math.sign(d.gap)} strokeOpacity=".45"/></>}
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>
                {d.arrow ? <polygon points={`${b.x},${b.y} ${b.x - u.x * tick * 1.6 + n.x * tick * .8},${b.y - u.y * tick * 1.6 + n.y * tick * .8} ${b.x - u.x * tick * 1.6 - n.x * tick * .8},${b.y - u.y * tick * 1.6 - n.y * tick * .8}`} fill="#8e642d" stroke="none"/>
                    : [a, b].map((q, i) => <line key={i} x1={q.x - (u.x + n.x) * tick / 2} y1={q.y - (u.y + n.y) * tick / 2} x2={q.x + (u.x + n.x) * tick / 2} y2={q.y + (u.y + n.y) * tick / 2}/>)}
            </g>}
            <g transform={`rotate(${deg} ${mid.x} ${mid.y})`}><rect x={mid.x - width / 2} y={mid.y - font * .55} width={width} height={font * 1.1} rx={font * .2} className="plan-dim-box"/><text x={mid.x} y={mid.y} fontSize={font * .8} textAnchor="middle" dominantBaseline="central">{text}</text></g>
        </g>;
    };
    // Plan de travaux : jaune = à démolir, rouge = à construire. Un repère numéroté par poste, le
    // même que dans le tableau des modifications (voir lib/editor/changes.ts).
    const changeLayer = (c: PlanChanges) => {
        const existing = new Map((props.project.existing?.walls ?? []).map(w => [w.id, w])), current = new Map(p.walls.map(w => [w.id, w]));
        // un mur courbe est démoli ou construit entier : on suit son arc
        const band = (key: string, from: Point, to: Point, width: number, stroke: string, wall?: Wall, extra: React.SVGProps<SVGPathElement> = {}) =>
            <path key={key} d={wall?.angle ? wallPath(wall) : `M${from.x} ${from.y} L${to.x} ${to.y}`} fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="butt" {...extra}/>;
        const marks: { ref: number; at: Point; demolition: boolean }[] = [];
        const r = font * .95, least = font * .4;   // repère et bande lisibles même sur une cloison fine
        // un repère ne cache pas le nom d'une pièce : il glisse le long de sa portion jusqu'à une place libre
        const names = props.rooms.map(room => ({ x: room.at.x, y: room.at.y, w: Math.max(...[room.name, '00,00 m² · recalculée'].map(t => t.length)) * font * .3 + r, h: font * 1.3 + r }));
        const free = (q: Point) => !names.some(n => Math.abs(q.x - n.x) < n.w && q.y > n.y - font - r * .2 && q.y < n.y + n.h);
        const spot = (from: Point, to: Point, mid: Point) => {
            if (free(mid)) return mid;
            for (const t of [.35, .65, .2, .8, .08, .92]) { const q = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }; if (free(q)) return q; }
            return mid;
        };
        return <g className="plan-changes" pointerEvents="none">
            <defs><pattern id="demolition-hatch" width=".12" height=".12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width=".12" height=".12" fill="#f6d34a" fillOpacity=".55"/><line x1="0" y1="0" x2="0" y2=".12" stroke="#c99a06" strokeWidth=".045"/></pattern></defs>
            {c.demolished.map(d => { marks.push({ ref: d.ref, at: spot(d.from, d.to, d.mid), demolition: true }); const w = existing.get(d.existingWallId ?? ''); return band(`d${d.ref}`, d.from, d.to, Math.max(d.thickness, least), 'url(#demolition-hatch)', w); })}
            {c.built.map(b => { marks.push({ ref: b.ref, at: spot(b.from, b.to, b.mid), demolition: false }); return band(`b${b.ref}`, b.from, b.to, Math.max(b.thickness, least), '#d23a2f', current.get(b.wallId), { strokeOpacity: .75 }); })}
            {c.resized.map(x => { marks.push({ ref: x.ref, at: spot(x.from, x.to, x.mid), demolition: false }); return band(`r${x.ref}`, x.from, x.to, Math.max(x.after.thickness, x.before.thickness), '#d23a2f', undefined, { strokeOpacity: .5, strokeDasharray: `${font * .5} ${font * .3}` }); })}
            {c.openingsCreated.map(o => { marks.push({ ref: o.ref, at: o.mid, demolition: false }); return band(`c${o.ref}`, o.after!.from, o.after!.to, (current.get(o.wallId)?.thickness ?? .2) * 1.5, '#d23a2f', undefined, { strokeOpacity: .85 }); })}
            {c.openingsFilled.map(o => { marks.push({ ref: o.ref, at: o.mid, demolition: true }); return band(`f${o.ref}`, o.before!.from, o.before!.to, (existing.get(o.existingWallId)?.thickness ?? .2) * 1.5, 'url(#demolition-hatch)'); })}
            {c.openingsModified.map(o => { marks.push({ ref: o.ref, at: o.mid, demolition: false }); return band(`m${o.ref}`, o.after!.from, o.after!.to, (current.get(o.wallId)?.thickness ?? .2) * 1.5, '#d23a2f', undefined, { strokeOpacity: .5, strokeDasharray: `${font * .3} ${font * .2}` }); })}
            {marks.map(k => <g key={`k${k.ref}`} className={props.focus?.ref === k.ref ? 'change-focus' : undefined}>
                <circle cx={k.at.x} cy={k.at.y} r={r} fill={k.demolition ? '#f6d34a' : '#d23a2f'} stroke={k.demolition ? '#7a5f00' : '#fff'} strokeWidth={r * .15}/>
                <text x={k.at.x} y={k.at.y} fontSize={r * (k.ref > 9 ? 1 : 1.15)} textAnchor="middle" dominantBaseline="central" fill={k.demolition ? '#4a3a05' : '#fff'} fontWeight="600">{k.ref}</text>
            </g>)}
        </g>;
    };
    const editedDim = dims.find(d => d.key === editing);
    // position du champ de saisie dans la zone du plan (viewBox centré, à l'échelle), gardé à l'intérieur
    const screen = (q: Point) => { const k = Math.min(size.w / vw, size.h / vh), x = (size.w - vw * k) / 2 + (q.x - vx) * k, y = (size.h - vh * k) / 2 + (q.y - vy) * k; return { x: Math.max(90, Math.min(size.w - 90, x)), y: Math.max(24, Math.min(size.h - 48, y)) }; };
    const context = (e: React.MouseEvent, kind: MenuTarget['kind'], id: string) => { if (props.tool !== 'select') return; const target = { kind, id, point: point(e) }; menuTarget.current = target; setMenu(target); props.onSelect(id); };
    return <div className="plan-area" ref={area}><ContextMenu modal={false}><ContextMenuTrigger asChild><svg ref={svg} role="img" aria-label="Plan éditable, sélection et déplacement des murs et objets" tabIndex={0} onKeyDown={e => { if (e.key === 'Escape') {
        setFirst(null);
        setCursor(null);
    } }} onContextMenu={e => { if (!menuTarget.current) e.preventDefault(); menuTarget.current = null; }} className={`plan-svg ${props.tool === 'wall'||props.tool==='scale' ? 'drawing' : ''}`} viewBox={`${vx} ${vy} ${vw} ${vh}`} onPointerDown={e => down(e)} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; setDraft(null); }}>
 <defs><pattern id="plan-grid" width=".5" height=".5" patternUnits="userSpaceOnUse"><circle r=".012" fill="#c1b9ab"/></pattern></defs><rect x={vx} y={vy} width={vw} height={vh} fill="url(#plan-grid)"/>
 {p.background && <image href={p.background.data} x={0} y={0} width={p.background.width} height={p.background.height} opacity={props.opacity} style={{ pointerEvents: 'none' }}/>}
 {p.walls.map(w => { const selected = w.id === props.selected, len = length(w), top = apex(w); return <g key={w.id} onPointerDown={e => down(e, w.id)} onContextMenu={e => context(e, 'wall', w.id)} className="plan-entity"><title>{`${w.name} · ${len.toFixed(2)} m`}</title><path d={wallPath(w)} fill="none" stroke="transparent" strokeWidth={Math.max(w.thickness, .24)}/>{w.angle ? <path d={wallPath(w)} fill="none" stroke={selected ? '#b1813f' : '#645e54'} strokeWidth={w.thickness} strokeLinecap="butt"/> : <polygon points={straightOutline(w, ends.get(w.id) ?? { a: { l: 0, r: 0 }, b: { l: 0, r: 0 } }).map(q => `${q.x},${q.y}`).join(' ')} fill={selected ? '#b1813f' : '#645e54'}/>}{w.openings.map(o => {const centre=o.offset*len,start=Math.max(0,centre-o.width/2)-centre,end=Math.min(len,centre+o.width/2)-centre,active=o.id===props.selected,at=pointAt(w,centre);return <g key={o.id} transform={`translate(${at.point.x} ${at.point.y}) rotate(${at.heading*180/Math.PI})`} onPointerDown={e=>down(e,o.id)} onContextMenu={e=>context(e,'opening',o.id)} className="plan-opening"><title>{`${o.kind === 'door' ? 'Porte' : 'Fenêtre'} — glisser pour déplacer`}</title><rect x={start-.04} y={-Math.max(.15,w.thickness/2+.07)} width={end-start+.08} height={Math.max(.3,w.thickness+.14)} fill="transparent"/><rect x={start} y={-w.thickness/2-.01} width={end-start} height={w.thickness+.02} fill={active?'#d0ab6e':o.kind==='door'?'#faf9f6':'#b9d0ce'} stroke={active?'#a77837':'#8b9b98'} strokeWidth=".025"/>{o.kind==='door'?<path d={`M${start} 0 V${o.width} A${o.width} ${o.width} 0 0 0 ${end} 0`} stroke={active?'#a77837':'#9e927f'} strokeWidth=".025" fill="none" pointerEvents="none"/>:<line x1={start} x2={end} y1={0} y2={0} stroke="#698f92" strokeWidth=".035"/>}{active&&<circle cx={0} cy={0} r={font*.3} fill="#fff" stroke="#a77837" strokeWidth=".035"/>}</g>})}{selected && <>{(['a', 'b'] as const).map(end => <circle key={end} cx={w[end].x} cy={w[end].y} r={font * .42} fill={props.anchor === end ? '#b1813f' : 'white'} stroke={props.anchor === end ? 'white' : '#b1813f'} strokeWidth=".04" onPointerDown={e => down(e, w.id, end)}><title>{props.anchor === end ? 'Point fixe quand on saisit la longueur · glisser pour déplacer l’angle' : 'Glisser pour déplacer l’angle'}</title></circle>)}<rect x={top.x - font * .32} y={top.y - font * .32} width={font * .64} height={font * .64} transform={`rotate(45 ${top.x} ${top.y})`} fill="#b1813f" stroke="white" strokeWidth=".03" className="bend-handle" onPointerDown={e => down(e, w.id, 'bend')}><title>Glisser pour cintrer le mur</title></rect></>}</g>; })}
 {p.items.map(i => <g key={i.id} transform={`translate(${i.x} ${i.y}) rotate(${i.rotation})`} onPointerDown={e => down(e, i.id)} className="plan-entity"><title>{i.name}</title><rect x={-i.width / 2} y={-i.depth / 2} width={i.width} height={i.depth} rx=".06" fill={i.color} fillOpacity=".72" stroke={props.selected === i.id ? '#a5793a' : '#8c8070'} strokeWidth={props.selected === i.id ? .06 : .025}/><line x1={-i.width * .4} y1={-i.depth * .35} x2={i.width * .4} y2={-i.depth * .35} stroke="#75654f" strokeWidth=".025"/><text transform={`rotate(${-i.rotation})`} fontSize={font * .85} y={.04} textAnchor="middle" fill="#453c31" pointerEvents="none">{i.name}</text></g>)}
 {/* noms des pièces par-dessus les murs, lisibles ; preventDefault : le plan ne reprend pas le focus, le champ du nom le garde */}
 {props.rooms.map(r => { const selected = r.key === props.selected, colour = selected ? '#a5793a' : '#8b8070'; return <g key={r.key} className="plan-entity plan-room" onPointerDown={e => { if (props.tool !== 'select' || e.button !== 0) return; e.stopPropagation(); e.preventDefault(); props.onSelect(r.key); }}>
     <title>{r.computed !== null ? `${r.name} · ${r.computed.toFixed(2)} m² calculés${r.printed !== null ? ` · ${r.printed.toFixed(2)} m² imprimés` : ''}` : `${r.name} · pièce non fermée`}</title>
     <text x={r.at.x} y={r.at.y} fontSize={font} fill={colour} fontWeight={selected || r.merged ? 600 : undefined} textAnchor="middle" className="plan-room-text">{r.name}</text>
     {r.area !== null && <text x={r.at.x} y={r.at.y + font * 1.1} fontSize={font * .8} fill={colour} textAnchor="middle" className="plan-room-text">{r.area.toFixed(2).replace('.', ',')} m²{r.source === 'recalculée' ? ' · recalculée' : ''}</text>}
 </g>; })}
 {props.changes && changeLayer(props.changes)}
 {dims.map(dimNode)}
 {first && cursor && <g pointerEvents="none"><line x1={first.x} y1={first.y} x2={cursor.x} y2={cursor.y} stroke="#a77837" strokeWidth=".05" strokeDasharray=".12 .08"/><circle cx={first.x} cy={first.y} r=".07" fill="#a77837"/><text x={(first.x + cursor.x) / 2} y={(first.y + cursor.y) / 2 - .2} fontSize={font} fill="#8e642d">{props.tool === 'wall' ? typed ? `${typed} ▏ Entrée pour valider` : `${Math.hypot(cursor.x - first.x, cursor.y - first.y).toFixed(2)} m` : 'Choisir le second point'}</text></g>}
 </svg></ContextMenuTrigger><PlanMenu target={menu} project={props.project} onEdit={props.onEdit} onOpening={props.onOpening} onShift={() => setEditing('shift')} onDuplicate={props.onDuplicate} onRemove={props.onRemove}/></ContextMenu>
 {editedDim && (() => { const s = screen(textAt(editedDim)); return <DimensionInput key={editedDim.key} x={s.x} y={s.y} initial={editedDim.percent ? String(editedDim.value).replace('.', ',') : formatLength(editedDim.value)} hint={editedDim.hint} anchor={editedDim.anchor ? props.anchor : undefined} onAnchor={props.onAnchor} onSubmit={(text, step) => submit(editedDim, text, step)} onCancel={() => setEditing(null)}/>; })()}
 <div className="plan-controls"><button className="icon-button" aria-label="Dézoomer le plan" title="Dézoomer" onClick={() => setZoom(z => Math.max(.25, z / 1.25))}><Minus /></button><span>{Math.round(zoom * 100)} %</span><button className="icon-button" aria-label="Zoomer le plan" title="Zoomer" onClick={() => setZoom(z => Math.min(5, z * 1.25))}><Plus /></button><button className="icon-button" aria-label="Recentrer le plan" title="Recentrer" onClick={() => { setView(bounds(props.project)); setZoom(1); }}><Maximize /></button></div>{props.changes && <div className="plan-legend" aria-label="Légende des travaux"><span><i className="demolition"/>À démolir</span><span><i className="construction"/>À construire</span></div>}</div>;
}
