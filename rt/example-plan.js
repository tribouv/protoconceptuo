/* ── Convention — à lire avant toute modification ──────────────────────────
   Relevé d'un plan d'architecte : appartement de 154 m², 14 pièces.

   Les murs sont des AXES. Le 2D trace un trait d'épaisseur `thickness` CENTRÉ
   sur a→b (plan-view.tsx) ; le 3D construit une boîte de même profondeur,
   centrée elle aussi (scene.ts). Une cote libre du plan s'écrit donc :

        cote libre = écart entre axes − t₁/2 − t₂/2

   Ex. Chambre 1, 4,21 m libre entre façade (30) et refend (20) :
        axes à 0,00 et 4,46  →  4,46 − 0,15 − 0,10 = 4,21 ✓

   1. Épaisseurs en centimètres PAIRS uniquement : les demi-épaisseurs tombent
      au centimètre et les axes restent exacts à 2 décimales.
   2. Toutes les coordonnées à 2 décimales — round() du modèle n'arrondit qu'à
      2 décimales et moveEntity() s'appuie dessus.
   3. WALLS[0] part de (0, 0) et reste horizontal — tests/core.mjs:15.
   4. 'door-1' reste sur un mur vertical descendant (a.x === b.x, a.y < b.y,
      b.y ≤ 5,00) d'au moins width/0,6 de long — tests/core.mjs:37-38.
   5. Les surfaces libres imprimées sont recoupées par exampleRooms() pour les
      10 pièces rectangulaires ; les 4 pièces en L (Séjour, Entrée, Dgmt 4,
      Dgmt 5) portent un libellé posé à la main.
   6. Aucune ouverture ne doit déborder de son mur, et allège + hauteur ≤ 2,70 :
      validateProject() ne vérifie ni l'un ni l'autre, le rendu rogne en silence.
────────────────────────────────────────────────────────────────────────── */
const H = 2.7;
const T = { ext: .30, porteur: .20, cloison: .08 };
/** Mur vertical d'axe `x`, de `y1` (extrémité a) à `y2` (extrémité b). */
const v = (x, y1, y2) => ({ a: { x, y: y1 }, b: { x, y: y2 } });
/** Mur horizontal d'axe `y`, de `x1` (extrémité a) à `x2` (extrémité b). */
const h = (y, x1, x2) => ({ a: { x: x1, y }, b: { x: x2, y } });
const WALLS = [
    // ── Façades ──────────────────────────────────────────────────────────
    // ⚠ La première ligne DOIT partir de (0, 0) et rester horizontale.
    { id: 'ext-n', name: 'Façade nord', t: T.ext, ...h(0, 0, 12.47) },
    { id: 'ext-e', name: 'Façade est', t: T.ext, ...v(12.47, 0, 12.6) },
    { id: 'ext-s-est', name: 'Façade sud — entrée et cuisine', t: T.ext, ...h(12.6, 4.46, 12.47) },
    { id: 'ext-jog', name: 'Façade est — retour du séjour', t: T.ext, ...v(4.46, 12.6, 14.32) },
    { id: 'ext-s-sejour', name: 'Façade sud — séjour', t: T.ext, ...h(14.32, -.75, 4.46) },
    { id: 'ext-o-bas', name: 'Façade ouest — séjour', t: T.ext, ...v(-.75, 7.21, 14.32) },
    { id: 'ext-o-redent', name: 'Façade ouest — redent', t: T.ext, ...h(7.21, -.75, 0) },
    { id: 'ext-o-haut', name: 'Façade ouest — chambre 1', t: T.ext, ...v(0, 0, 7.21) },
    // ── Refends ──────────────────────────────────────────────────────────
    { id: 'p-ch1-e', name: 'Chambre 1 / salle de bain', t: T.porteur, ...v(4.46, 0, 3.71) },
    { id: 'p-ch1-s', name: 'Chambre 1 / séjour', t: T.porteur, ...h(3.71, 0, 4.46) },
    { id: 'p-ch23-o', name: 'Chambres 2 et 3 / dégagements', t: T.porteur, ...v(8.74, 0, 8.2) },
    { id: 'p-ch2-s', name: 'Chambre 2 / chambre 3', t: T.porteur, ...h(4.23, 8.74, 12.47) },
    { id: 'p-ch3-s', name: 'Chambre 3 / cuisine', t: T.porteur, ...h(8.2, 8.27, 12.47) },
    // ── Cloisons ─────────────────────────────────────────────────────────
    { id: 'c-sejour-e', name: 'Séjour / circulation', t: T.cloison, ...v(4.46, 3.71, 12.6) },
    { id: 'c-sdb-e', name: 'Salle de bain / salle d’eau', t: T.cloison, ...v(7.07, 0, 2.77) },
    { id: 'c-sdb-s', name: 'Salle de bain / Dgmt 4', t: T.cloison, ...h(2.77, 4.46, 7.07) },
    { id: 'c-sde-s', name: 'Salle d’eau / Dgmt 4', t: T.cloison, ...h(2.48, 7.07, 8.74) },
    { id: 'c-dgmt4-s', name: 'Dgmt 4 / Dgmt 3 et 5', t: T.cloison, ...h(3.85, 4.46, 8.74) },
    { id: 'c-dgmt5-o', name: 'Dgmt 3 et 2 / Dgmt 5', t: T.cloison, ...v(6.8, 3.85, 7.24) },
    { id: 'c-dgmt3-s', name: 'Dgmt 3 / Dgmt 2', t: T.cloison, ...h(5.39, 4.46, 6.8) },
    { id: 'c-dgmt2-s', name: 'Dgmt 2 / Dgmt 5', t: T.cloison, ...h(7.24, 4.46, 6.8) },
    { id: 'c-dgmt5-s', name: 'Dgmt 5 / WC et Dgmt 1', t: T.cloison, ...h(7.86, 4.46, 8.74) },
    { id: 'c-wc-o', name: 'Dgmt 1 / WC', t: T.cloison, ...v(6.81, 7.86, 9.37) },
    { id: 'c-entree-n-o', name: 'Dgmt 1 / entrée', t: T.cloison, ...h(8.89, 4.46, 6.81) },
    { id: 'c-entree-n-e', name: 'WC / entrée', t: T.cloison, ...h(9.37, 6.81, 8.27) },
    { id: 'c-cuisine-o-haut', name: 'Cuisine / WC', t: T.cloison, ...v(8.27, 8.2, 9.37) },
    { id: 'c-cuisine-o-bas', name: 'Cuisine / entrée', t: T.cloison, ...v(7.83, 9.37, 12.6) },
];
/* `at` = distance en mètres de l'extrémité `a` du mur au CENTRE de l'ouverture.
   Largeurs, hauteurs et allèges reprennent les cotes portées sur le plan
   (« PORTE 75 par 200 », « L312 x H236 · AlI : 0 »…). */
