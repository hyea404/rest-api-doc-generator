import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

/**
 * PreviewPanelProvider - Manage API documentation preview panel
 */
export class PreviewPanelProvider {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;
    private workspaceRoot: string;

    constructor(context: vscode.ExtensionContext, workspaceRoot: string) {
        this.context = context;
        this.workspaceRoot = workspaceRoot;
    }

    /**
     * Show preview panel
     */
    public async show(filePath?: string): Promise<void> {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If panel already exists, reveal it
        if (this.panel) {
            this.panel.reveal(column);
            await this.loadDocumentation(filePath);
            return;
        }

        // Create new panel
        this.panel = vscode.window.createWebviewPanel(
            'restApiDocsPreview',
            '📄 API Documentation Preview',
            column || vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview'))
                ]
            }
        );

        // Set HTML content
        this.panel.webview.html = this.getWebviewContent();

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                await this.handleMessage(message, filePath);
            },
            undefined,
            this.context.subscriptions
        );

        // Cleanup when panel is closed
        this.panel.onDidDispose(
            () => {
                this.panel = undefined;
            },
            undefined,
            this.context.subscriptions
        );

        // Load documentation
        await this.loadDocumentation(filePath);
    }

    /**
     * Handle messages from webview
     */
    private async handleMessage(message: any, filePath?: string): Promise<void> {
        switch (message.command) {
            case 'loadDocumentation':
                await this.loadDocumentation(filePath);
                break;

            case 'openFile':
                await this.openSourceFile(filePath);
                break;

            case 'export':
                await this.exportDocumentation();
                break;
        }
    }

    /**
     * Load and display documentation
     */
    private async loadDocumentation(filePath?: string): Promise<void> {
        try {
            // Determine file to load
            let targetFile = filePath;
            
            if (!targetFile) {
                // Look for openapi.yaml or openapi.json
                const yamlPath = path.join(this.workspaceRoot, 'openapi.yaml');
                const jsonPath = path.join(this.workspaceRoot, 'openapi.json');

                if (fs.existsSync(yamlPath)) {
                    targetFile = yamlPath;
                } else if (fs.existsSync(jsonPath)) {
                    targetFile = jsonPath;
                } else {
                    throw new Error('No OpenAPI documentation found. Generate documentation first.');
                }
            }

            // Read file
            const content = await fs.promises.readFile(targetFile, 'utf-8');

            // Parse based on extension
            let spec: any;
            if (targetFile.endsWith('.yaml') || targetFile.endsWith('.yml')) {
                spec = yaml.load(content);
            } else {
                spec = JSON.parse(content);
            }

            // Send to webview
            this.panel?.webview.postMessage({
                command: 'showDocumentation',
                spec: spec,
                filename: path.basename(targetFile)
            });

        } catch (error: any) {
            console.error('Failed to load documentation:', error);
            
            this.panel?.webview.postMessage({
                command: 'showError',
                message: error.message
            });

            vscode.window.showErrorMessage(`❌ Failed to load documentation: ${error.message}`);
        }
    }

    /**
     * Open source OpenAPI file
     */
    private async openSourceFile(filePath?: string): Promise<void> {
        try {
            let targetFile = filePath;
            
            if (!targetFile) {
                const yamlPath = path.join(this.workspaceRoot, 'openapi.yaml');
                const jsonPath = path.join(this.workspaceRoot, 'openapi.json');

                if (fs.existsSync(yamlPath)) {
                    targetFile = yamlPath;
                } else if (fs.existsSync(jsonPath)) {
                    targetFile = jsonPath;
                }
            }

            if (targetFile) {
                const doc = await vscode.workspace.openTextDocument(targetFile);
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
            }

        } catch (error: any) {
            vscode.window.showErrorMessage(`❌ Failed to open file: ${error.message}`);
        }
    }

    /**
     * Export documentation
     */
    private async exportDocumentation(): Promise<void> {
        const choice = await vscode.window.showQuickPick(
            ['Export as YAML', 'Export as JSON', 'Export as HTML'],
            {
                placeHolder: 'Select export format'
            }
        );

        if (!choice) {
            return;
        }

        // Show save dialog
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(this.workspaceRoot, 'api-docs')),
            filters: choice.includes('YAML') 
                ? { 'YAML': ['yaml', 'yml'] }
                : choice.includes('JSON')
                ? { 'JSON': ['json'] }
                : { 'HTML': ['html'] }
        });

        if (uri) {
            // Implementation for export would go here
            vscode.window.showInformationMessage(`📄 Exported to ${uri.fsPath}`);
        }
    }

    /**
     * Get webview HTML content
     */
    private getWebviewContent(): string {
        const htmlPath = path.join(
            this.context.extensionPath,
            'src',
            'webview',
            'preview.html'
        );

        try {
            let html = fs.readFileSync(htmlPath, 'utf-8');
            return html;
        } catch (error) {
            console.error('Failed to load preview.html:', error);
            return '<h1>Failed to load preview panel</h1>';
        }
    }

    /**
     * Update preview with new content
     */
    public async update(filePath?: string): Promise<void> {
        if (this.panel) {
            await this.loadDocumentation(filePath);
        }
    }
}