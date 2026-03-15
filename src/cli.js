const fs = require('fs');
const path = require('path');
const { loadConfig, saveConfig } = require('./config.js');

function getPaths(ctx) {
    const baseWorkspace = ctx.workspaceDir || path.join(process.env.HOME || '/root', '.openclaw', 'workspace');
    const workspace = path.join(baseWorkspace, 'better-hooks');
    
    // Ensure directory exists - NO SILENT FALLBACK
    if (!fs.existsSync(workspace)) {
        fs.mkdirSync(workspace, { recursive: true });
    }

    const configPath = path.join(workspace, 'better-hooks.json');
    const hooksDir = path.join(workspace, 'hooks');
    return { workspace, configPath, hooksDir };
}

/** 
 * --- HOOK Group ---
 */

function runAddHook(ctx, type, event, target, options = {}) {
    const { configPath } = getPaths(ctx);
    const config = loadConfig(configPath);
    const cooldownMs = parseInt(options.cooldown, 10) || 0;
    const isEnabled = options.enabled !== 'false';

    if (type === 'command') {
        config.hooks.commands.entries.push({ 
            event, 
            cmd: target, 
            cooldown_ms: cooldownMs, 
            enabled: isEnabled 
        });
    } else if (type === 'webhook') {
        config.hooks.webhooks.entries.push({ 
            event, 
            url: target, 
            method: options.method || "POST", 
            body: options.body ? JSON.parse(options.body) : null,
            cooldown_ms: cooldownMs,
            enabled: isEnabled 
        });
    } else {
        console.error(`[ERROR] Invalid hook type: ${type}.`);
        return;
    }

    saveConfig(configPath, config);
    console.log(`[SUCCESS] Added ${type} hook for '${event}' (Enabled: ${isEnabled}).`);
}

function runListHooks(ctx) {
    const { configPath } = getPaths(ctx);
    const config = loadConfig(configPath);

    console.log("--- Command Hooks ---");
    console.log(`Global Status: ${config.hooks.commands.enabled ? "ENABLED" : "DISABLED"}`);
    config.hooks.commands.entries.forEach((h, i) => {
        console.log(`[${i}] [${h.enabled ? "ON " : "OFF"}] Event: ${h.event} | Cmd: ${h.cmd} | Cooldown: ${h.cooldown_ms}ms`);
    });

    console.log("--- Webhook Hooks ---");
    console.log(`Global Status: ${config.hooks.webhooks.enabled ? "ENABLED" : "DISABLED"}`);
    config.hooks.webhooks.entries.forEach((h, i) => {
        console.log(`[${i}] [${h.enabled ? "ON " : "OFF"}] Event: ${h.event} | Method: ${h.method} | URL: ${h.url} | Cooldown: ${h.cooldown_ms || 0}ms`);
    });

    console.log("--- Mounted Scripts ---");
    console.log(`Global Status: ${config.hooks.scripts.enabled ? "ENABLED" : "DISABLED"}`);
    config.hooks.scripts.entries.forEach((s, i) => {
        const type = fs.existsSync(s.path) ? (fs.statSync(s.path).isDirectory() ? "DIR " : "FILE") : "MISS";
        console.log(`[${i}] [${s.enabled ? "ON " : "OFF"}] [${type}] ${s.path}`);
    });
}

function runUpdateHook(ctx, type, index, options = {}) {
    const { configPath } = getPaths(ctx);
    const config = loadConfig(configPath);
    const idx = parseInt(index, 10);

    let targetArr;
    if (type === 'command') targetArr = config.hooks.commands.entries;
    else if (type === 'webhook') targetArr = config.hooks.webhooks.entries;
    else if (type === 'script') targetArr = config.hooks.scripts.entries;
    else { console.error("Invalid type."); return; }

    if (isNaN(idx) || idx < 0 || idx >= targetArr.length) {
        console.error(`[ERROR] Invalid index: ${idx}`);
        return;
    }

    const item = targetArr[idx];
    if (options.event && type !== 'script') item.event = options.event;
    if (options.enabled !== undefined) item.enabled = options.enabled !== 'false';
    
    if (type === 'command') {
        if (options.cmd) item.cmd = options.cmd;
        if (options.cooldown !== undefined) item.cooldown_ms = parseInt(options.cooldown, 10);
    } else if (type === 'webhook') {
        if (options.url) item.url = options.url;
        if (options.method) item.method = options.method;
        if (options.body) item.body = JSON.parse(options.body);
        if (options.cooldown !== undefined) item.cooldown_ms = parseInt(options.cooldown, 10);
    } else if (type === 'script') {
        if (options.path) item.path = path.resolve(options.path);
    }

    saveConfig(configPath, config);
    console.log(`[SUCCESS] Updated ${type} at index ${idx}.`);
}

function runRemoveHook(ctx, type, index) {
    const { configPath } = getPaths(ctx);
    const config = loadConfig(configPath);
    const idx = parseInt(index, 10);

    let target;
    if (type === 'command') target = config.hooks.commands.entries;
    else if (type === 'webhook') target = config.hooks.webhooks.entries;
    else if (type === 'script') target = config.hooks.scripts.entries;
    else { console.error("Use 'command', 'webhook', or 'script'."); return; }

    if (isNaN(idx) || idx < 0 || idx >= target.length) {
        console.error(`[ERROR] Invalid index: ${idx}`);
        return;
    }

    const removed = target.splice(idx, 1);
    saveConfig(configPath, config);
    console.log(`[SUCCESS] Removed ${type} at index ${idx}.`);
}