const OPENINGS = [
    // Fenêtres — façade ouest
    { wall: 'ext-o-haut', id: 'win-ch1', kind: 'window', at: 1.9, w: 2.35, h: 2.36, sill: 0 },
    { wall: 'ext-o-haut', id: 'win-sejour-1', kind: 'window', at: 5.5, w: 3.12, h: 2.36, sill: 0 },
    { wall: 'ext-o-bas', id: 'win-sejour-2', kind: 'window', at: 2.2, w: 3.26, h: 2.36, sill: 0 },
    { wall: 'ext-o-bas', id: 'win-sejour-3', kind: 'window', at: 5.3, w: 3.3, h: 2.36, sill: 0 },
    // Fenêtres — façade est
    { wall: 'ext-e', id: 'win-ch2', kind: 'window', at: 2.1, w: 1.66, h: 2.38, sill: 0 },
    { wall: 'ext-e', id: 'win-ch3', kind: 'window', at: 6.2, w: 1.66, h: 2.38, sill: 0 },
    { wall: 'ext-e', id: 'win-cuisine-1', kind: 'window', at: 8.9, w: 1.08, h: 1.37, sill: 1.02 },
    { wall: 'ext-e', id: 'win-cuisine-2', kind: 'window', at: 10.1, w: 1, h: 1.44, sill: 1.02 },
    { wall: 'ext-e', id: 'win-cuisine-3', kind: 'window', at: 11.3, w: 1.02, h: 1.44, sill: 1.02 },
    { wall: 'ext-e', id: 'win-cuisine-4', kind: 'window', at: 12.3, w: .6, h: 1.44, sill: 1.02 },
    { wall: 'ext-s-est', id: 'win-cuisine-5', kind: 'window', at: 7.3, w: .45, h: 1.02, sill: 1.02 },
    // Porte palière
    { wall: 'ext-s-est', id: 'door-entree', kind: 'door', at: 1.74, w: .9, h: 2, sill: 0 },
    // Portes intérieures
    // ⚠ 'door-1' : identifiant réservé par tests/core.mjs:37-38. Voir l'en-tête, règle 4.
    { wall: 'c-sdb-e', id: 'door-1', kind: 'door', at: 2.2, w: .7, h: 2.04, sill: 0 },
    { wall: 'p-ch1-e', id: 'door-ch1', kind: 'door', at: 3.25, w: .75, h: 2, sill: 0 },
    { wall: 'c-sdb-s', id: 'door-sdb', kind: 'door', at: 1.3, w: .75, h: 2, sill: 0 },
    { wall: 'c-sde-s', id: 'door-sde', kind: 'door', at: .85, w: .75, h: 2, sill: 0 },
    { wall: 'p-ch23-o', id: 'door-ch2', kind: 'door', at: 3.4, w: .75, h: 2, sill: 0 },
    { wall: 'p-ch23-o', id: 'door-ch3', kind: 'door', at: 5.6, w: .75, h: 2, sill: 0 },
    { wall: 'c-sejour-e', id: 'door-sejour-1', kind: 'door', at: 1.2, w: .78, h: 2, sill: 0 },
    { wall: 'c-sejour-e', id: 'door-sejour-2', kind: 'door', at: 7.6, w: 1.6, h: 2, sill: 0 },
    { wall: 'c-dgmt4-s', id: 'door-dgmt4', kind: 'door', at: 1.5, w: .75, h: 2, sill: 0 },
    { wall: 'c-dgmt5-o', id: 'door-dgmt5', kind: 'door', at: 1, w: .73, h: 2, sill: 0 },
    { wall: 'c-dgmt3-s', id: 'door-dgmt3', kind: 'door', at: 1.17, w: .75, h: 2, sill: 0 },
    { wall: 'c-entree-n-o', id: 'door-dgmt1', kind: 'door', at: 1.5, w: .75, h: 2, sill: 0 },
    { wall: 'c-entree-n-e', id: 'door-wc', kind: 'door', at: .73, w: .66, h: 2, sill: 0 },
    { wall: 'c-cuisine-o-bas', id: 'door-cuisine', kind: 'door', at: 1.5, w: .75, h: 2, sill: 0 },
];
/* `box` = les quatre murs qui bordent la pièce, dans l'ordre nord, sud, ouest,
   est. Une pièce en L ne peut pas être décrite ainsi : elle porte `box: null`,
   un libellé posé à la main, et sort de l'audit des surfaces. */
