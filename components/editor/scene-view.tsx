"use client";
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildScene, disposeObject } from '@/lib/editor/scene';
import { bounds, type Project } from '@/lib/editor/model';
import RenderDialog,{type Viewpoint} from './render-dialog';
import { Maximize, RotateCcw,Camera } from 'lucide-react';
type Props = {
    project: Project;
    selected: string | null;
    onSelect: (id: string | null) => void;
    revision: number;
};
export default function SceneView(props: Props) {
    const [renderOpen,setRenderOpen]=useState(false),[viewpoint,setViewpoint]=useState<Viewpoint|null>(null);
    const host = useRef<HTMLDivElement>(null), latest = useRef(props);
    latest.current = props;
    const runtime = useRef<{
        scene: THREE.Scene;
        camera: THREE.PerspectiveCamera;
        controls: OrbitControls;
        root: THREE.Group | null;
        renderer: THREE.WebGLRenderer;
        fit: () => void;
    } | null>(null);
    const [error, setError] = useState(''), [ready, setReady] = useState(false);
    useEffect(() => {
        const el = host.current;
        if (!el)
            return;
        let renderer: THREE.WebGLRenderer;
        try {
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        }
        catch {
            setError('La vue 3D nécessite WebGL. Le plan 2D reste utilisable.');
            return;
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.setClearColor('#ece9e2');
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        el.appendChild(renderer.domElement);
        renderer.domElement.setAttribute('aria-label', 'Maquette 3D du plan 2D : glissez pour tourner, cliquez un élément pour le sélectionner');
        renderer.domElement.tabIndex = 0;
        const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, .05, 500), controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.maxPolarAngle = Math.PI / 2.05;
        controls.minDistance = 1;
        controls.maxDistance = 250;
        scene.add(new THREE.HemisphereLight('#fffaf0', '#9b9180', 2.5));
        const sun = new THREE.DirectionalLight('#fff8e9', 3);
        sun.position.set(5, 14, 8);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 });
        sun.shadow.bias = -.0004;
        scene.add(sun);
        const grid = new THREE.GridHelper(100, 100, '#c8c1b5', '#ded8ce');
        grid.position.y = -.13;
        scene.add(grid);
        const fit = () => { const b = bounds(latest.current.project), size = Math.max(b.width, b.height, 4), cx = b.x + b.width / 2, cz = b.y + b.height / 2; controls.target.set(cx, .2, cz); camera.position.set(cx + size * .95, size * 1.1, cz + size * 1.3); controls.update(); };
        runtime.current = { scene, camera, controls, root: null, renderer, fit };
        fit();
        const resize = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h)
            return; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
        const observer = new ResizeObserver(resize);
        observer.observe(el);
        resize();
        // lecture seule : la 3D représente le plan 2D, où se font toutes les modifications. Un clic
        // (sans glisser, sinon c'est la caméra qui tourne) sélectionne l'élément visé.
        const ray = new THREE.Raycaster();
        let press: { x: number; y: number } | null = null;
        const down = (e: PointerEvent) => { press = e.button === 0 ? { x: e.clientX, y: e.clientY } : null; };
        const up = (e: PointerEvent) => { const p = press; press = null; const root = runtime.current?.root; if (!p || !root || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 3)
            return; const r = renderer.domElement.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera);
            let o: THREE.Object3D | null = ray.intersectObject(root, true)[0]?.object ?? null; while (o && !o.userData.entityId)
            o = o.parent; latest.current.onSelect(o ? o.userData.entityId : null); };
        renderer.domElement.addEventListener('pointerdown', down);
        renderer.domElement.addEventListener('pointerup', up);
        let frame = 0;
        const animate = () => { frame = requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); };
        animate();
        setReady(true);
        return () => { cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); renderer.domElement.removeEventListener('pointerdown', down); renderer.domElement.removeEventListener('pointerup', up); disposeObject(scene); renderer.dispose(); renderer.domElement.remove(); runtime.current = null; };
    }, []);
    useEffect(() => { if (!ready || !runtime.current)
        return; let cancelled = false; const rt = runtime.current; setError(''); buildScene(props.project, props.selected).then(root => { if (cancelled) {
        disposeObject(root);
        return;
    } if (rt.root) {
        rt.scene.remove(rt.root);
        disposeObject(rt.root);
    } rt.root = root; rt.scene.add(root); }).catch(e => { if (!cancelled)
        setError(e instanceof Error ? e.message : 'Impossible de construire la scène.'); }); return () => { cancelled = true; }; }, [props.project, props.selected, ready]);
    useEffect(() => { runtime.current?.fit(); }, [props.revision]);
    return <div className="scene-area"><RenderDialog open={renderOpen} onOpenChange={setRenderOpen} project={props.project} viewpoint={viewpoint}/><button className="render-launch" disabled={!props.project.walls.length&&!props.project.items.length} onClick={()=>{const r=runtime.current;if(r){setViewpoint({position:r.camera.position.toArray() as [number,number,number],target:r.controls.target.toArray() as [number,number,number],fov:r.camera.fov});setRenderOpen(true)}}}><Camera/> Rendu réaliste</button><div ref={host} className="three-host"/>{error && <div className="scene-error" role="alert">{error}</div>}<div className="scene-controls"><button className="icon-button" title="Recentrer la maquette" aria-label="Recentrer la maquette" onClick={() => runtime.current?.fit()}><Maximize /></button><button className="icon-button" title="Vue de dessus" aria-label="Vue de dessus" onClick={() => { const r = runtime.current; if (r) {
        const t = r.controls.target;
        r.camera.position.set(t.x, t.y + Math.max(bounds(props.project).width, bounds(props.project).height) * 1.8, t.z + .01);
        r.controls.update();
    } }}><RotateCcw /></button></div><span className="scene-hint">Glisser : tourner · Molette : zoomer<br />Clic : sélectionner</span></div>;
}
