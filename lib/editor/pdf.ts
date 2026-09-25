import { planFromPage, strokesFrom, textsFrom, type Matrix, type PageVectors, type PlanReport } from './pdf-vector';
import { type Project } from './model';
import type { PDFPageProxy } from 'pdfjs-dist';

const MAX_BYTES = 25 * 1024 * 1024;

async function openDocument(file: File) {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('/pdf.worker.min.mjs', window.location.origin).href;
    return pdfjs.getDocument({ data: await file.arrayBuffer(), cMapUrl: '/pdf-assets/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdf-assets/standard_fonts/', wasmUrl: '/pdf-assets/wasm/' });
}

export const isPdf = (file: File) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

/** Chemins et texte d'une page, sans passer par une image. */
async function vectorsOf(page: PDFPageProxy): Promise<PageVectors> {
    const viewport = page.getViewport({ scale: 1 });
    const [operators, content] = await Promise.all([page.getOperatorList(), page.getTextContent()]);
    return {
        width: viewport.width, height: viewport.height,
        strokes: strokesFrom(operators.fnArray, operators.argsArray as unknown[][], viewport.transform as Matrix),
        texts: textsFrom(content.items.filter(i => 'str' in i) as { str: string; transform: number[]; height: number }[], viewport.transform as Matrix)
    };
}

export type PlanRead = { project: Project; report: PlanReport; page: number; pages: number };

/** Reconstruit le plan d'une page ; null si elle ne porte pas de plan exploitable
 *  (page de garde, tableau de surfaces, PDF scanné qui n'est qu'une image). */
function planOf(vectors: PageVectors, name: string) {
    if (vectors.strokes.length < 40)
        return null;
    const read = planFromPage(vectors, name);
    return read.project.walls.length >= 4 ? read : null;
}

/** Plus il y a de pièces fermées retrouvées, plus la page est vraisemblablement le plan. */
const score = (r: PlanReport, walls: number) => r.rooms.filter(x => x.computed !== null).length * 100 + r.rooms.length * 10 + Math.min(walls, 99);

/** Lit le plan d'une page donnée ou, sans numéro, cherche dans tout le document la page
 *  qui porte le plan : un dossier de diagnostic mêle souvent garde, plans et annexes. */
export async function readPlan(file: File, pageNumber?: number, onProgress?: (page: number, pages: number) => void): Promise<PlanRead | null> {
    if (file.size > MAX_BYTES)
        throw new Error('Le fichier dépasse 25 Mo.');
    const name = file.name.replace(/\.[^.]+$/, '');
    const task = await openDocument(file);
    try {
        const doc = await task.promise;
        const pages = doc.numPages;
        const candidates = pageNumber ? [pageNumber] : Array.from({ length: Math.min(pages, 40) }, (_, i) => i + 1);
        let best: PlanRead | null = null, bestScore = -1;
        for (const n of candidates) {
            onProgress?.(n, pages);
            const read = planOf(await vectorsOf(await doc.getPage(n)), name);
            if (!read)
                continue;
            const s = score(read.report, read.project.walls.length);
            if (s > bestScore) { best = { ...read, page: n, pages }; bestScore = s; }
        }
        return best;
    }
    finally {
        await task.destroy();
    }
}

/** Nombre de pages, pour le sélecteur quand aucune page ne porte de plan lisible. */
export async function countPages(file: File) {
    const task = await openDocument(file);
    try { return (await task.promise).numPages; }
    finally { await task.destroy(); }
}

/** Rendu de la page en image, utilisé comme calque de fond sous le tracé. PNG et non
 *  JPEG : sur un dessin au trait, la compression avec perte crée des halos. */
export async function renderPlan(file: File, pageNumber = 1) {
    if (file.size > MAX_BYTES)
        throw new Error('Le fichier dépasse 25 Mo.');
    if (isPdf(file)) {
        const task = await openDocument(file);
        try {
            const doc = await task.promise;
            const page = await doc.getPage(pageNumber);
            const initial = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({ scale: Math.min(4, 3500 / Math.max(initial.width, initial.height)) });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            const ctx = canvas.getContext('2d');
            if (!ctx)
                throw new Error('Lecture du PDF indisponible.');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvas, canvasContext: ctx, viewport }).promise;
            return { data: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height, pages: doc.numPages };
        }
        finally {
            await task.destroy();
        }
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
        throw new Error('Choisissez un plan PDF.');
    const bitmap = await createImageBitmap(file);
    try {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
        return { data: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height, pages: 1 };
    }
    finally {
        bitmap.close();
    }
}
