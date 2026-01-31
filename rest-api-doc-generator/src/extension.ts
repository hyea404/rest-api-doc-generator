import * as vscode from 'vscode';
import { SecureStorageService } from './services/SecureStorageService';
import { ParserService } from './services/ParserService';
import { OpenRouterClient } from './services/OpenRouterClient';
import { RouteInfo, HttpMethod } from './types/RouteInfo';
import { DocumentationService } from './services/DocumentationService';
import { ValidationService } from './services/ValidationService';
import * as path from 'path';
import * as fs from 'fs'; 


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
                        // Display method and path
                        outputChannel.appendLine(
                            `  ${route.method.padEnd(7)} ${route.path}`
                        );
                        
                        // Group parameters by type
                        const pathParams = route.parameters.filter(p => p.type === 'path');
                        const queryParams = route.parameters.filter(p => p.type === 'query');
                        const bodyParams = route.parameters.filter(p => p.type === 'body');
                        
                        // Display path parameters
                        if (pathParams.length > 0) {
                            outputChannel.appendLine(
                                `           Path Params: ${pathParams.map(p => p.name).join(', ')}`
                            );
                        }
                        
                        // Display query parameters
                        if (queryParams.length > 0) {
                            outputChannel.appendLine(
                                `           Query Params: ${queryParams.map(p => p.name).join(', ')}`
                            );
                        }
                        
                        // Display body parameters
                        if (bodyParams.length > 0) {
                            outputChannel.appendLine(
                                `           Body Params: ${bodyParams.map(p => p.name).join(', ')}`
                            );
                        }
                        
                        // Display middlewares
                        if (route.middlewares.length > 0) {
                            outputChannel.appendLine(
                                `           Middlewares: ${route.middlewares.map(m => m.name).join(', ')}`
                            );
                        }
                        
                        // Display response status codes
                        if (route.responses && route.responses.length > 0) {
                            const statusCodes = route.responses.map(r => 
                                `${r.statusCode} (${r.description})`
                            ).join(', ');
                            outputChannel.appendLine(
                                `           Responses: ${statusCodes}`
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

    // Command: Test OpenRouter Connection
    let testConnectionCommand = vscode.commands.registerCommand(
        'rest-api-doc-generator.testConnection',
        async () => {
            try {
                // Get API key from storage
                const apiKey = await storageService.getApiKey();
                
                if (!apiKey) {
                    vscode.window.showWarningMessage(
                        '⚠️ API key not set. Please set your OpenRouter API key first.'
                    );
                    return;
                }

                vscode.window.showInformationMessage('🧪 Testing OpenRouter connection...');

                // Create client and test
                const client = new OpenRouterClient(apiKey);
                const isConnected = await client.testConnection();

                if (isConnected) {
                    vscode.window.showInformationMessage(
                        `✅ Connection successful! Model: ${client.getModel()}`
                    );
                } else {
                    vscode.window.showErrorMessage('❌ Connection failed. Please check your API key.');
                }

            } catch (error: any) {
                console.error('❌ Connection test error:', error);
                vscode.window.showErrorMessage(`❌ Connection failed: ${error.message}`);
            }
        }
    );

    // Command: Test Prompt Generation
    let testPromptCommand = vscode.commands.registerCommand(
        'rest-api-doc-generator.testPrompt',
        async () => {
            try {
                // Get API key
                const apiKey = await storageService.getApiKey();
                if (!apiKey) {
                    vscode.window.showWarningMessage('⚠️ API key not set');
                    return;
                }

                vscode.window.showInformationMessage('🧪 Testing prompt generation...');

                // Create sample route untuk testing
                const sampleRoute: RouteInfo = {
                    method: HttpMethod.GET,
                    path: '/users/:id',
                    handler: 'getUserById',
                    parameters: [
                        { name: 'id', type: 'path', required: true, dataType: 'string' }
                    ],
                    responses: [
                        { statusCode: 200, description: 'Success', contentType: 'application/json' },
                        { statusCode: 404, description: 'Not Found', contentType: 'application/json' }
                    ],
                    middlewares: [],
                    filePath: 'test.js'
                };

                // Generate documentation
                const client = new OpenRouterClient(apiKey);
                const yaml = await client.generateDocumentation(sampleRoute);

                // Show result in output channel
                const outputChannel = vscode.window.createOutputChannel('Prompt Test Result');
                outputChannel.clear();
                outputChannel.appendLine('='.repeat(60));
                outputChannel.appendLine('GENERATED OPENAPI DOCUMENTATION');
                outputChannel.appendLine('='.repeat(60));
                outputChannel.appendLine(yaml);
                outputChannel.show();

                vscode.window.showInformationMessage('✅ Prompt test successful! Check output panel.');

            } catch (error: any) {
                console.error('❌ Test prompt error:', error);
                vscode.window.showErrorMessage(`❌ Test failed: ${error.message}`);
            }
        }
    );

    // Command: List Available Models
    let listModelsCommand = vscode.commands.registerCommand(
        'rest-api-doc-generator.listModels',
        async () => {
            try {
                const apiKey = await storageService.getApiKey();
                if (!apiKey) {
                    vscode.window.showWarningMessage('⚠️ API key not set');
                    return;
                }

                vscode.window.showInformationMessage('🔍 Fetching available models...');

                const client = new OpenRouterClient(apiKey);
                const models = await client.getAvailableModels();

                // Filter untuk Gemma models
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
                vscode.window.showInformationMessage('✅ Models list loaded');

            } catch (error: any) {
                console.error('❌ List models error:', error);
                vscode.window.showErrorMessage(`❌ Failed: ${error.message}`);
            }
        }
    );

    // Command: Generate API Documentation (Full with AI)
    let generateDocsCommand = vscode.commands.registerCommand(
        'rest-api-doc-generator.generateDocs',
        async () => {
            try {
                // Check workspace
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders || workspaceFolders.length === 0) {
                    vscode.window.showErrorMessage('❌ No workspace folder open');
                    return;
                }

                // Get API key
                const apiKey = await storageService.getApiKey();
                if (!apiKey) {
                    vscode.window.showWarningMessage(
                        '⚠️ API key not set. Please set your OpenRouter API key first.'
                    );
                    return;
                }

                const workspaceRoot = workspaceFolders[0].uri.fsPath;

                // Ask for project info
                const projectName = await vscode.window.showInputBox({
                    prompt: 'Enter API project name',
                    placeHolder: 'My REST API',
                    value: 'REST API Documentation'
                });

                if (!projectName) {
                    return;
                }

                const projectVersion = await vscode.window.showInputBox({
                    prompt: 'Enter API version',
                    placeHolder: '1.0.0',
                    value: '1.0.0'
                });

                if (!projectVersion) {
                    return;
                }

                // Create documentation service
                const docService = new DocumentationService(workspaceRoot, apiKey);

                // Generate documentation
                vscode.window.showInformationMessage('🤖 Generating documentation with AI...');
                
                const result = await docService.generateDocumentation(
                    projectName,
                    projectVersion
                );

                // Show success message
                const openYaml = await vscode.window.showInformationMessage(
                    `✅ Documentation generated successfully!\n\nFiles:\n- ${path.basename(result.yamlPath)}\n- ${path.basename(result.jsonPath)}`,
                    'Open YAML',
                    'Open JSON'
                );

                // Open file if user clicks button
                if (openYaml === 'Open YAML') {
                    const doc = await vscode.workspace.openTextDocument(result.yamlPath);
                    await vscode.window.showTextDocument(doc);
                } else if (openYaml === 'Open JSON') {
                    const doc = await vscode.workspace.openTextDocument(result.jsonPath);
                    await vscode.window.showTextDocument(doc);
                }

            } catch (error: any) {
                console.error('❌ Generate docs error:', error);
                vscode.window.showErrorMessage(`❌ Failed to generate documentation: ${error.message}`);
            }
        }
    );

    // Command: Generate API Documentation (Quick without AI)
    let generateDocsQuickCommand = vscode.commands.registerCommand(
        'rest-api-doc-generator.generateDocsQuick',
        async () => {
            try {
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders || workspaceFolders.length === 0) {
                    vscode.window.showErrorMessage('❌ No workspace folder open');
                    return;
                }

                const workspaceRoot = workspaceFolders[0].uri.fsPath;

                // Get API key (still needed for service initialization)
                const apiKey = await storageService.getApiKey();
                if (!apiKey) {
                    // Create dummy service for quick generation
                    vscode.window.showWarningMessage('⚠️ Generating without AI (basic documentation)');
                }

                const docService = new DocumentationService(
                    workspaceRoot, 
                    apiKey || 'dummy-key'
                );

                vscode.window.showInformationMessage('⚡ Quick generating documentation...');

                const result = await docService.generateQuick();

                const openFile = await vscode.window.showInformationMessage(
                    `✅ Quick documentation generated!\n\nFiles:\n- ${path.basename(result.yamlPath)}\n- ${path.basename(result.jsonPath)}`,
                    'Open YAML',
                    'Open JSON'
                );

                if (openFile === 'Open YAML') {
                    const doc = await vscode.workspace.openTextDocument(result.yamlPath);
                    await vscode.window.showTextDocument(doc);
                } else if (openFile === 'Open JSON') {
                    const doc = await vscode.workspace.openTextDocument(result.jsonPath);
                    await vscode.window.showTextDocument(doc);
                }

            } catch (error: any) {
                console.error('❌ Quick generate error:', error);
                vscode.window.showErrorMessage(`❌ Failed: ${error.message}`);
            }
        }
    );

    // Command: Validate OpenAPI Document
    let validateDocsCommand = vscode.commands.registerCommand(
        'rest-api-doc-generator.validateDocs',
        async () => {
            try {
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders || workspaceFolders.length === 0) {
                    vscode.window.showErrorMessage('❌ No workspace folder open');
                    return;
                }

                const workspaceRoot = workspaceFolders[0].uri.fsPath;

                // Ask user which file to validate
                const fileChoice = await vscode.window.showQuickPick(
                    ['openapi.yaml', 'openapi.json'],
                    {
                        placeHolder: 'Select file to validate'
                    }
                );

                if (!fileChoice) {
                    return;
                }

                const filePath = path.join(workspaceRoot, fileChoice);

                // Check if file exists
                if (!fs.existsSync(filePath)) {
                    vscode.window.showErrorMessage(`❌ File not found: ${fileChoice}`);
                    return;
                }

                vscode.window.showInformationMessage('🔍 Validating OpenAPI document...');

                // Validate
                const validationService = new ValidationService();
                const result = await validationService.validateFile(filePath);

                // Generate and show report
                const report = validationService.generateReport(result);
                
                const outputChannel = vscode.window.createOutputChannel('OpenAPI Validation');
                outputChannel.clear();
                outputChannel.appendLine(report);
                outputChannel.show();

                // Show message
                if (result.isValid) {
                    if (result.warnings.length > 0) {
                        vscode.window.showInformationMessage(
                            `✅ Document is valid with ${result.warnings.length} warning(s). Check output for details.`
                        );
                    } else {
                        vscode.window.showInformationMessage('✅ Document is perfectly valid!');
                    }
                } else {
                    vscode.window.showErrorMessage(
                        `❌ Validation failed with ${result.errors.length} error(s). Check output for details.`
                    );
                }

            } catch (error: any) {
                console.error('❌ Validation error:', error);
                vscode.window.showErrorMessage(`❌ Validation failed: ${error.message}`);
            }
        }
    );


    context.subscriptions.push(setApiKeyCommand, checkApiKeyCommand, deleteApiKeyCommand, scanRoutesCommand, testConnectionCommand, testPromptCommand,listModelsCommand, generateDocsCommand, generateDocsQuickCommand, validateDocsCommand);
}

export function deactivate() {
    console.log('👋 REST API Doc Generator deactivated');
}

// Export storage service untuk digunakan di module lain
export function getStorageService(): SecureStorageService {
    return storageService;
}