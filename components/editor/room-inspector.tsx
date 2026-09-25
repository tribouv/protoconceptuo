"use client";
import { useEffect, useRef } from 'react';
import { parseLabel, type Room } from '@/lib/editor/rooms';
import type { Label } from '@/lib/editor/model';

const m2 = (n: number) => `${n.toFixed(2).replace('.', ',')} m²`;

/** Pièce sélectionnée : nom modifiable, surface en lecture seule avec sa provenance. */
export default function RoomInspector({ room, labels, onRename }: { room: Room; labels: Label[]; onRename: (name: string) => void }) {
    const input = useRef<HTMLInputElement>(null);
    // une pièce qui vient d'être réunie : le nom est présélectionné, prêt à être remplacé
    useEffect(() => { if (room.merged) { input.current?.focus(); input.current?.select(); } }, [room.key, room.merged]);
    const parts = room.labels.map(i => parseLabel(labels[i]));
    const origin = parts.length > 1 && parts.every(p => p.printed !== null) ? `surfaces d’origine : ${parts.map(p => `${p.name} ${m2(p.printed!)}`).join(' + ')}`
        : room.printed !== null ? `surface imprimée d’origine : ${m2(room.printed)}` : '';
    const source = room.source === 'imprimée' ? 'surface imprimée sur le plan' : room.source === 'recalculée' ? ['recalculée à partir des murs', origin].filter(Boolean).join(' — ') : 'pièce non fermée : surface non calculée';
    return <>
        <div className="inspector-heading"><div><p className="eyebrow">{room.merged ? 'PIÈCES RÉUNIES' : 'PIÈCE'}</p>
            <input ref={input} className="entity-name" aria-label="Nom de la pièce" value={room.name} maxLength={80} onChange={e => onRename(e.target.value)}/></div></div>
        <p className="room-area"><strong>{room.area !== null ? m2(room.area) : '—'}</strong><span>{source}</span></p>
        {room.merged && <p className="small-text">{room.names.join(' et ')} ne sont plus séparées par un mur : donnez un nom à la nouvelle pièce.</p>}
    </>;
}