const ROOMS = [
    { name: 'Chambre 1', box: ['ext-n', 'p-ch1-s', 'ext-o-haut', 'p-ch1-e'], area: 14.56 },
    { name: 'Salle de bain', box: ['ext-n', 'c-sdb-s', 'p-ch1-e', 'c-sdb-e'], area: 6.38 },
    { name: 'Salle d’eau', box: ['ext-n', 'c-sde-s', 'c-sdb-e', 'p-ch23-o'], area: 3.5 },
    { name: 'Chambre 2', box: ['ext-n', 'p-ch2-s', 'p-ch23-o', 'ext-e'], area: 13.86 },
    { name: 'Chambre 3', box: ['p-ch2-s', 'p-ch3-s', 'p-ch23-o', 'ext-e'], area: 13.08 },
    { name: 'Dgmt 3', box: ['c-dgmt4-s', 'c-dgmt3-s', 'c-sejour-e', 'c-dgmt5-o'], area: 3.3 },
    { name: 'Dgmt 2', box: ['c-dgmt3-s', 'c-dgmt2-s', 'c-sejour-e', 'c-dgmt5-o'], area: 4.01 },
    { name: 'Dgmt 1', box: ['c-dgmt5-s', 'c-entree-n-o', 'c-sejour-e', 'c-wc-o'], area: 2.15 },
    { name: 'WC', box: ['c-dgmt5-s', 'c-entree-n-e', 'c-wc-o', 'c-cuisine-o-haut'], area: 1.98 },
    // Pièces en L — libellé posé à la main, hors audit.
    { name: 'Cuisine', box: null, label: { x: 10.3, y: 10.6 }, area: 17.96 },
    { name: 'Séjour', box: null, label: { x: 2, y: 10 }, area: 49.38 },
    { name: 'Entrée', box: null, label: { x: 5.6, y: 11.2 }, area: 11.04 },
    { name: 'Dgmt 4', box: null, label: { x: 6.6, y: 3.4 }, area: 4.42 },
    { name: 'Dgmt 5', box: null, label: { x: 7.7, y: 5.9 }, area: 8.26 },
];
/* Convertit « centre de l'ouverture à `at` mètres de l'extrémité a » en la
   fraction 0..1 attendue par le modèle, bornée pour que l'ouverture reste
   entièrement dans le mur. Même marge que projectedOffset() dans openings.ts :
   une ouverture posée ici et une ouverture déplacée à la souris obéissent donc
   à la même règle. La fraction n'est PAS arrondie — round() vaut 2 décimales,
   soit 5 cm de quantum sur un mur de 10 m. */
