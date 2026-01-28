import * as vscode from 'vscode';
import { SecureStorageService } from './services/SecureStorageService';
import { ParserService } from './services/ParserService';

let storageService: SecureStorageService;

export function activate(context: vscode.ExtensionContext) {
    console.log('🚀 REST API Doc Generator is now active!');

    // Initialize SecureStorageService
    storageService = new SecureStorageService(context);

    // Command: Set API Key
    let setApiKeyCommand = vscode.commands.registerCommand(
        'rest-api-doc-generator.setApiKey',
        async () => {
            const apiKey = await vscode.window.showInputBox({
                prompt: 'Enter your OpenRouter API Key',
                placeHolder: 'sk-or-v1-...',
                password: true, // Hide input
                ignoreFocusOut: true,
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'API key cannot be empty';
                    }
                    if (!value.startsWith('sk-or-v1-')) {
                        return 'Invalid API key format. Should start with sk-or-v1-';
                    }
                    return null;
                }
            });

            if (apiKey) {
                try {
                    await storageService.storeApiKey(apiKey);
                    vscode.window.showInformationMessage('✅ API key saved successfully!');
                } catch (error) {
                    vscode.window.showErrorMessage('❌ Failed to save API key');
                }
            }
        }
    );

    // Command: Check API Key Status
    let checkApiKeyCommand = vscode.commands.registerCommand(
        'rest-api-doc-generator.checkApiKey',
        async () => {
            const hasKey = await storageService.hasApiKey();
            if (hasKey) {
                const apiKey = await storageService.getApiKey();
                const maskedKey = apiKey ? `${apiKey.substring(0, 15)}...` : '';
                vscode.window.showInformationMessage(`✅ API key is set: ${maskedKey}`);
            } else {
                vscode.window.showWarningMessage('⚠️ API key is not set. Use "Set API Key" command.');
            }
        }
    );

    // Command: Delete API Key
    let deleteApiKeyCommand = vscode.commands.registerCommand(
        'rest-api-doc-generator.deleteApiKey',
        async () => {
            const confirm = await vscode.window.showWarningMessage(
                'Are you sure you want to delete the API key?',
                { modal: true },
                'Yes', 'No'
            );

            if (confirm === 'Yes') {
                try {
                    await storageService.deleteApiKey();
                    vscode.window.showInformationMessage('✅ API key deleted successfully');
                } catch (error) {
                    vscode.window.showErrorMessage('❌ Failed to delete API key');
                }
            }
        }
    );

    let scanRoutesCommand = vscode.commands.registerCommand(
        'rest-api-doc-generator.scanRoutes',
        async () => {
            // Check workspace
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('❌ No workspace folder open');
                return;
            }

            const workspaceRoot = workspaceFolders[0].uri.fsPath;

            try {
                vscode.window.showInformationMessage('🔍 Scanning routes...');

                // Create parser service
                const parserService = new ParserService(workspaceRoot);

                // Scan and parse
                const result = await parserService.scanAndParseRoutes();

                // Show results
                if (result.totalRoutes > 0) {
                    const outputChannel = vscode.window.createOutputChannel('REST API Routes');
                    outputChannel.clear();
                    outputChannel.appendLine('='.repeat(60));
                    outputChannel.appendLine('REST API ROUTES SCAN RESULTS');
                    outputChannel.appendLine('='.repeat(60));
                    outputChannel.appendLine(`Total Files: ${result.totalFiles}`);
                    outputChannel.appendLine(`Total Routes: ${result.totalRoutes}`);
                    outputChannel.appendLine(`Errors: ${result.errors.length}`);
                    outputChannel.appendLine('');

                    // Group routes by file
                    const routesByFile = new Map<string, typeof result.routes>();
                    for (const route of result.routes) {
                        if (!routesByFile.has(route.filePath)) {
                            routesByFile.set(route.filePath, []);
                        }
                        routesByFile.get(route.filePath)!.push(route);
                    }

                    // Display routes
                    routesByFile.forEach((routes, filePath) => {
                        outputChannel.appendLine(`\n📄 ${filePath}`);
                        outputChannel.appendLine('-'.repeat(60));
                        
                        routes.forEach(route => {
                            outputChannel.appendLine(
                                `  ${route.method.padEnd(7)} ${route.path}`
                            );
                            if (route.parameters.length > 0) {
                                outputChannel.appendLine(
                                    `           Parameters: ${route.parameters.map(p => p.name).join(', ')}`
                                );
                            }
                            if (route.middlewares.length > 0) {
                                outputChannel.appendLine(
                                    `           Middlewares: ${route.middlewares.map(m => m.name).join(', ')}`
                                );
                            }
                        });
                    });

                    outputChannel.show();
                } else {
                    vscode.window.showWarningMessage('⚠️ No routes found');
                }

            } catch (error) {
                console.error('❌ Error scanning routes:', error);
                vscode.window.showErrorMessage('❌ Failed to scan routes');
            }
        }
    );

    context.subscriptions.push(setApiKeyCommand, checkApiKeyCommand, deleteApiKeyCommand, scanRoutesCommand);
}

export function deactivate() {
    console.log('👋 REST API Doc Generator deactivated');
}

// Export storage service untuk digunakan di module lain
export function getStorageService(): SecureStorageService {
    return storageService;
}