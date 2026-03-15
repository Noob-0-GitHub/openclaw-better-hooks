import fs from 'fs';
import path from 'path';
import os from 'os';
import { BetterHooksEngine } from './src/engine.js';

export default function register(api: any) {
    api.logger.info("[Better Hooks] Booting Unified Event Bus...");

    const workspaceRoot = api.config?.agents?.defaults?.workspace || path.join(os.homedir(), '.openclaw', 'workspace');
    const workspaceDir = path.join(workspaceRoot, api.id || 'better-hooks');
    const engine = new BetterHooksEngine(api, workspaceDir);

    // Register Native Hooks (Selective processing based on new schema)
    if (engine.configCache.hooks.commands.enabled || engine.configCache.hooks.webhooks.enabled) {
        const natives = ['message:received', 'message:sent', 'gateway:startup', 'agent:bootstrap'];
        
        // Command Hooks for Natives
        for (const hook of engine.configCache.hooks.commands.entries) {
            if (hook.enabled && natives.includes(hook.event)) {
                api.registerHook(hook.event, async (ctx: any) => {
                    const { executeAction } = await import('./src/actions.js');
                    await executeAction({ ...hook, type: 'command' } as any, { ...ctx.context, ...ctx }, api);
                });
            }
        }
        
        // Webhook Hooks for Natives
        for (const hook of engine.configCache.hooks.webhooks.entries) {
            if (hook.enabled && natives.includes(hook.event)) {
                api.registerHook(hook.event, async (ctx: any) => {
                    const { executeAction } = await import('./src/actions.js');
                    await executeAction({ ...hook, type: 'webhook' } as any, { ...ctx.context, ...ctx }, api);
                });
            }
        }
    }

    api.registerService({
        id: "better-hooks-engine",
        start: () => engine.start(),
        stop: () => engine.stop()
    });

    api.registerCli((ctx: any) => {
        const { program } = ctx;
        const root = program.command("better-hooks").alias("bhooks").description("Better Hooks management");

        // 1. ADD Group
        const add = root.command("add").description("Add a new hook or resource");
        
        add.command("command <event> <cmd>")
            .description("Add a shell command hook")
            .option("-c, --cooldown <ms>", "Cooldown in ms", "0")
            .option("-d, --disabled", "Add in disabled state")
            .action((e: string, c: string, o: any) => require("./src/cli.js").runAddHook(ctx, 'command', e, c, { ...o, enabled: o.disabled ? 'false' : 'true' }));

        add.command("webhook <event> <url>")
            .description("Add a webhook hook")
            .option("-c, --cooldown <ms>", "Cooldown in ms", "0")
            .option("-m, --method <verb>", "HTTP Method", "POST")
            .option("-b, --body <json>", "Custom static body merge")
            .option("-d, --disabled", "Add in disabled state")
            .action((e: string, u: string, o: any) => require("./src/cli.js").runAddHook(ctx, 'webhook', e, u, { ...o, enabled: o.disabled ? 'false' : 'true' }));

        add.command("script <path>")
            .description("Mount a JS/TS script or directory")
            .option("-d, --disabled", "Mount in disabled state")
            .action((p: string, o: any) => require("./src/cli.js").runAddScript(ctx, p, { enabled: o.disabled ? 'false' : 'true' }));

        // 2. UPDATE Group
        const update = root.command("update").description("Update an existing hook or resource");
        
        update.command("command <index>")
            .option("-e, --event <id>", "Update event ID")
            .option("-c, --cmd <cmd>", "Update shell command")
            .option("-l, --cooldown <ms>", "Update cooldown")
            .option("--enable", "Enable this hook")
            .option("--disable", "Disable this hook")
            .action((i: string, o: any) => require("./src/cli.js").runUpdateHook(ctx, 'command', i, { ...o, enabled: o.disable ? 'false' : (o.enable ? 'true' : undefined) }));

        update.command("webhook <index>")
            .option("-e, --event <id>", "Update event ID")
            .option("-u, --url <url>", "Update target URL")
            .option("-m, --method <verb>", "Update HTTP method")
            .option("-b, --body <json>", "Update static body")
            .option("-c, --cooldown <ms>", "Update cooldown")
            .option("--enable", "Enable this hook")
            .option("--disable", "Disable this hook")
            .action((i: string, o: any) => require("./src/cli.js").runUpdateHook(ctx, 'webhook', i, { ...o, enabled: o.disable ? 'false' : (o.enable ? 'true' : undefined) }));

        update.command("script <index>")
            .option("-p, --path <path>", "Update mount path")
            .option("--enable", "Enable this mount")
            .option("--disable", "Disable this mount")
            .action((i: string, o: any) => require("./src/cli.js").runUpdateHook(ctx, 'script', i, { ...o, enabled: o.disable ? 'false' : (o.enable ? 'true' : undefined) }));

        // 3. LIST (Unified)
        root.command("list")
            .description("List all active hooks")
            .action(() => require("./src/cli.js").runListHooks(ctx));

        // 4. REMOVE Group
        const rm = root.command("remove").alias("rm").description("Remove a hook or resource");
        rm.command("command <index>").action((i: string) => require("./src/cli.js").runRemoveHook(ctx, 'command', i));
        rm.command("webhook <index>").action((i: string) => require("./src/cli.js").runRemoveHook(ctx, 'webhook', i));
        rm.command("script <index>").action((i: string) => require("./src/cli.js").runRemoveScript(ctx, i));

        // 5. TOGGLE (Global Category Switches)
        root.command("enable <type>").description("Enable category (command|webhook|script|event|all)").action((t: string) => require("./src/cli.js").runToggleHooks(ctx, t, 'enable'));
        root.command("disable <type>").description("Disable category (command|webhook|script|event|all)").action((t: string) => require("./src/cli.js").runToggleHooks(ctx, t, 'disable'));

        // 6. EVENT Management
        const event = root.command("event").description("Custom log event management");
        event.command("add <id> <regex> [desc]").option("-d, --disabled", "Add in disabled state").action((i: string, r: string, d: string, o: any) => require("./src/cli.js").runAddEvent(ctx, i, r, d, { enabled: o.disabled ? 'false' : 'true' }));
        event.command("list").action(() => require("./src/cli.js").runListEvents(ctx));
        event.command("remove <index>").alias("rm").action((i: string) => require("./src/cli.js").runRemoveEvent(ctx, i));

        // 7. SYSTEM
        root.command("doctor").description("Run diagnostics").action(() => require("./src/cli.js").runDoctor(ctx));
        root.command("trigger <eventId> [payload]").description("Manually trigger an event").action((e: string, p: string) => require("./src/cli.js").runTriggerEvent(ctx, e, p));
        
    }, { commands: ["better-hooks", "bhooks"] });
}
