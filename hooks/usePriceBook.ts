import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { PriceBook } from '../services/quoteEngine';
import { loadPriceBook, savePriceBook, cachedPriceBook, clearPriceBookCache } from '../services/priceBookService';

/**
 * The signed-in company's price book, for the Price book tab and every quote.
 *
 * `book` is null until it has been set up - the Quote tab offers the starter
 * book at that point rather than quoting from rates nobody chose. Edits apply
 * at once and save after a pause, the same debounce Projects uses for fields,
 * so dragging through a table of rates is one write, not forty.
 */
export function usePriceBook(enabled: boolean) {
    const [book, setBookState] = useState<PriceBook | null>(() => (enabled ? cachedPriceBook() : null));
    const [loading, setLoading] = useState(enabled);
    const [saving, setSaving] = useState(false);
    const [savedAt, setSavedAt] = useState<number | null>(null);
    const pending = useRef<PriceBook | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!enabled) { setLoading(false); return; }
        let live = true;
        loadPriceBook()
            .then(b => { if (live) setBookState(b); })
            .catch(e => { if (live) toast.error(e?.message || 'Your price book could not be loaded.'); })
            .finally(() => { if (live) setLoading(false); });
        return () => { live = false; };
    }, [enabled]);

    const flush = useCallback(async () => {
        const next = pending.current;
        pending.current = null;
        if (!next) return;
        setSaving(true);
        try {
            await savePriceBook(next);
            setSavedAt(Date.now());
        } catch (e: any) {
            toast.error(e?.message || 'Price book not saved.');
        } finally {
            setSaving(false);
        }
    }, []);

    // Anything still waiting is written on the way out.
    useEffect(() => () => {
        if (timer.current) clearTimeout(timer.current);
        flush();
    }, [flush]);

    /** Replace the book; saved after a short pause. `now` writes straight away. */
    const setBook = useCallback((next: PriceBook, now = false) => {
        setBookState(next);
        pending.current = next;
        if (timer.current) clearTimeout(timer.current);
        if (now) flush();
        else timer.current = setTimeout(flush, 900);
    }, [flush]);

    return { book, setBook, loading, saving, savedAt, clearCache: clearPriceBookCache };
}
