import * as assert from 'assert';
import * as vscode from 'vscode';
import { SecureStorageService } from '../../services/SecureStorageService';

suite('SecureStorageService Test Suite', () => {
    let storageService: SecureStorageService;
    let context: vscode.ExtensionContext;

    // Setup before tests
    suiteSetup(async () => {
        const ext = vscode.extensions.getExtension('your-publisher.rest-api-doc-generator');
        if (ext) {
            context = await ext.activate();
            storageService = new SecureStorageService(context);
        }
    });

    test('Should store and retrieve API key', async () => {
        const testApiKey = 'sk-or-v1-test-key-12345';
        
        await storageService.storeApiKey(testApiKey);
        const retrievedKey = await storageService.getApiKey();
        
        assert.strictEqual(retrievedKey, testApiKey);
    });

    test('Should check if API key exists', async () => {
        const hasKey = await storageService.hasApiKey();
        assert.strictEqual(hasKey, true);
    });

    test('Should delete API key', async () => {
        await storageService.deleteApiKey();
        const hasKey = await storageService.hasApiKey();
        
        assert.strictEqual(hasKey, false);
    });

    // Cleanup after tests
    suiteTeardown(async () => {
        if (storageService) {
            await storageService.deleteApiKey();
        }
    });
});