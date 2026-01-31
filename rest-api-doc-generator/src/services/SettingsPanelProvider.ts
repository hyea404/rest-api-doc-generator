import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SecureStorageService } from './SecureStorageService';
import { OpenRouterClient } from './OpenRouterClient';

/**
 * Settings interface
 */
export interface Settings {
    apiKey?: string;
    aiModel: string;
    apiTitle: string;
    apiVersion: string;
    serverUrl: string;
    autoValidate: boolean;
    generateBoth: boolean;
    extractSchemas: boolean;
}

/**
 * SettingsPanelProvider - Manage settings webview panel
 */
export class SettingsPanelProvider {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;
    private storageService: SecureStorageService;

    constructor(context: vscode.ExtensionContext, storageService: SecureStorageService) {
        this.context = context;
        this.storageService = storageService;
    }

    /**
     * Show settings panel
     */
    public async show(): Promise<void> {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If panel already exists, reveal it
        if (this.panel) {
            this.panel.reveal(column);
            return;
        }

        // Create new panel
        this.panel = vscode.window.createWebviewPanel(
            'restApiDocsSettings',
            '⚙️ REST API Docs Settings',
            column || vscode.ViewColumn.One,
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
                await this.handleMessage(message);
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

        // Load and send current settings
        await this.loadAndSendSettings();
    }

    /**
     * Handle messages from webview
     */
    private async handleMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'loadSettings':
                await this.loadAndSendSettings();
                break;

            case 'saveSettings':
                await this.saveSettings(message.settings);
                break;

            case 'testConnection':
                await this.testConnection();
                break;

            case 'viewModels':
                await this.viewModels();
                break;

            case 'resetSettings':
                await this.resetSettings();
                break;
        }
    }

    /**
     * Load settings and send to webview
     */
    private async loadAndSendSettings(): Promise<void> {
        const settings = await this.loadSettings();

        this.panel?.webview.postMessage({
            command: 'settingsLoaded',
            settings: settings
        });
    }

    /**
     * Load settings from storage
     */
    private async loadSettings(): Promise<Settings> {
        const apiKey = await this.storageService.getApiKey();
        
        const config = vscode.workspace.getConfiguration('restApiDocs');

        return {
            apiKey: apiKey,
            aiModel: config.get('aiModel', 'google/gemma-3-12b-it:free'),
            apiTitle: config.get('apiTitle', 'REST API Documentation'),
            apiVersion: config.get('apiVersion', '1.0.0'),
            serverUrl: config.get('serverUrl', 'http://localhost:3000'),
            autoValidate: config.get('autoValidate', true),
            generateBoth: config.get('generateBoth', true),
            extractSchemas: config.get('extractSchemas', true)
        };
    }

    /**
     * Save settings
     */
    private async saveSettings(settings: Settings): Promise<void> {
        try {
            // Save API key to secure storage
            if (settings.apiKey && settings.apiKey.trim().length > 0) {
                await this.storageService.storeApiKey(settings.apiKey);
            }

            // Save other settings to workspace config
            const config = vscode.workspace.getConfiguration('restApiDocs');

            await config.update('aiModel', settings.aiModel, vscode.ConfigurationTarget.Global);
            await config.update('apiTitle', settings.apiTitle, vscode.ConfigurationTarget.Global);
            await config.update('apiVersion', settings.apiVersion, vscode.ConfigurationTarget.Global);
            await config.update('serverUrl', settings.serverUrl, vscode.ConfigurationTarget.Global);
            await config.update('autoValidate', settings.autoValidate, vscode.ConfigurationTarget.Global);
            await config.update('generateBoth', settings.generateBoth, vscode.ConfigurationTarget.Global);
            await config.update('extractSchemas', settings.extractSchemas, vscode.ConfigurationTarget.Global);

            // Show success message
            this.panel?.webview.postMessage({
                command: 'showStatus',
                type: 'success',
                message: '✅ Settings saved successfully!'
            });

            vscode.window.showInformationMessage('✅ Settings saved successfully!');

        } catch (error: any) {
            console.error('Failed to save settings:', error);
            
            this.panel?.webview.postMessage({
                command: 'showStatus',
                type: 'error',
                message: `❌ Failed to save settings: ${error.message}`
            });

            vscode.window.showErrorMessage(`❌ Failed to save settings: ${error.message}`);
        }
    }

    /**
     * Test OpenRouter connection
     */
    private async testConnection(): Promise<void> {
        try {
            const apiKey = await this.storageService.getApiKey();
            
            if (!apiKey) {
                this.panel?.webview.postMessage({
                    command: 'showStatus',
                    type: 'error',
                    message: '❌ API key not set. Please enter your API key first.'
                });
                return;
            }

            this.panel?.webview.postMessage({
                command: 'showStatus',
                type: 'info',
                message: '🧪 Testing connection...'
            });

            const settings = await this.loadSettings();
            const client = new OpenRouterClient(apiKey, settings.aiModel);
            const isConnected = await client.testConnection();

            if (isConnected) {
                this.panel?.webview.postMessage({
                    command: 'showStatus',
                    type: 'success',
                    message: `✅ Connection successful! Model: ${settings.aiModel}`
                });
            } else {
                this.panel?.webview.postMessage({
                    command: 'showStatus',
                    type: 'error',
                    message: '❌ Connection failed. Please check your API key.'
                });
            }

        } catch (error: any) {
            this.panel?.webview.postMessage({
                command: 'showStatus',
                type: 'error',
                message: `❌ Connection test failed: ${error.message}`
            });
        }
    }

    /**
     * View available models
     */
    private async viewModels(): Promise<void> {
        try {
            const apiKey = await this.storageService.getApiKey();
            
            if (!apiKey) {
                vscode.window.showWarningMessage('⚠️ API key not set');
                return;
            }

            vscode.window.showInformationMessage('🔍 Fetching available models...');

            const client = new OpenRouterClient(apiKey);
            const models = await client.getAvailableModels();

            // Filter Gemma models
            const gemmaModels = models.data.filter((m: any) => 
                m.id.toLowerCase().includes('gemma')
            );

            const outputChannel = vscode.window.createOutputChannel('Available Models');
            outputChannel.clear();
            outputChannel.appendLine('='.repeat(60));
            outputChannel.appendLine('AVAILABLE GEMMA MODELS');
            outputChannel.appendLine('='.repeat(60));
            
            gemmaModels.forEach((model: any) => {
                outputChannel.appendLine(`\n📦 ${model.id}`);
                outputChannel.appendLine(`   Name: ${model.name}`);
                outputChannel.appendLine(`   Context: ${model.context_length} tokens`);
                if (model.pricing) {
                    outputChannel.appendLine(`   Free: ${model.pricing.prompt === '0' ? 'Yes' : 'No'}`);
                }
            });

            outputChannel.show();

            this.panel?.webview.postMessage({
                command: 'showStatus',
                type: 'success',
                message: '✅ Models list loaded. Check output panel.'
            });

        } catch (error: any) {
            console.error('Failed to fetch models:', error);
            vscode.window.showErrorMessage(`❌ Failed to fetch models: ${error.message}`);
        }
    }

    /**
     * Reset settings to defaults
     */
    private async resetSettings(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('restApiDocs');

            await config.update('aiModel', 'google/gemma-3-12b-it:free', vscode.ConfigurationTarget.Global);
            await config.update('apiTitle', 'REST API Documentation', vscode.ConfigurationTarget.Global);
            await config.update('apiVersion', '1.0.0', vscode.ConfigurationTarget.Global);
            await config.update('serverUrl', 'http://localhost:3000', vscode.ConfigurationTarget.Global);
            await config.update('autoValidate', true, vscode.ConfigurationTarget.Global);
            await config.update('generateBoth', true, vscode.ConfigurationTarget.Global);
            await config.update('extractSchemas', true, vscode.ConfigurationTarget.Global);

            await this.loadAndSendSettings();

            this.panel?.webview.postMessage({
                command: 'showStatus',
                type: 'success',
                message: '✅ Settings reset to defaults!'
            });

            vscode.window.showInformationMessage('✅ Settings reset to defaults!');

        } catch (error: any) {
            console.error('Failed to reset settings:', error);
            vscode.window.showErrorMessage(`❌ Failed to reset settings: ${error.message}`);
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
            'settings.html'
        );

        try {
            let html = fs.readFileSync(htmlPath, 'utf-8');
            return html;
        } catch (error) {
            console.error('Failed to load settings.html:', error);
            return '<h1>Failed to load settings panel</h1>';
        }
    }
}