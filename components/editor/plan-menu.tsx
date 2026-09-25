"use client";
import { AppWindow, Combine, Copy, DoorOpen, MoveHorizontal, Scissors, SquareDashedBottom, Trash2 } from 'lucide-react';
import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu';
import { project as along } from '@/lib/editor/arc';
import { mergeCandidate, mergeWalls, splitWall, squareCorner } from '@/lib/editor/edits';
import type { Point, Project } from '@/lib/editor/model';

export type MenuTarget = { kind: 'wall' | 'opening'; id: string; point: Point };

/** Menu du clic droit sur un mur ou une ouverture du plan. */
export default function PlanMenu({ target, project, onEdit, onOpening, onShift, onDuplicate, onRemove }: {
    target: MenuTarget | null;
    project: Project;
    onEdit: (edit: (p: Project) => Project) => boolean;
    onOpening: (wallId: string, kind: 'door' | 'window', point: Point) => void;
    onShift: () => void;
    onDuplicate: () => void;
    onRemove: () => void;
}) {
    const w = target?.kind === 'wall' ? project.walls.find(x => x.id === target.id) : undefined;
    return <ContextMenuContent className="plan-menu" onCloseAutoFocus={e => e.preventDefault()}>
        {w && target && <>
            <ContextMenuItem onSelect={() => onEdit(q => splitWall(q, w.id, along(w, target.point)))}><Scissors /> Couper ici</ContextMenuItem>
            {(['a', 'b'] as const).map(end => { const c = mergeCandidate(project, w.id, end); return c && <ContextMenuItem key={end} onSelect={() => onEdit(q => mergeWalls(q, w.id, end))}><Combine /> Fusionner avec « {c.wall.name} »</ContextMenuItem>; })}
            <ContextMenuItem onSelect={onShift}><MoveHorizontal /> Décaler de…</ContextMenuItem>
            <ContextMenuItem onSelect={() => onEdit(q => squareCorner(q, w.id, 'a'))}><SquareDashedBottom /> Mettre d’équerre au début</ContextMenuItem>
            <ContextMenuItem onSelect={() => onEdit(q => squareCorner(q, w.id, 'b'))}><SquareDashedBottom /> Mettre d’équerre à la fin</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem disabled={w.openings.length >= 12} onSelect={() => onOpening(w.id, 'door', target.point)}><DoorOpen /> Porte ici</ContextMenuItem>
            <ContextMenuItem disabled={w.openings.length >= 12} onSelect={() => onOpening(w.id, 'window', target.point)}><AppWindow /> Fenêtre ici</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={onDuplicate}><Copy /> Dupliquer</ContextMenuItem>
            <ContextMenuItem variant="destructive" onSelect={onRemove}><Trash2 /> Supprimer le mur</ContextMenuItem>
        </>}
        {target?.kind === 'opening' && <ContextMenuItem variant="destructive" onSelect={onRemove}><Trash2 /> Supprimer l’ouverture</ContextMenuItem>}
    </ContextMenuContent>;
}
