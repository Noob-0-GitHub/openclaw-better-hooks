# Better Hooks for OpenClaw

Better Hooks is an OpenClaw plugin designed to supercharge native hooks with log-based event polyfills, granular resource management, and frictionless hot-reloading.

## Highlights

- Resource-First CLI: Manage hooks, events, and scripts via structured subcommands.
- Log Event Polyfills: Create custom events by matching regex patterns in system logs.
- Webhook Cooldown: Built-in protection to prevent high-frequency event spam to external services.
- Manual Triggers: Simulate events directly from the CLI for testing and debugging.
- Unified JS/TS Scripting: Write complex stateful logic in .js or .ts files inside your workspace.

---

## Installation

### From NPM
```bash
$ openclaw plugin install openclaw-better-hooks
```

### From Source
```bash
$ git clone https://github.com/noob-0-github/openclaw-better-hooks.git
$ cd openclaw-better-hooks
$ npm install && npm pack
$ openclaw plugins install ./openclaw-better-hooks-1.0.0.tgz
```

---

## Quick Start

Initialize your environment and verify the path configuration:
```bash
$ openclaw better-hooks doctor
# Or use the short alias
$ openclaw bhooks doctor
```

---

## CLI Reference

The plugin supports the alias `bhooks` for all `better-hooks` commands.

### 1. Hook Management (JSON Bindings)
Bind events to Shell commands or Webhooks.

#### Add Hooks
```bash
# Add a Shell Command hook with 5s cooldown
$ openclaw bhooks add command "message:received" "echo 'Hello!'" --cooldown 5000

# Add a Webhook hook
$ openclaw bhooks add webhook "agent:bootstrap" "https://api.example.com/log" --method POST
```

#### List and Update
```bash
$ openclaw bhooks list
# Update existing command at index 0
$ openclaw bhooks update command 0 --cmd "echo 'New Command'" --cooldown 1000
# Update webhook at index 1 and disable it
$ openclaw bhooks update webhook 1 --url "http://new.url" --enabled false
```

#### Remove Hooks
```bash
$ openclaw bhooks rm command 0
$ openclaw bhooks rm webhook 1
```

### 2. Custom Events (Log Regex Polyfills)
Create new events by monitoring system log output.

```bash
# Define a new event tracking specific log patterns
$ openclaw bhooks event add "app:error" "Error: (.*) died" "Detects application crashes"

# Manage Events
$ openclaw bhooks event list
$ openclaw bhooks event rm 0
```

### 3. Script Mounting (JS/TS Files)
Mount external directories or individual scripts.

```bash
$ openclaw bhooks add script ./custom-rules/
$ openclaw bhooks rm script 0
```

### 4. Advanced Controls

#### Manual Triggering
Simulate an event to test your hooks without generating real logs.
```bash
$ openclaw bhooks trigger "app:error" '{"context":"test"}'
```

#### Global Toggles
Enable or disable specific categories or all hooks at once.
```bash
$ openclaw bhooks disable command
$ openclaw bhooks enable all
```

---

## Workspace Context

- Configuration: ~/.openclaw/workspace/better-hooks/better-hooks.json
- Script Autoloader: ~/.openclaw/workspace/better-hooks/hooks/
- Logs: Defaults to `/tmp/openclaw/openclaw-YYYY-MM-DD.log`. You can customize this via OpenClaw's logging config.
- Diagnosis: openclaw bhooks doctor

## Technical Architecture

The plugin utilizes a **dual-track execution model**:

1. **JSON Engine (Hot)**: Handles command and webhook resources. Configuration changes are hot-reloaded instantly via `fs.watch`. It supports **Variable Injection**, allowing you to use `{{content}}`, `{{from}}`, and `{{channelId}}` directly in your shell commands or webhook bodies.
2. **Script Engine (Cold)**: Handles complex logic in `.js` or `.ts` via `better.on(...)`. Auto-loaded via `jiti`. It maps custom log events to a unified event bus, acting as a **Log Polyfill** for events not natively exposed by OpenClaw.

Actions are designed to fail silently to avoid polluting the main Gateway logs, while still providing feedback via the `doctor` command and CLI triggers.

## Security

Warning: This plugin enables arbitrary shell execution and network requests based on system events. Ensure your configuration workspace is protected and your regex patterns are specific enough to avoid unintended triggers.

Licensed under MIT.
