import { exec } from 'child_process';
import { resolveTemplate } from './utils.js';
import { ActionConfig } from './types.js';

export async function executeAction(action: ActionConfig, context: any, api: any): Promise<void> {
    const logger = api?.logger || { 
        info: (m: string) => console.log(`[Better Hooks INFO] ${m}`),
        error: (m: string) => console.error(`[Better Hooks ERROR] ${m}`)
    };

    if (action.type === 'command' && action.cmd) {
        const cmd = resolveTemplate(action.cmd, context);
        logger.info(`[Better Hooks] Executing: ${cmd}`);
        return new Promise((resolve) => {
            exec(cmd, (err) => {
                if (err) logger.error(`[Better Hooks] Command error: ${err.message}`);
                resolve();
            });
        });
    } else if (action.type === 'webhook' && action.url) {
        const url = resolveTemplate(action.url, context);
        logger.info(`[Better Hooks] Webhook: ${url}`);
        try {
            const method = action.method || 'POST';
            const body = action.body ? resolveTemplate(JSON.stringify(action.body), context) : undefined;
            await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: body
            });
        } catch (e: any) {
            logger.error(`[Better Hooks] Webhook error: ${e.message}`);
        }
    }
}
