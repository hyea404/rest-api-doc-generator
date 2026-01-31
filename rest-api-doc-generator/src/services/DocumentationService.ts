import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ParserService } from './ParserService';
import { OpenRouterClient } from './OpenRouterClient';
import { OpenAPIGenerator } from '../generators/OpenAPIGenerator';
import { RouteInfo } from '../types/RouteInfo';
import { ValidationService } from './ValidationService';

/**
 * DocumentationService - Orchestrate documentation generation process
 */
export class DocumentationService {
    private parserService: ParserService;
    private aiClient: OpenRouterClient;
    private workspaceRoot: string;

    constructor(workspaceRoot: string, apiKey: string) {
        this.workspaceRoot = workspaceRoot;
        this.parserService = new ParserService(workspaceRoot);
        this.aiClient = new OpenRouterClient(apiKey);
    }

    /**
     * Generate complete OpenAPI documentation
     */
    async generateDocumentation(
        projectName?: string,
        projectVersion?: string
    ): Promise<{ yamlPath: string; jsonPath: string }> {
        try {
            console.log('🚀 Starting documentation generation...');

            // Step 1: Scan and parse routes
            vscode.window.showInformationMessage('📖 Scanning routes...');
            const scanResult = await this.parserService.scanAndParseRoutes();

            if (scanResult.totalRoutes === 0) {
                throw new Error('No routes found to document');
            }

            console.log(`✅ Found ${scanResult.totalRoutes} routes`);

            // Step 2: Create OpenAPI generator
            const generator = new OpenAPIGenerator(
                projectName || 'REST API Documentation',
                projectVersion || '1.0.0',
                'Auto-generated API documentation using AI'
            );

            // Step 3: Generate documentation with AI (with progress)
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Generating API Documentation',
                cancellable: false
            }, async (progress) => {
                const routes = scanResult.routes;
                const totalRoutes = routes.length;

                for (let i = 0; i < totalRoutes; i++) {
                    const route = routes[i];
                    
                    progress.report({
                        message: `Processing route ${i + 1}/${totalRoutes}: ${route.method} ${route.path}`,
                        increment: (100 / totalRoutes)
                    });

                    try {
                        // Generate AI documentation for this route
                        const aiDoc = await this.aiClient.generateDocumentation(route);
                        
                        // Add to generator
                        generator.addRouteWithAIDoc(route, aiDoc);
                        
                        console.log(`✅ Generated docs for: ${route.method} ${route.path}`);
                        
                        // Small delay to avoid rate limiting
                        await this.sleep(500);
                        
                    } catch (error) {
                        console.warn(`⚠️ Failed to generate AI docs for ${route.method} ${route.path}, using fallback`);
                        // Fallback to manual generation happens inside addRouteWithAIDoc
                    }
                }
            });

            // Step 4: Finalize document
            console.log('🔧 Finalizing document...');
            generator.finalizeDocument();

            // Step 5: Set server info (nomor step berubah jadi 5)
            generator.setServer('http://localhost:3000', 'Development server');

            // Step 6: Generate YAML and JSON
            const yamlContent = generator.toYAML();
            const jsonContent = generator.toJSON();

            // Step 7: Validate generated document
            console.log('🔍 Validating generated documentation...');
            const validationService = new ValidationService();
            const validationResult = validationService.validateDocument(generator.getDocument());

            if (!validationResult.isValid) {
                console.warn('⚠️ Validation found errors:', validationResult.errors);
                vscode.window.showWarningMessage(
                    `⚠️ Documentation generated but has ${validationResult.errors.length} validation errors. Check output for details.`
                );
            } else if (validationResult.warnings.length > 0) {
                console.log('ℹ️ Validation warnings:', validationResult.warnings);
            }

            // Step 8: Write to files
            const yamlPath = path.join(this.workspaceRoot, 'openapi.yaml');
            const jsonPath = path.join(this.workspaceRoot, 'openapi.json');

            await fs.promises.writeFile(yamlPath, yamlContent, 'utf-8');
            await fs.promises.writeFile(jsonPath, jsonContent, 'utf-8');

            // Write validation report
            const reportPath = path.join(this.workspaceRoot, 'validation-report.txt');
            const report = validationService.generateReport(validationResult);
            await fs.promises.writeFile(reportPath, report, 'utf-8');

            console.log('✅ Documentation files created');
            console.log('✅ Validation report created');

            return { yamlPath, jsonPath };

        } catch (error) {
            console.error('❌ Documentation generation failed:', error);
            throw error;
        }
    }



    /**
     * Generate documentation for specific file
     */
    async generateForFile(filePath: string): Promise<string> {
        try {
            const routes = await this.parserService.parseFile(filePath);
            
            if (routes.length === 0) {
                throw new Error('No routes found in file');
            }

            const generator = new OpenAPIGenerator();

            // Generate docs for each route
            for (const route of routes) {
                const aiDoc = await this.aiClient.generateDocumentation(route);
                generator.addRouteWithAIDoc(route, aiDoc);
                await this.sleep(500);
            }

            return generator.toYAML();

        } catch (error) {
            console.error('❌ Failed to generate docs for file:', error);
            throw error;
        }
    }

    /**
     * Quick generation without AI (faster, less accurate)
     */
    async generateQuick(): Promise<{ yamlPath: string; jsonPath: string }> {
        try {
            console.log('🚀 Quick generation (no AI)...');

            const scanResult = await this.parserService.scanAndParseRoutes();
            
            if (scanResult.totalRoutes === 0) {
                throw new Error('No routes found');
            }

            const generator = new OpenAPIGenerator(
                'REST API Documentation',
                '1.0.0'
            );

            // Add all routes without AI
            generator.addRoutes(scanResult.routes);

            // ✅ TAMBAHKAN INI - Finalize document
            console.log('🔧 Finalizing document...');
            generator.finalizeDocument();
            
            // Set server info
            generator.setServer('http://localhost:3000');

            // Write files
            const yamlPath = path.join(this.workspaceRoot, 'openapi.yaml');
            const jsonPath = path.join(this.workspaceRoot, 'openapi.json');

            await fs.promises.writeFile(yamlPath, generator.toYAML(), 'utf-8');
            await fs.promises.writeFile(jsonPath, generator.toJSON(), 'utf-8');

            return { yamlPath, jsonPath };

        } catch (error) {
            console.error('❌ Quick generation failed:', error);
            throw error;
        }
    }

    /**
     * Sleep utility
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}