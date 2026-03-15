import fs from 'fs';
import path from 'path';
import jiti from 'jiti';
import { executeAction } from './actions.js';
import { LogTailer } from './monitor.js';
import { normalizeConfig } from './config.js';
import { BetterHooksConfig } from './types.js';

export class BetterHooksEngine {
    private api: any;
    private workspace: string;
    private configPath: string;
    private hooksDir: string;
    
    public configCache: BetterHooksConfig;
    private cooldowns = new Map<string, number>();
    private tailer: LogTailer | null = null;
    private currentTailerPath: string | null = null;
    private rotationInterval: NodeJS.Timeout | null = null;
    private jitiLoader: any;

    constructor(api: any, workspace: string) {
        this.api = api;
        // Normalize workspace to sub-directory
        this.workspace = path.join(workspace, 'better-hooks');
        this.configPath = path.join(this.workspace, 'better-hooks.json');
        this.hooksDir = path.join(this.workspace, 'hooks');
        this.jitiLoader = jiti(new URL(import.meta.url).pathname, { interopDefault: true });
        this.configCache = normalizeConfig({});
        this.loadConfig();
    }

    public init() {
        if (!fs.existsSync(this.workspace)) fs.mkdirSync(this.workspace, { recursive: true });
        if (!fs.existsSync(this.hooksDir)) fs.mkdirSync(this.hooksDir, { recursive: true });
        this.watchConfig();
        this.loadScripts();
        this.startTailer();
    }

    private loadConfig() {
        if (!fs.existsSync(this.configPath)) return;
        try {
            const raw = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
            this.configCache = normalizeConfig(raw);
            this.api.logger.info(`[Better Hooks] Config reloaded: ${this.configCache.hooks.commands.entries.length} cmds, ${this.configCache.hooks.webhooks.entries.length} webhooks active.`);
        } catch (e) {
            this.api.logger.error(`[Better Hooks] Config load error: ${e.message}`);
        }
    }

    private watchConfig() {
        fs.watch(this.configPath, (event) => {
            if (event === 'change') {
                this.api.logger.info(`[Better Hooks] Config file changed, hot-reloading...`);
                this.loadConfig();
            }
        });
    }

    private loadScripts() {
        if (!this.configCache.hooks.scripts.enabled) {
            this.api.logger.info(`[Better Hooks] Scripts execution is globally disabled.`);
            return;
        }

        // 1. Load from hooks/ directory (Auto-loader)
        if (fs.existsSync(this.hooksDir)) {
            const files = fs.readdirSync(this.hooksDir).filter(f => f.endsWith('.js') || f.endsWith('.ts'));
            for (const file of files) {
                this.bootScript(path.join(this.hooksDir, file));
            }
        }

        // 2. Load from mounted entries
        for (const entry of this.configCache.hooks.scripts.entries) {
            if (entry.enabled) {
                if (fs.existsSync(entry.path)) {
                    const stats = fs.statSync(entry.path);
                    if (stats.isDirectory()) {
                        fs.readdirSync(entry.path)
                          .filter(f => f.endsWith('.js') || f.endsWith('.ts'))
                          .forEach(f => this.bootScript(path.join(entry.path, f)));
                    } else {
                        this.bootScript(entry.path);
                    }
                }
            }
        }
    }

    private bootScript(fullPath: string) {
        try {
            const script = this.jitiLoader(fullPath);
            if (typeof script.default === 'function') {
                script.default(this.createSdk());
                this.api.logger.info(`[Better Hooks] Script loaded: ${path.basename(fullPath)}`);
            }
        } catch (e) {
            this.api.logger.error(`[Better Hooks] Script error (${path.basename(fullPath)}): ${e.message}`);
        }
    }

    private createSdk() {
        return {
            log: (m: string) => this.api.logger.info(`[Better Script] ${m}`),
            error: (m: string) => this.api.logger.error(`[Better Script] ${m}`),
            on: (event: string, handler: Function) => {
                const natives = ['message:received', 'message:sent', 'gateway:startup', 'agent:bootstrap'];
                if (natives.includes(event)) {
                    this.api.registerHook(event, async (ctx: any) => {
                        await handler({ ...ctx.context, ...ctx });
                    });
                } else {
                    // Custom log event mapping
                    this.api.logger.warn(`[Better Hooks] Script attempted to bind to non-native event: ${event}. Ensure it matches a custom event ID.`);
                }
            }
        };
    }

    public handleLogLine(line: string) {
        if (!this.configCache.events.enabled) return;

        for (const eventDef of this.configCache.events.entries) {
            if (!eventDef.enabled) continue;
            
            if (new RegExp(eventDef.regex).test(line)) {
                let payload: any = null;
                try { payload = JSON.parse(line); } catch { payload = { raw: line }; }

                // Trigger Commands
                if (this.configCache.hooks.commands.enabled) {
                    for (const hook of this.configCache.hooks.commands.entries) {
                        if (hook.enabled && hook.event === eventDef.id) {
                            this.executeWithCooldown(hook, payload);
                        }
                    }
                }

                // Trigger Webhooks
                if (this.configCache.hooks.webhooks.enabled) {
                    for (const hook of this.configCache.hooks.webhooks.entries) {
                        if (hook.enabled && hook.event === eventDef.id) {
                            this.executeWithCooldown({ ...hook, type: 'webhook' }, payload);
                        }
                    }
                }
            }
        }
    }

    private executeWithCooldown(hook: any, payload: any) {
        const now = Date.now();
        const typeKey = hook.type === 'command' ? 'cmd' : 'url';
        const key = `${hook.event}_${hook.type}_${hook[typeKey]}`;
        
        if (now - (this.cooldowns.get(key) || 0) > hook.cooldown_ms) {
            this.cooldowns.set(key, now);
            executeAction(hook, payload, this.api);
        }
    }

    private startTailer() {
        const logFile = this.api.config?.logging?.file || `/tmp/openclaw/openclaw-${new Date().toISOString().split('T')[0]}.log`;
        if (this.tailer && this.currentTailerPath !== logFile) {
            this.tailer.stop();
            this.tailer = null;
        }
        if (!this.tailer && fs.existsSync(logFile)) {
            this.tailer = new LogTailer(logFile, {
                onLine: (l) => this.handleLogLine(l),
                onError: (e) => this.api.logger.error(`[Better Hooks Tailer] ${e}`)
            });
            this.tailer.start();
            this.currentTailerPath = logFile;
        }
    }

    public start() {
        this.init();
        this.rotationInterval = setInterval(() => this.startTailer(), 60000);
    }

    public stop() {
        if (this.rotationInterval) clearInterval(this.rotationInterval);
        if (this.tailer) this.tailer.stop();
    }
}
