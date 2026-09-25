// Lecture d'une cote tapée au clavier. Le résultat est en mètres.
//   3.45 · 3,45 · 3.45m     → 3,45 m
//   345cm · 3450mm          → 3,45 m
//   345 (sans unité, ≥ 30)  → centimètres : personne ne tape un mur de 345 m
//   +12cm · -5cm            → relatif à la valeur actuelle
//   50%                     → part de `percentOf` (la longueur du mur pour une baie)
//   +10%                    → la valeur actuelle augmentée de 10 %

export type Parsed = { value: number; percent?: number };

const pattern = /^([+-])?\s*(\d+(?:\.\d*)?|\.\d+)\s*(mm|cm|m|%)?$/;

export function parseLength(text: string, current: number, percentOf = current): Parsed | null {
    const m = pattern.exec(text.trim().toLowerCase().replace(',', '.'));
    if (!m) return null;
    const [, sign, digits, unit] = m, n = Number(digits);
    if (!Number.isFinite(n)) return null;
    if (unit === '%') {
        if (sign) return { value: current * (1 + (sign === '-' ? -n : n) / 100) };
        return { value: percentOf * n / 100, percent: n };
    }
    const metres = unit === 'mm' ? n / 1000 : unit === 'cm' ? n / 100 : unit === 'm' ? n : n >= 30 ? n / 100 : n;
    const value = sign ? current + (sign === '-' ? -metres : metres) : metres;
    return Number.isFinite(value) ? { value } : null;
}

/** Affichage d'une cote : au centimètre, virgule décimale. */
export function formatLength(m: number) {
    return (Math.round(m * 100) / 100).toFixed(2).replace('.', ',');
}
