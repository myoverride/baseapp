/**
 * Formats a date string, Date object, or timestamp into a localized string.
 * Automatically handles SQLite UTC date strings (YYYY-MM-DD HH:MM:SS) by appending 'Z'
 * to ensure they are parsed as UTC instead of local time, fixing timezone offsets.
 */
export function formatAppDate(dateInput: string | number | Date | null | undefined, locale: string = 'tr-TR'): string {
    if (!dateInput) return '';
    let dateStr = String(dateInput);
    
    // Check if it's a standard SQLite timestamp without timezone info: YYYY-MM-DD HH:MM:SS
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(dateStr)) {
        // Append 'Z' to force UTC parsing
        dateStr = dateStr.replace(' ', 'T') + 'Z';
    }
    
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return String(dateInput);
        return d.toLocaleString(locale);
    } catch {
        return String(dateInput);
    }
}
