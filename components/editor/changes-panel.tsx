"use client";
import { BrickWall, Check, Combine, DoorClosed, DoorOpen, Hammer, ListChecks, Move, Ruler, Scissors, SlidersHorizontal, Undo2 } from 'lucide-react';
import type { PlanChanges } from '@/lib/editor/changes';
import type { JournalEntry, Project } from '@/lib/editor/model';

const icons: Record<JournalEntry['kind'], typeof Hammer> = { built: BrickWall, demolished: Hammer, moved: Move, modified: Ruler, split: Scissors, merged: Combine, 'opening-added': DoorOpen, 'opening-removed': DoorClosed, 'opening-modified': SlidersHorizontal };
const tone = (k: JournalEntry['kind']) => k === 'demolished' || k === 'opening-removed' ? 'demolition' : k === 'built' || k === 'opening-added' ? 'construction' : 'neutral';
const m = (n: number) => n.toFixed(2).replace('.', ',');
const time = (at: string) => { const d = new Date(at); return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };

/**
 * Panneau des modifications, à droite du plan : bilan démolition / construction par rapport à l'existant,
 * journal des actions (la plus récente en haut), et passage en correction du relevé.
 */
export default function ChangesPanel({ project, changes, showChanges, onShowChanges, canUndo, onUndo, onEntry, onDetails, onReset, onCorrect, onFinish }: {
    project: Project;
    changes: PlanChanges | null;
    showChanges: boolean;
    onShowChanges: (v: boolean) => void;
    /** le dernier pas d'annulation est la dernière entrée du journal */
    canUndo: boolean;
    onUndo: () => void;
    onEntry: (e: JournalEntry) => void;
    onDetails: () => void;
    onReset: () => void;
    onCorrect: () => void;
    onFinish: () => void;
}) {
    if (!project.existing || !changes)
        return <aside className="changes-panel" aria-label="Relevé de l’existant">
            <div className="changes-head"><p className="eyebrow">MODIFICATIONS</p><span className="mode-badge survey">Relevé</span></div>
            <div className="survey-card">
                <strong>Relevé de l’existant</strong>
                <p>Dessinez ou corrigez les murs pour qu’ils correspondent au bâti actuel. Ces corrections ne comptent pas comme travaux.</p>
                <button className="primary-button full" disabled={!project.walls.length} onClick={onFinish}><Check /> Terminer le relevé</button>
            </div>
            <p className="small-text">Ensuite, chaque mur dessiné ou supprimé sera enregistré ici comme une modification.</p>
        </aside>;
    const t = changes.totals, journal = [...(project.journal ?? [])].reverse(), dirty = journal.length > 0 || changes.count > 0;
    return <aside className="changes-panel" aria-label="Modifications du plan">
        <div className="changes-head"><p className="eyebrow">MODIFICATIONS</p><span className="mode-badge">Travaux</span></div>
        <div className="changes-totals">
            <div className="total demolition"><span>Démolition</span><strong>{m(t.demolishedArea)} m²</strong><small>{m(t.demolishedLength)} m de mur</small></div>
            <div className="total construction"><span>Construction</span><strong>{m(t.builtArea)} m²</strong><small>{m(t.builtLength)} m de mur</small></div>
        </div>
        {(t.openingsCreated > 0 || t.openingsFilled > 0 || t.openingsModified > 0) && <p className="small-text changes-bays">{t.openingsCreated} percement{t.openingsCreated > 1 ? 's' : ''} · {t.openingsFilled} rebouchage{t.openingsFilled > 1 ? 's' : ''}{t.openingsModified ? ` · ${t.openingsModified} baie${t.openingsModified > 1 ? 's' : ''} modifiée${t.openingsModified > 1 ? 's' : ''}` : ''}</p>}
        <label className="stage-toggle"><input type="checkbox" checked={showChanges} onChange={e => onShowChanges(e.target.checked)}/> Afficher sur le plan</label>
        <p className="eyebrow journal-title">JOURNAL{journal.length ? ` · ${journal.length}` : ''}</p>
        {journal.length ? <ol className="journal">{journal.map((e, i) => { const Icon = icons[e.kind]; return <li key={e.id}>
            <button className="journal-entry" title={e.point ? 'Voir sur le plan' : undefined} onClick={() => onEntry(e)}>
                <span className={`journal-icon ${tone(e.kind)}`}><Icon /></span>
                <span className="journal-text"><strong>{e.label}</strong><small>{[e.detail, time(e.at)].filter(Boolean).join(' · ')}</small></span>
            </button>
            {i === 0 && canUndo && <button className="icon-button journal-undo" aria-label="Annuler cette action" title="Annuler cette action · ⌘ Z" onClick={onUndo}><Undo2 /></button>}
        </li>; })}</ol>
            : <div className="journal-empty">Dessinez un mur <kbd>M</kbd> ou sélectionnez-en un et supprimez-le : chaque action apparaîtra ici.</div>}
        <div className="changes-actions">
            <button className="outline-button full" disabled={!changes.count} onClick={onDetails}><ListChecks /> Bilan détaillé{changes.count ? ` (${changes.count})` : ''}</button>
            <div className="changes-links">
                <button className="plain-button stage-link" disabled={!dirty} onClick={onReset}>Tout annuler</button>
                <button className="plain-button stage-link" title="Revenir au relevé pour corriger les murs de l’existant" onClick={onCorrect}>Corriger l’existant</button>
            </div>
        </div>
    </aside>;
}
