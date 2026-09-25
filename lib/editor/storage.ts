import type { Project } from './model';
import type { PackedHistory } from './history';
// version 2 : magasin `history` pour l'annulation après rechargement (voir history.ts)
async function database() { return await new Promise<IDBDatabase>((resolve, reject) => { const req = indexedDB.open('conceptuo-atelier', 2); req.onupgradeneeded = () => { for (const name of ['projects', 'history']) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name); }; req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
async function read(store: string) { const db = await database(); try {
    return await new Promise<unknown>((resolve, reject) => { const req = db.transaction(store).objectStore(store).get('current'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}
finally {
    db.close();
} }
async function write(store: string, value: unknown) { const db = await database(); try {
    await new Promise<void>((resolve, reject) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(value, 'current'); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
}
finally {
    db.close();
} }
export const readLocal = () => read('projects');
export const saveLocal = (p: Project) => write('projects', p);
export const readHistory = () => read('history') as Promise<PackedHistory | undefined>;
export const saveHistory = (h: PackedHistory) => write('history', h);