function runToggleHooks(ctx, type, state) {
    const { configPath } = getPaths(ctx);
    const config = loadConfig(configPath);
    const enabled = state === 'enable';

    if (type === 'command') config.hooks.commands.enabled = enabled;
    else if (type === 'webhook') config.hooks.webhooks.enabled = enabled;
    else if (type === 'script') config.hooks.scripts.enabled = enabled;
    else if (type === 'event') config.events.enabled = enabled;
    else if (type === 'all') {
        config.hooks.commands.enabled = enabled;
        config.hooks.webhooks.enabled = enabled;
        config.hooks.scripts.enabled = enabled;
        config.events.enabled = enabled;
    } else { console.error("Target: command|webhook|script|event|all"); return; }

    saveConfig(configPath, config);
    console.log(`[SUCCESS] ${state.toUpperCase()}D: ${type}`);
}

/** 
 * --- SCRIPT Group ---
 */

function runAddScript(ctx, scriptPath, options = {}) {
    const { configPath } = getPaths(ctx);
    const config = loadConfig(configPath);
    const resolved = path.resolve(scriptPath);
    const isEnabled = options.enabled !== 'false';

    if (config.hooks.scripts.entries.some(e => e.path === resolved)) {
        console.warn(`[WARN] Already mounted: ${resolved}`);
        return;
    }

    config.hooks.scripts.entries.push({ path: resolved, enabled: isEnabled });
    saveConfig(configPath, config);
    console.log(`[SUCCESS] Mounted script: ${resolved} (Enabled: ${isEnabled})`);
}

/** 
 * --- EVENT Group ---
 */

function runAddEvent(ctx, id, regex, desc, options = {}) {
    const { configPath } = getPaths(ctx);
    const config = loadConfig(configPath);
    const isEnabled = options.enabled !== 'false';

    if (config.events.entries.some(e => e.id === id)) {
        console.error(`[ERROR] Event ID '${id}' already exists.`);
        return;
    }

    config.events.entries.push({ id, regex, description: desc || "", enabled: isEnabled });
    saveConfig(configPath, config);
    console.log(`[SUCCESS] Defined event: ${id} (Enabled: ${isEnabled})`);
}

function runListEvents(ctx) {
    const { configPath } = getPaths(ctx);
    const config = loadConfig(configPath);

    console.log("--- Custom Events ---");
    console.log(`Global Status: ${config.events.enabled ? "ENABLED" : "DISABLED"}`);
    config.events.entries.forEach((e, i) => {
        console.log(`[${i}] [${e.enabled ? "ON " : "OFF"}] ID: ${e.id} | Regex: ${e.regex}`);
    });
}

function runRemoveEvent(ctx, index) {
    const { configPath } = getPaths(ctx);
    const config = loadConfig(configPath);
    const idx = parseInt(index, 10);

    if (isNaN(idx) || idx < 0 || idx >= config.events.entries.length) {
        console.error("Invalid index.");
        return;
    }

    const removed = config.events.entries.splice(idx, 1);
    saveConfig(configPath, config);
    console.log(`[SUCCESS] Removed event: ${removed[0].id}`);
}

/** 
 * --- SYSTEM ---
 */

function runDoctor(ctx) {
    console.log("Running Better Hooks Doctor...");
    const { workspace, configPath, hooksDir } = getPaths(ctx);
    
    // Ensure physical environment exists
    if (!fs.existsSync(workspace)) {
        console.log(`[FIX] Creating workspace directory: ${workspace}`);
        fs.mkdirSync(workspace, { recursive: true });
    }
    
    if (!fs.existsSync(configPath)) {
        console.log(`[FIX] Initializing default config file: ${configPath}`);
        const defaultConfig = loadConfig(configPath);
        saveConfig(configPath, defaultConfig);
    }

    try {
        const config = loadConfig(configPath);
        console.log(`[SUCCESS] Config path: ${configPath}`);
        console.log(`[INFO] Commands: ${config.hooks.commands.entries.length} | Webhooks: ${config.hooks.webhooks.entries.length} | Scripts: ${config.hooks.scripts.entries.length}`);
    } catch (e) {
        console.error(`[ERROR] Doctor fail: ${e.message}`);
    }
}

function runTriggerEvent(ctx, eventId, payloadStr) {
    const { configPath } = getPaths(ctx);
    const config = loadConfig(configPath);
    
    let payload = {};
    if (payloadStr) {
        try { payload = JSON.parse(payloadStr); } catch { payload = { raw: payloadStr }; }
    }

    console.log(`[TRIGGER] Manually triggering event: ${eventId}`);
    const actions = require('./actions.js');
    const logger = { 
        info: (m) => console.log(`[Better Hooks INFO] ${m}`),
        error: (m) => console.error(`[Better Hooks ERROR] ${m}`)
    };
    
    if (config.hooks.commands.enabled) {
        config.hooks.commands.entries.forEach(h => {
            if (h.enabled && h.event === eventId) {
                console.log(`[EXEC] Command: ${h.cmd}`);
                actions.executeAction({ ...h, type: 'command' }, payload, { logger });
            }
        });
    }

    if (config.hooks.webhooks.enabled) {
        config.hooks.webhooks.entries.forEach(h => {
            if (h.enabled && h.event === eventId) {
                console.log(`[EXEC] Webhook: ${h.url}`);
                actions.executeAction({ ...h, type: 'webhook' }, payload, { logger });
            }
        });
    }
}

module.exports = {
    runAddHook,
    runListHooks,
    runUpdateHook,
    runRemoveHook,
    runToggleHooks,
    runAddScript,
    runAddEvent,
    runListEvents,
    runRemoveEvent,
    runDoctor,
    runTriggerEvent
};
