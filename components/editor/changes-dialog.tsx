"use client";
import { useMemo, useState } from 'react';
import { Copy, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { changeRows, changesDocument, type ChangeRow, type PlanChanges } from '@/lib/editor/changes';
import type { Point, Project } from '@/lib/editor/model';

const xy = (p: Point) => `${p.x.toFixed(2).replace('.', ',')} ; ${p.y.toFixed(2).replace('.', ',')}`;
const m = (n: number) => n.toFixed(2).replace('.', ',');

/** Liste des modifications par rapport à l'existant validé, et le JSON d'échange avec Conceptuo. */
export default function ChangesDialog({ open, onOpenChange, project, changes, onRow, onDownload }: { open: boolean; onOpenChange: (v: boolean) => void; project: Project; changes: PlanChanges; onRow: (row: ChangeRow) => void; onDownload: (json: string) => void }) {
    const [tab, setTab] = useState('table');
    const rows = useMemo(() => changeRows(changes), [changes]);
    // horodaté à l'ouverture : le JSON affiché est celui qu'on copie ou télécharge
    const json = useMemo(() => open ? JSON.stringify(changesDocument(project, changes), null, 2) : '', [open, project, changes]);
    const t = changes.totals;
    const copy = () => navigator.clipboard.writeText(json).then(() => toast.success('JSON copié'), () => toast.error('Copie impossible : sélectionnez le texte à la main.'));
    return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="changes-dialog">
        <DialogTitle>Modifications par rapport à l’existant</DialogTitle>
        <DialogDescription>Coordonnées en mètres depuis le coin haut-gauche de la page du PDF (x vers la droite, y vers le bas). Longueurs mesurées sur l’axe des murs.</DialogDescription>
        <Tabs value={tab} onValueChange={setTab}><TabsList><TabsTrigger value="table">Tableau</TabsTrigger><TabsTrigger value="json">JSON</TabsTrigger></TabsList>
            <TabsContent value="table">{rows.length ? <div className="changes-table-wrap"><table className="changes-table">
                <thead><tr><th>Repère</th><th>Type</th><th>Début (x ; y)</th><th>Fin (x ; y)</th><th>Longueur</th><th>Épaisseur</th><th>Hauteur</th><th>Surface nette</th><th>Détail</th></tr></thead>
                <tbody>{rows.map(r => <tr key={r.ref} tabIndex={0} title="Voir sur le plan" onClick={() => onRow(r)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRow(r); } }}>
                    <td><span className={`change-ref ${r.kind}`}>{r.ref}</span></td><td>{r.label}</td><td className="num">{xy(r.from)}</td><td className="num">{xy(r.to)}</td><td className="num">{r.length}</td><td className="num">{r.thickness}</td><td className="num">{r.height}</td><td className="num">{r.area}</td><td>{r.detail}</td>
                </tr>)}</tbody>
                <tfoot><tr><td colSpan={9}>Démolition {m(t.demolishedLength)} m · {m(t.demolishedArea)} m² — Construction {m(t.builtLength)} m · {m(t.builtArea)} m² — {t.openingsCreated} percement{t.openingsCreated > 1 ? 's' : ''} · {t.openingsFilled} rebouchage{t.openingsFilled > 1 ? 's' : ''} · {t.openingsModified} baie{t.openingsModified > 1 ? 's' : ''} modifiée{t.openingsModified > 1 ? 's' : ''}{t.resizedLength ? ` · ${m(t.resizedLength)} m d’épaisseur ou de hauteur changée` : ''}</td></tr></tfoot>
            </table></div> : <p className="small-text">Aucune modification : le plan est identique à l’existant validé.</p>}</TabsContent>
            <TabsContent value="json"><pre className="changes-json">{json}</pre><div className="dialog-actions"><button className="outline-button" onClick={() => void copy()}><Copy /> Copier</button><button className="primary-button" onClick={() => onDownload(json)}><Download /> Télécharger</button></div></TabsContent>
        </Tabs>
    </DialogContent></Dialog>;
}
