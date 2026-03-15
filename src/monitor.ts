import fs from 'fs';
import { resolveTemplate, parseLogLine } from './utils.js';

export interface LogTailerOptions {
    onLine: (line: string) => void;
    onError?: (error: Error) => void;
}

export class LogTailer {
    private filePath: string;
    private options: LogTailerOptions;
    private watcher: fs.FSWatcher | null = null;
    private position: number = 0;
    private isReading: boolean = false;

    constructor(filePath: string, options: LogTailerOptions) {
        this.filePath = filePath;
        this.options = options;
    }

    start() {
        if (!fs.existsSync(this.filePath)) return;
        this.position = fs.statSync(this.filePath).size;
        this.watcher = fs.watch(this.filePath, (eventType) => {
            if (eventType === 'change' && !this.isReading) {
                this.readNewLines();
            }
        });
    }

    private readNewLines() {
        this.isReading = true;
        fs.stat(this.filePath, (err, stats) => {
            if (err) {
                this.isReading = false;
                if (this.options.onError) this.options.onError(err);
                return;
            }

            if (stats.size < this.position) {
                this.position = 0; // File was truncated/rotated
            }
            if (stats.size === this.position) {
                this.isReading = false;
                return;
            }

            const stream = fs.createReadStream(this.filePath, { start: this.position, end: stats.size });
            let buffer = '';

            stream.on('data', (chunk) => {
                buffer += chunk.toString();
                let nIndex = buffer.indexOf('\n');
                while (nIndex !== -1) {
                    const line = buffer.substring(0, nIndex).trim();
                    if (line) this.options.onLine(line);
                    buffer = buffer.substring(nIndex + 1);
                    nIndex = buffer.indexOf('\n');
                }
            });

            stream.on('end', () => {
                this.position = stats.size;
                this.isReading = false;
            });

            stream.on('error', (error) => {
                this.isReading = false;
                if (this.options.onError) this.options.onError(error);
            });
        });
    }

    stop() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
    }
}
