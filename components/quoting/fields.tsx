import React, { useEffect, useState } from 'react';

/**
 * Number inputs for price tables.
 *
 * A plain controlled <input type="number"> bound to a number fights the
 * user: "12." or an emptied field becomes 12 or 0 mid-keystroke and the
 * cursor jumps. These keep the typed text while the field has focus and only
 * hand a number up when the text is one, so a price can be typed naturally.
 */
export const NumField: React.FC<{
    value: number | null | undefined;
    onChange: (v: number | null) => void;
    className?: string;
    /** Shown before the number, e.g. £. */
    prefix?: string;
    suffix?: string;
    placeholder?: string;
    allowEmpty?: boolean;
    min?: number;
    step?: number;
    ariaLabel?: string;
    align?: 'left' | 'right';
    disabled?: boolean;
}> = ({ value, onChange, className = '', prefix, suffix, placeholder, allowEmpty, min, step, ariaLabel, align = 'right', disabled }) => {
    const show = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? '' : String(v));
    const [text, setText] = useState(show(value));
    const [focused, setFocused] = useState(false);
    useEffect(() => { if (!focused) setText(show(value)); }, [value, focused]);

    return (
        <label className={`flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2.5 focus-within:ring-2 focus-within:ring-accent/25 focus-within:border-accent transition ${disabled ? 'opacity-50' : ''} ${className}`}>
            {prefix && <span className="text-slate-400 text-xs select-none">{prefix}</span>}
            <input
                inputMode="decimal"
                disabled={disabled}
                aria-label={ariaLabel}
                placeholder={placeholder}
                value={text}
                onFocus={e => { setFocused(true); e.currentTarget.select(); }}
                onBlur={() => { setFocused(false); setText(show(value)); }}
                onChange={e => {
                    const t = e.target.value.replace(/[£,\s]/g, '');
                    setText(e.target.value);
                    if (t === '') { if (allowEmpty) onChange(null); return; }
                    const n = Number(t);
                    if (Number.isFinite(n)) onChange(min !== undefined ? Math.max(min, n) : n);
                }}
                onKeyDown={e => {
                    if (!step || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
                    e.preventDefault();
                    const n = (Number(text) || 0) + (e.key === 'ArrowUp' ? step : -step);
                    const v = min !== undefined ? Math.max(min, n) : n;
                    setText(String(v));
                    onChange(v);
                }}
                className={`w-full min-w-0 bg-transparent py-1.5 text-sm text-slate-800 tabular-nums focus:outline-none ${align === 'right' ? 'text-right' : ''}`}
            />
            {suffix && <span className="text-slate-400 text-xs select-none whitespace-nowrap">{suffix}</span>}
        </label>
    );
};

/** A segmented choice - the house style for 2-4 options. */
export function Segmented<T extends string>({ value, options, onChange, size = 'md' }: {
    value: T;
    options: { id: T; label: React.ReactNode; title?: string }[];
    onChange: (v: T) => void;
    size?: 'sm' | 'md';
}) {
    return (
        <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200/70">
            {options.map(o => (
                <button
                    key={o.id}
                    type="button"
                    title={o.title}
                    onClick={() => onChange(o.id)}
                    className={`rounded-lg font-bold uppercase tracking-[0.1em] transition-colors ${size === 'sm' ? 'px-2.5 py-1 text-[10px]' : 'px-3.5 py-1.5 text-[11px]'} ${value === o.id ? 'bg-white text-accent shadow-sm' : 'text-slate-500 hover:text-accent'}`}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

/**
 * An on/off switch. Sized in px throughout: the site's root font size is
 * smaller than 16px, so a rem-sized track with a px knob offset put the knob
 * past the end of the track.
 */
export const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; hint?: React.ReactNode }> = ({ on, onChange, label, hint }) => (
    <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className="group flex items-start gap-3 text-left rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-4"
    >
        <span
            className={`relative mt-px shrink-0 w-[38px] h-[22px] rounded-full border transition-colors duration-200 ${on ? 'bg-accent border-accent' : 'bg-slate-200 border-slate-300 group-hover:bg-slate-300'}`}
        >
            <span
                className="absolute top-[2px] left-[2px] w-[16px] h-[16px] rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,0.3)] transition-transform duration-200"
                // Inline rather than a translate-x utility, which this
                // site's Tailwind build resolves to 0.
                style={{ transform: on ? 'translateX(16px)' : 'translateX(0)' }}
            />
        </span>
        {(label || hint) && (
            <span className="min-w-0">
                {label && <span className="block text-sm font-semibold text-slate-700 leading-[22px]">{label}</span>}
                {hint && <span className="block text-[11px] text-slate-400 leading-snug">{hint}</span>}
            </span>
        )}
    </button>
);

export const labelClass = 'text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500';
export const inputClass =
    'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-accent/25 focus:border-accent transition';
