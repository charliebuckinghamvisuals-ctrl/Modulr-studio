import { get, set } from 'idb-keyval';
import { HistoryItem } from '../types';

const STORE_KEY = 'aiarchviz_history';

/** Returns the Unix timestamp for 00:00:00 today (local time) */
const getMidnightToday = (): number => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
};

export const saveToHistory = async (item: Omit<HistoryItem, 'id' | 'timestamp'>) => {
    try {
        const currentHistory = await getHistory();
        const newItem: HistoryItem = {
            ...item,
            id: crypto.randomUUID(),
            timestamp: Date.now()
        };

        // Keep only the last 30 to prevent massive storage
        const newHistory = [newItem, ...currentHistory].slice(0, 30);
        await set(STORE_KEY, newHistory);
        return newItem;
    } catch (error) {
        console.error('Failed to save history: ', error);
        return null;
    }
};

export const getHistory = async (): Promise<HistoryItem[]> => {
    try {
        const history: HistoryItem[] = (await get(STORE_KEY)) || [];
        const midnight = getMidnightToday();

        // Filter out anything saved before today's midnight
        const todayHistory = history.filter(item => item.timestamp >= midnight);

        // If items were purged, persist the cleaned list
        if (todayHistory.length < history.length) {
            await set(STORE_KEY, todayHistory);
        }

        return todayHistory;
    } catch (error) {
        console.error('Failed to get history: ', error);
        return [];
    }
};

export const clearHistory = async () => {
    try {
        await set(STORE_KEY, []);
    } catch (error) {
        console.error('Failed to clear history: ', error);
    }
};
