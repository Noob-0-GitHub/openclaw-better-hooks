import fs from 'fs';
import path from 'path';

export function normalizeConfig(raw) {
    const clean = {
        events: {
            enabled: true,
            entries: []
        },
        hooks: {
            commands: { enabled: true, entries: [] },
            webhooks: { enabled: true, entries: [] },
            scripts: { enabled: true, entries: [] }
        }
    };

    // 1. Migrate Events (Handles old array style or new object style)
    const rawEvents = raw.events?.entries || raw.events || [];
    if (Array.isArray(rawEvents)) {
        for (const e of rawEvents) {
            const id = e.id || e.name;
            if (id && e.regex) {
                // Prevent ID duplication
                if (!clean.events.entries.some(existing => existing.id === id)) {
                    clean.events.entries.push({
                        id,
                        regex: e.regex,
                        description: e.description || "",
                        enabled: e.enabled !== undefined ? e.enabled : true
                    });
                }
            }
        }
    }
    if (raw.events?.enabled === false) clean.events.enabled = false;

    // 2. Migrate Hooks (The complex part: sorting old mixed hooks into new categories)
    const rawHooks = raw.hooks?.commands?.entries || (Array.isArray(raw.hooks) ? raw.hooks : []);
    
    // Legacy support: if raw.hooks is an array, we sort them
    if (Array.isArray(raw.hooks)) {
        for (const h of raw.hooks) {
            if (!h || !h.event) continue;
            const enabled = h.enabled !== undefined ? h.enabled : true;
            if (h.type === 'command' && h.cmd) {
                clean.hooks.commands.entries.push({
                    event: h.event,
                    cmd: h.cmd,
                    cooldown_ms: h.cooldown_ms || 0,
                    enabled
                });
            } else if (h.type === 'webhook' && h.url) {
                clean.hooks.webhooks.entries.push({
                    event: h.event,
                    url: h.url,
                    method: h.method || "POST",
                    enabled
                });
            }
        }
    } else if (raw.hooks && typeof raw.hooks === 'object') {
        // New structure processing
        if (raw.hooks.commands) {
            clean.hooks.commands.enabled = raw.hooks.commands.enabled !== false;
            if (Array.isArray(raw.hooks.commands.entries)) {
                clean.hooks.commands.entries = raw.hooks.commands.entries.map(e => ({
                    ...e,
                    enabled: e.enabled !== false,
                    cooldown_ms: e.cooldown_ms || 0
                }));
            }
        }
        if (raw.hooks.webhooks) {
            clean.hooks.webhooks.enabled = raw.hooks.webhooks.enabled !== false;
            if (Array.isArray(raw.hooks.webhooks.entries)) {
                clean.hooks.webhooks.entries = raw.hooks.webhooks.entries.map(e => ({
                    ...e,
                    enabled: e.enabled !== false,
                    method: e.method || "POST"
                }));
            }
        }
        if (raw.hooks.scripts) {
            clean.hooks.scripts.enabled = raw.hooks.scripts.enabled !== false;
            if (Array.isArray(raw.hooks.scripts.entries)) {
                clean.hooks.scripts.entries = raw.hooks.scripts.entries.map(e => ({
                    path: typeof e === 'string' ? e : e.path,
                    enabled: e.enabled !== false
                }));
            }
        }
    }

    // 3. Migrate Scripts (Handle old raw scripts array if it existed separately)
    if (Array.isArray(raw.scripts)) {
        for (const s of raw.scripts) {
            const p = typeof s === 'string' ? s : s.path;
            if (p && !clean.hooks.scripts.entries.some(existing => existing.path === p)) {
                clean.hooks.scripts.entries.push({
                    path: p,
                    enabled: s.enabled !== false
                });
            }
        }
    }

    return clean;
}

export function loadConfig(configPath) {
    if (!fs.existsSync(configPath)) return normalizeConfig({});
    try {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        return normalizeConfig(raw);
    } catch (e) {
        console.error(`[Better Hooks] Config load error: ${e.message}`);
        return normalizeConfig({});
    }
}

export function saveConfig(configPath, config) {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}
