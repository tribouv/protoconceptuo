// Géométrie des murs courbes. Un mur garde ses deux extrémités a et b ; `angle` est l'angle
// au centre de l'arc qui les relie, en degrés (0 ou absent : mur droit). Positif, le mur bombe
// du côté de n = (-uy, ux), la normale « gauche » de a→b — c'est aussi l'axe z local du mur en
// 3D. Même convention que le « bulge » des DXF : bulge = tan(angle / 4) = 2 · flèche / corde.
import type { Point, Wall } from './model';

type Bent = Pick<Wall, 'a' | 'b'> & { angle?: number };
export const MAX_SWEEP = 300;

/** Angle au centre, en radians (0 pour un mur droit ou quasi droit). */
export function sweep(w: Bent) {
    const deg = w.angle ?? 0;
    return Math.abs(deg) < .5 ? 0 : Math.max(-MAX_SWEEP, Math.min(MAX_SWEEP, deg)) * Math.PI / 180;
}

const chord = (w: Bent) => {
    const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, c = Math.hypot(dx, dy) || 1e-9;
    return { c, ux: dx / c, uy: dy / c, nx: -dy / c, ny: dx / c };
};

/** Cercle porteur d'un mur courbe ; null pour un mur droit. `start` et `delta` : angle
 *  polaire de a vu du centre, et variation jusqu'à b (signée, |delta| = |angle|). */
export function arcOf(w: Bent) {
    const theta = sweep(w);
    if (!theta) return null;
    const { c, nx, ny } = chord(w), opening = Math.abs(theta) / 2;
    const radius = c / (2 * Math.sin(opening));
    // le centre est du côté opposé au renflement, à radius·cos(opening) du milieu de la corde
    const side = Math.sign(theta), off = radius * Math.cos(opening);
    const center = { x: (w.a.x + w.b.x) / 2 - nx * side * off, y: (w.a.y + w.b.y) / 2 - ny * side * off };
    const start = Math.atan2(w.a.y - center.y, w.a.x - center.x);
    // le sommet de l'arc (vu du centre, dans la direction du renflement) est à mi-parcours :
    // delta = 2 · écart angulaire entre a et le sommet, ramené dans ]-π, π]
    let half = Math.atan2(ny * side, nx * side) - start;
    half = Math.atan2(Math.sin(half), Math.cos(half));
    return { center, radius, start, delta: 2 * half };
}

/** Longueur développée du mur : longueur d'arc s'il est courbe. */
export function wallLength(w: Bent) {
    const arc = arcOf(w);
    return arc ? arc.radius * Math.abs(arc.delta) : Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
}

/** Point du mur à l'abscisse curviligne s (0 en a, longueur en b), et direction de la tangente
 *  (radians, sens a→b). */
export function pointAt(w: Bent, s: number): { point: Point; heading: number } {
    const arc = arcOf(w);
    if (!arc) {
        const { c, ux, uy } = chord(w), t = s / c;
        return { point: { x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t }, heading: Math.atan2(uy, ux) };
    }
    const phi = arc.start + arc.delta * (s / (arc.radius * Math.abs(arc.delta)));
    const point = { x: arc.center.x + arc.radius * Math.cos(phi), y: arc.center.y + arc.radius * Math.sin(phi) };
    const dir = Math.sign(arc.delta);
    return { point, heading: Math.atan2(Math.cos(phi) * dir, -Math.sin(phi) * dir) };
}

/** Abscisse curviligne du point du mur le plus proche de p, bornée à [0, longueur]. */
export function project(w: Bent, p: Point) {
    const arc = arcOf(w), L = wallLength(w);
    if (!arc) {
        const { c, ux, uy } = chord(w);
        return Math.max(0, Math.min(c, (p.x - w.a.x) * ux + (p.y - w.a.y) * uy));
    }
    // écart angulaire au milieu de l'arc, dans le sens de parcours, puis fraction de l'arc
    let rel = Math.atan2(p.y - arc.center.y, p.x - arc.center.x) - (arc.start + arc.delta / 2);
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    const f = .5 + rel * Math.sign(arc.delta) / Math.abs(arc.delta);
    return Math.max(0, Math.min(1, f)) * L;
}

/** Tracé SVG de l'axe du mur. */
export function wallPath(w: Bent) {
    const arc = arcOf(w);
    if (!arc) return `M${w.a.x} ${w.a.y} L${w.b.x} ${w.b.y}`;
    const large = Math.abs(arc.delta) > Math.PI ? 1 : 0, clockwise = arc.delta > 0 ? 1 : 0;
    return `M${w.a.x} ${w.a.y} A${arc.radius} ${arc.radius} 0 ${large} ${clockwise} ${w.b.x} ${w.b.y}`;
}

/** Angle (degrés) du mur courbe qui passe par a, b et p — la poignée centrale de l'éditeur.
 *  Flèche h mesurée perpendiculairement à la corde : angle = 4·atan(2h / corde). */
export function angleThrough(w: Pick<Wall, 'a' | 'b'>, p: Point) {
    const { c, nx, ny } = chord(w);
    const h = (p.x - (w.a.x + w.b.x) / 2) * nx + (p.y - (w.a.y + w.b.y) / 2) * ny;
    if (Math.abs(h) < .03) return 0;
    const deg = 4 * Math.atan(2 * h / c) * 180 / Math.PI;
    return Math.round(Math.max(-MAX_SWEEP, Math.min(MAX_SWEEP, deg)));
}

/** Sommet de l'arc (milieu du mur), là où l'éditeur place la poignée de courbure. */
export function apex(w: Bent) {
    return pointAt(w, wallLength(w) / 2).point;
}
