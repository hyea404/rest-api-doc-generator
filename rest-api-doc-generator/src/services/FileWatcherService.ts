import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Callback type for file change events
 */
type FileChangeCallback = (filePath: string) => void;

/**
 * FileWatcherService - Watch route files for changes
 */
export class FileWatcherService {
    private watchers: vscode.FileSystemWatcher[] = [];
    private debounceTimer: NodeJS.Timeout | undefined;
    private debounceDelay: number = 2000; // 2 seconds
    private isEnabled: boolean = true;
    private onChange: FileChangeCallback;
    private workspaceRoot: string;

    constructor(workspaceRoot: string, onChange: FileChangeCallback) {
        this.workspaceRoot = workspaceRoot;
        this.onChange = onChange;
    }

    /**
     * Start watching route files
     */
    start(): void {
        if (!this.isEnabled) {
            console.log('⏸️ Auto-sync is disabled');
            return;
        }

        console.log('👁️ Starting file watchers...');
        console.log('📂 Workspace root:', this.workspaceRoot);

        // Watch patterns for route files
        const patterns = [
            'routes/**/*.js',
            'routes/**/*.ts',
            'src/routes/**/*.js',
            'src/routes/**/*.ts',
            'sample-express-project/routes/**/*.js',
            'sample-express-project/routes/**/*.ts'
        ];

        console.log('🔍 Watch patterns:', patterns);

        patterns.forEach(pattern => {
            const watcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(this.workspaceRoot, pattern)
            );

            console.log(`✅ Created watcher for: ${pattern}`);

            // On file change
            watcher.onDidChange((uri) => {
                console.log(`📝 File changed: ${uri.fsPath}`);
                this.debounce(uri.fsPath);
            });

            // On file create
            watcher.onDidCreate((uri) => {
                console.log(`✨ New file created: ${uri.fsPath}`);
                this.debounce(uri.fsPath);
            });

            // On file delete
            watcher.onDidDelete((uri) => {
                console.log(`🗑️ File deleted: ${uri.fsPath}`);
                this.debounce(uri.fsPath);
            });

            this.watchers.push(watcher);
        });

        console.log(`✅ Watching ${this.watchers.length} patterns`);
        vscode.window.showInformationMessage('👁️ Auto-sync enabled! Documentation will update on file changes.');
    }

    /**
     * Stop watching files
     */
    stop(): void {
        this.watchers.forEach(watcher => watcher.dispose());
        this.watchers = [];

        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = undefined;
        }

        console.log('⏹️ File watchers stopped');
    }

    /**
     * Debounce file change events
     */
    private debounce(filePath: string): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            console.log(`⏰ Debounce complete, triggering sync for: ${filePath}`);
            this.onChange(filePath);
        }, this.debounceDelay);
    }

    /**
     * Enable/disable auto-sync
     */
    setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;

        if (enabled) {
            this.start();
        } else {
            this.stop();
            vscode.window.showInformationMessage('⏸️ Auto-sync disabled.');
        }
    }

    /**
     * Check if enabled
     */
    isActive(): boolean {
        return this.isEnabled && this.watchers.length > 0;
    }

    /**
     * Set debounce delay
     */
    setDebounceDelay(delay: number): void {
        this.debounceDelay = delay;
    }
}