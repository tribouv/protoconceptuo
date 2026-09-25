"use client";
import { useEffect, useState } from 'react';
export default function NumberField({ label, value, onChange, min = -200, max = 200, step = .05, unit = 'm' }: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
}) {
    const [text, setText] = useState(String(Math.round(value * 100) / 100));
    useEffect(() => setText(String(Math.round(value * 100) / 100)), [value]);
    function commit() { const v = Number(text.replace(',', '.')); if (text.trim() && Number.isFinite(v) && v >= min && v <= max) {
        if (v !== value)
            onChange(v);
    }
    else
        setText(String(Math.round(value * 100) / 100)); }
    return <label className="number-field"><span>{label}</span><div><input type="number" min={min} max={max} step={step} value={text} onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter')
        e.currentTarget.blur(); }}/><span>{unit}</span></div></label>;
}