function fraction(w, at, width) {
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const margin = Math.min(.5, width / (2 * len));
    return Math.max(margin, Math.min(1 - margin, at / len));
}
/** Centre géométrique et surface libre de chaque pièce, dérivés des murs. */
export function exampleRooms() {
    const by = new Map(WALLS.map(w => [w.id, w]));
    return ROOMS.map(r => {
        if (!r.box)
            return { name: r.name, label: r.label, computed: null, area: r.area };
        const [n, s, o, e] = r.box.map(id => {
            const wall = by.get(id);
            if (!wall)
                throw new Error(`Mur inconnu pour la pièce ${r.name} : ${id}`);
            return wall;
        });
        const x0 = o.a.x + o.t / 2, x1 = e.a.x - e.t / 2, y0 = n.a.y + n.t / 2, y1 = s.a.y - s.t / 2;
        return { name: r.name, label: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, computed: (x1 - x0) * (y1 - y0), area: r.area };
    });
}
export function exampleProject() {
    const walls = WALLS.map(w => ({ id: w.id, name: w.name, a: w.a, b: w.b, thickness: w.t, height: H, openings: [] }));
    const byId = new Map(walls.map(w => [w.id, w]));
    for (const o of OPENINGS) {
        const wall = byId.get(o.wall);
        if (!wall)
            throw new Error(`Mur inconnu pour l’ouverture ${o.id} : ${o.wall}`);
        wall.openings.push({ id: o.id, kind: o.kind, offset: fraction(wall, o.at, o.w), width: o.w, height: o.h, sill: o.sill });
    }
    return { version: 1, name: 'Appartement 154 m² — relevé', walls, items: [], labels: exampleRooms().map(r => ({ name: r.name, x: r.label.x, y: r.label.y })), background: null, calibrated: true, assets: {} };
}
