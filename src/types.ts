export interface EventConfig {
    id: string;
    regex: string;
    description?: string;
    enabled: boolean;
}

export interface CommandHookConfig {
    event: string;
    cmd: string;
    cooldown_ms: number;
    enabled: boolean;
}

export interface WebhookHookConfig {
    event: string;
    url: string;
    method: string;
    body?: any;
    cooldown_ms: number;
    enabled: boolean;
}

export interface ScriptHookConfig {
    path: string;
    enabled: boolean;
}

export interface BetterHooksConfig {
    events: {
        enabled: boolean;
        entries: EventConfig[];
    };
    hooks: {
        commands: {
            enabled: boolean;
            entries: CommandHookConfig[];
        };
        webhooks: {
            enabled: boolean;
            entries: WebhookHookConfig[];
        };
        scripts: {
            enabled: boolean;
            entries: ScriptHookConfig[];
        };
    };
}
