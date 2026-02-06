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

            // Step 3: Generate documentation with AI (with detailed progress)
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Generating API Documentation with AI',
                cancellable: true
            }, async (progress, token) => {
                const routes = scanResult.routes;
                const totalRoutes = routes.length;
                const startTime = Date.now();

                for (let i = 0; i < totalRoutes; i++) {
                    // Check if user cancelled
                    if (token.isCancellationRequested) {
                        throw new Error('Documentation generation cancelled by user');
                    }

                    const route = routes[i];
                    const routeLabel = `${route.method} ${route.path}`;
                    
                    // Calculate progress percentage
                    const percentComplete = Math.floor((i / totalRoutes) * 100);
                    
                    // Estimate time remaining
                    const elapsedMs = Date.now() - startTime;
                    const avgTimePerRoute = elapsedMs / (i + 1);
                    const remainingRoutes = totalRoutes - (i + 1);
                    const estimatedRemainingMs = avgTimePerRoute * remainingRoutes;
                    const estimatedMinutes = Math.ceil(estimatedRemainingMs / 60000);
                    const estimatedSeconds = Math.ceil((estimatedRemainingMs % 60000) / 1000);
                    
                    const timeEstimate = estimatedMinutes > 0 
                        ? `~${estimatedMinutes}m ${estimatedSeconds}s remaining`
                        : `~${estimatedSeconds}s remaining`;

                    progress.report({
                        message: `[${i + 1}/${totalRoutes}] ${routeLabel} | ${percentComplete}% | ${timeEstimate}`,
                        increment: (100 / totalRoutes)
                    });

                    try {
                        // Generate AI documentation for this route
                        const aiDoc = await this.aiClient.generateDocumentation(route);
                        
                        // Add to generator
                        generator.addRouteWithAIDoc(route, aiDoc);
                        
                        console.log(`✅ [${i + 1}/${totalRoutes}] Generated docs for: ${routeLabel}`);
                        
                        // Small delay to avoid rate limiting
                        await this.sleep(500);
                        
                    } catch (error) {
                        console.warn(`⚠️ Failed to generate AI docs for ${routeLabel}, using fallback`);
                        // Fallback to manual generation happens inside addRouteWithAIDoc
                    }
                }

                // Final step
                progress.report({
                    message: 'Finalizing documentation...',
                    increment: 100
                });
            });

            // Step 4: Finalize document
            console.log('🔧 Finalizing document...');
            generator.finalizeDocument();

            // Step 5: Set server info
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
     * Generate documentation for a single changed file (incremental sync)
     */
    async generateForChangedFile(changedFilePath: string): Promise<{ yamlPath: string; jsonPath: string }> {
        try {
            console.log(`🔄 Incremental sync for: ${changedFilePath}`);

            // Step 1: Parse only the changed file
            const changedRoutes = await this.parserService.parseFile(changedFilePath);
            
            if (changedRoutes.length === 0) {
                console.log('ℹ️ No routes in changed file, skipping...');
                // File might have been deleted or has no routes anymore
                // Still need to regenerate full docs to reflect this
                return await this.generateQuick();
            }

            // Step 2: Read existing documentation
            const yamlPath = path.join(this.workspaceRoot, 'openapi.yaml');
            const jsonPath = path.join(this.workspaceRoot, 'openapi.json');

            let existingDoc: any = null;
            if (fs.existsSync(yamlPath)) {
                const yaml = require('js-yaml');
                const yamlContent = await fs.promises.readFile(yamlPath, 'utf-8');
                existingDoc = yaml.load(yamlContent);
            } else if (fs.existsSync(jsonPath)) {
                const jsonContent = await fs.promises.readFile(jsonPath, 'utf-8');
                existingDoc = JSON.parse(jsonContent);
            }

            // Step 3: If no existing doc, do full generation
            if (!existingDoc) {
                console.log('ℹ️ No existing documentation, doing full generation...');
                return await this.generateDocumentation();
            }

            // Step 4: Remove old routes from the changed file
            const pathsToRemove = changedRoutes.map(r => r.path);
            if (existingDoc.paths) {
                pathsToRemove.forEach(path => {
                    delete existingDoc.paths[path];
                });
            }

            // Step 5: Generate AI docs for changed routes only
            console.log(`🤖 Generating AI docs for ${changedRoutes.length} route(s)...`);
            
            for (const route of changedRoutes) {
                try {
                    const aiDoc = await this.aiClient.generateDocumentation(route);
                    
                    // Parse AI response and add to existing doc
                    const yaml = require('js-yaml');
                    const newRouteDoc = yaml.load(aiDoc);
                    
                    if (newRouteDoc && newRouteDoc.paths) {
                        // Merge new route into existing paths
                        if (!existingDoc.paths) {
                            existingDoc.paths = {};
                        }
                        Object.assign(existingDoc.paths, newRouteDoc.paths);
                    }
                    
                    await this.sleep(500); // Rate limiting
                    
                } catch (error) {
                    console.warn(`⚠️ Failed to generate AI docs for ${route.method} ${route.path}`);
                }
            }

            // Step 6: Write updated documentation
            const yaml = require('js-yaml');
            const yamlContent = yaml.dump(existingDoc, { indent: 2, lineWidth: -1 });
            const jsonContent = JSON.stringify(existingDoc, null, 2);

            await fs.promises.writeFile(yamlPath, yamlContent, 'utf-8');
            await fs.promises.writeFile(jsonPath, jsonContent, 'utf-8');

            console.log('✅ Incremental sync completed');
            return { yamlPath, jsonPath };

        } catch (error) {
            console.error('❌ Incremental sync failed:', error);
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