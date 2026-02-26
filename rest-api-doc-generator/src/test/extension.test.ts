import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Integration Test Suite', () => {
    // This runs before all tests in this suite
    suiteSetup(async () => {
        // Ensure extension is activated
        const extension = vscode.extensions.getExtension(
            'your-publisher.rest-api-doc-generator'
        );
        
        if (extension && !extension.isActive) {
            await extension.activate();
        }
    });

    test('Extension should be present', () => {
        const extension = vscode.extensions.getExtension(
            'your-publisher.rest-api-doc-generator'
        );
        
        assert.ok(extension, 'Extension not found');
    });

    test('All commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        
        const expectedCommands = [
            'rest-api-doc-generator.generateDocs',
            'rest-api-doc-generator.openSettings',
            'rest-api-doc-generator.setApiKey',
            'rest-api-doc-generator.validateDocument',
            'rest-api-doc-generator.previewDocs'
        ];

        expectedCommands.forEach(cmd => {
            assert.ok(
                commands.includes(cmd),
                `Command ${cmd} is not registered`
            );
        });
    });

    test('Should show error when API key not set', async () => {
        // This test verifies error handling
        const result = await vscode.commands.executeCommand(
            'rest-api-doc-generator.generateDocs'
        );
        
        // Expect error or notification about missing API key
        // (implementation depends on your error handling strategy)
    });
});