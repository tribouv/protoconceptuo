"use client";
import { useEffect, useRef, useState } from 'react';
import type { Anchor } from '@/lib/editor/edits';

const anchors: { value: Anchor; label: string; title: string }[] = [
    { value: 'a', label: 'Début', title: 'Le début du mur reste en place' },
    { value: 'centre', label: 'Milieu', title: 'Le mur s’allonge des deux côtés' },
    { value: 'b', label: 'Fin', title: 'La fin du mur reste en place' },
];

/** Champ posé sur une cote du plan. Entrée valide, Tab valide et passe à la cote suivante,
 *  Échap annule ; quitter le champ valide s'il a été modifié. `onSubmit` rend false si la
 *  saisie est refusée : le champ reste ouvert. */
export default function DimensionInput({ x, y, initial, hint, anchor, onAnchor, onSubmit, onCancel }: {
    x: number;
    y: number;
    initial: string;
    hint: string;
    anchor?: Anchor;
    onAnchor?: (a: Anchor) => void;
    onSubmit: (text: string, next: 0 | 1 | -1) => boolean;
    onCancel: () => void;
}) {
    const [text, setText] = useState(initial), input = useRef<HTMLInputElement>(null), done = useRef(false);
    // (sans faire défiler le plan : le champ peut déborder près d'un bord)
    useEffect(() => {
        const focus = () => { if (document.activeElement !== input.current) { input.current?.focus({ preventScroll: true }); input.current?.select(); } };
        // (ouvert depuis le menu du clic droit : on reprend le focus une fois le menu fermé)
        focus(); const t = setTimeout(focus, 200);
        return () => clearTimeout(t);
    }, []);
    const submit = (next: 0 | 1 | -1) => {
        if (done.current) return;
        if (onSubmit(text, next)) done.current = true;
        else input.current?.select();
    };
    return <div className="dimension-input" style={{ left: x, top: y }} onPointerDown={e => e.stopPropagation()}>
        <input ref={input} value={text} aria-label={hint} title={hint} placeholder={hint} onChange={e => setText(e.target.value)}
            onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); submit(0); }
                else if (e.key === 'Tab') { e.preventDefault(); submit(e.shiftKey ? -1 : 1); }
                else if (e.key === 'Escape') { e.preventDefault(); done.current = true; onCancel(); }
            }}
            onBlur={() => { if (done.current) return; if (text.trim() !== initial) submit(0); else { done.current = true; onCancel(); } }}/>
        {anchor && onAnchor && <div className="anchor-toggle" role="radiogroup" aria-label="Point fixe">
            {anchors.map(a => <button key={a.value} type="button" role="radio" aria-checked={anchor === a.value} title={a.title} className={anchor === a.value ? 'active' : ''}
                // (sans perdre le focus du champ)
                onMouseDown={e => e.preventDefault()} onClick={() => onAnchor(a.value)}>{a.label}</button>)}
        </div>}
    </div>;
}
