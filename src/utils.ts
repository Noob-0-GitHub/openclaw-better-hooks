export function resolveTemplate(template: string, context: any): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
        const keys = key.trim().split('.');
        let val = context;
        for (const k of keys) {
            if (val == null) break;
            val = val[k];
        }
        return val !== undefined ? String(val) : match;
    });
}

export function parseLogLine(line: string): any {
    try { 
        return JSON.parse(line); 
    } catch { 
        return { raw: line }; 
    }
}
