import * as vscode from 'vscode';
import { SecureStorageService } from './services/SecureStorageService';

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

    context.subscriptions.push(setApiKeyCommand, checkApiKeyCommand, deleteApiKeyCommand);
}

export function deactivate() {
    console.log('👋 REST API Doc Generator deactivated');
}

// Export storage service untuk digunakan di module lain
export function getStorageService(): SecureStorageService {
    return storageService;
}