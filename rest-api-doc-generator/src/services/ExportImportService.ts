import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

/**
 * ExportImportService - Handle export & import documentation
 */
export class ExportImportService {
    private workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    /**
     * Export documentation as YAML
     */
    async exportAsYAML(): Promise<void> {
        try {
            const sourcePath = path.join(this.workspaceRoot, 'openapi.yaml');

            if (!fs.existsSync(sourcePath)) {
                throw new Error('No openapi.yaml found. Generate documentation first.');
            }

            // Show save dialog
            const defaultPath = vscode.Uri.file(
                path.join(this.workspaceRoot, 'exported-api-docs.yaml')
            );

            const uri = await vscode.window.showSaveDialog({
                defaultUri: defaultPath,
                filters: {
                    'YAML Files': ['yaml', 'yml']
                },
                title: 'Export OpenAPI Documentation as YAML'
            });

            if (!uri) return;

            // Copy file
            const content = await fs.promises.readFile(sourcePath, 'utf-8');
            await fs.promises.writeFile(uri.fsPath, content, 'utf-8');

            vscode.window.showInformationMessage(`✅ Exported YAML to: ${path.basename(uri.fsPath)}`);

        } catch (error: any) {
            vscode.window.showErrorMessage(`❌ Export YAML failed: ${error.message}`);
        }
    }

    /**
     * Export documentation as JSON
     */
    async exportAsJSON(): Promise<void> {
        try {
            const sourcePath = path.join(this.workspaceRoot, 'openapi.json');

            if (!fs.existsSync(sourcePath)) {
                throw new Error('No openapi.json found. Generate documentation first.');
            }

            const defaultPath = vscode.Uri.file(
                path.join(this.workspaceRoot, 'exported-api-docs.json')
            );

            const uri = await vscode.window.showSaveDialog({
                defaultUri: defaultPath,
                filters: {
                    'JSON Files': ['json']
                },
                title: 'Export OpenAPI Documentation as JSON'
            });

            if (!uri) return;

            const content = await fs.promises.readFile(sourcePath, 'utf-8');
            await fs.promises.writeFile(uri.fsPath, content, 'utf-8');

            vscode.window.showInformationMessage(`✅ Exported JSON to: ${path.basename(uri.fsPath)}`);

        } catch (error: any) {
            vscode.window.showErrorMessage(`❌ Export JSON failed: ${error.message}`);
        }
    }

    /**
     * Export documentation as Markdown
     */
    async exportAsMarkdown(): Promise<void> {
        try {
            const sourcePath = path.join(this.workspaceRoot, 'openapi.json');

            if (!fs.existsSync(sourcePath)) {
                throw new Error('No openapi.json found. Generate documentation first.');
            }

            // Read and parse JSON
            const content = await fs.promises.readFile(sourcePath, 'utf-8');
            const doc = JSON.parse(content);

            // Convert to Markdown
            const markdown = this.convertToMarkdown(doc);

            const defaultPath = vscode.Uri.file(
                path.join(this.workspaceRoot, 'API-Documentation.md')
            );

            const uri = await vscode.window.showSaveDialog({
                defaultUri: defaultPath,
                filters: {
                    'Markdown Files': ['md']
                },
                title: 'Export OpenAPI Documentation as Markdown'
            });

            if (!uri) return;

            await fs.promises.writeFile(uri.fsPath, markdown, 'utf-8');

            // Open the exported markdown
            const doc2 = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc2);

            vscode.window.showInformationMessage(`✅ Exported Markdown to: ${path.basename(uri.fsPath)}`);

        } catch (error: any) {
            vscode.window.showErrorMessage(`❌ Export Markdown failed: ${error.message}`);
        }
    }

    /**
     * Import OpenAPI documentation
     */
    async importDocumentation(): Promise<void> {
        try {
            // Show open dialog
            const uris = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                    'OpenAPI Files': ['yaml', 'yml', 'json'],
                    'All Files': ['*']
                },
                title: 'Import OpenAPI Documentation'
            });

            if (!uris || uris.length === 0) return;

            const importPath = uris[0].fsPath;
            const content = await fs.promises.readFile(importPath, 'utf-8');

            // Parse and validate
            let doc: any;
            if (importPath.endsWith('.yaml') || importPath.endsWith('.yml')) {
                doc = yaml.load(content);
            } else {
                doc = JSON.parse(content);
            }

            // Basic validation
            if (!doc.openapi || !doc.info || !doc.paths) {
                throw new Error('Invalid OpenAPI document. Missing required fields (openapi, info, paths).');
            }

            // Ask user what to do
            const action = await vscode.window.showInformationMessage(
                `📄 Imported file: ${path.basename(importPath)}\n` +
                `📊 API: ${doc.info.title} v${doc.info.version}\n` +
                `📁 Endpoints: ${Object.keys(doc.paths).length} paths`,
                'Replace Current',
                'Save as New',
                'Cancel'
            );

            if (!action || action === 'Cancel') return;

            if (action === 'Replace Current') {
                // Replace existing files
                await this.saveImportedDoc(doc);
                vscode.window.showInformationMessage('✅ Documentation replaced successfully!');

            } else if (action === 'Save as New') {
                // Save with custom name
                const uri = await vscode.window.showSaveDialog({
                    defaultUri: vscode.Uri.file(
                        path.join(this.workspaceRoot, 'imported-api-docs')
                    ),
                    filters: {
                        'YAML': ['yaml'],
                        'JSON': ['json']
                    },
                    title: 'Save Imported Documentation'
                });

                if (uri) {
                    if (uri.fsPath.endsWith('.yaml') || uri.fsPath.endsWith('.yml')) {
                        const yamlContent = yaml.dump(doc, { indent: 2, lineWidth: -1 });
                        await fs.promises.writeFile(uri.fsPath, yamlContent, 'utf-8');
                    } else {
                        await fs.promises.writeFile(uri.fsPath, JSON.stringify(doc, null, 2), 'utf-8');
                    }

                    vscode.window.showInformationMessage(`✅ Saved to: ${path.basename(uri.fsPath)}`);
                }
            }

        } catch (error: any) {
            vscode.window.showErrorMessage(`❌ Import failed: ${error.message}`);
        }
    }

    /**
     * Save imported document to workspace
     */
    private async saveImportedDoc(doc: any): Promise<void> {
        // Save as YAML
        const yamlPath = path.join(this.workspaceRoot, 'openapi.yaml');
        const yamlContent = yaml.dump(doc, { indent: 2, lineWidth: -1 });
        await fs.promises.writeFile(yamlPath, yamlContent, 'utf-8');

        // Save as JSON
        const jsonPath = path.join(this.workspaceRoot, 'openapi.json');
        await fs.promises.writeFile(jsonPath, JSON.stringify(doc, null, 2), 'utf-8');
    }

    /**
     * Convert OpenAPI document to Markdown
     */
    private convertToMarkdown(doc: any): string {
        let md = '';

        // Title & description
        md += `# ${doc.info?.title || 'API Documentation'}\n\n`;
        
        if (doc.info?.description) {
            md += `${doc.info.description}\n\n`;
        }

        md += `**Version:** ${doc.info?.version || '1.0.0'}\n\n`;

        // Servers
        if (doc.servers && doc.servers.length > 0) {
            md += `## 🌐 Servers\n\n`;
            doc.servers.forEach((server: any) => {
                md += `- **${server.description || 'Server'}:** \`${server.url}\`\n`;
            });
            md += '\n';
        }

        // Tags overview
        if (doc.tags && doc.tags.length > 0) {
            md += `## 📂 Tags\n\n`;
            doc.tags.forEach((tag: any) => {
                md += `- **${tag.name}** - ${tag.description || ''}\n`;
            });
            md += '\n';
        }

        // Endpoints
        md += `## 📋 Endpoints\n\n`;

        if (doc.paths) {
            Object.entries(doc.paths).forEach(([pathStr, pathItem]: [string, any]) => {
                const methods = ['get', 'post', 'put', 'delete', 'patch'];

                methods.forEach(method => {
                    if (pathItem[method]) {
                        const operation = pathItem[method];
                        const methodUpper = method.toUpperCase();

                        // Endpoint header
                        md += `### \`${methodUpper}\` ${pathStr}\n\n`;

                        // Summary & description
                        if (operation.summary) {
                            md += `**${operation.summary}**\n\n`;
                        }
                        if (operation.description) {
                            md += `${operation.description}\n\n`;
                        }

                        // Tags
                        if (operation.tags && operation.tags.length > 0) {
                            md += `**Tags:** ${operation.tags.map((t: string) => `\`${t}\``).join(', ')}\n\n`;
                        }

                        // Parameters
                        if (operation.parameters && operation.parameters.length > 0) {
                            md += `#### Parameters\n\n`;
                            md += `| Name | In | Type | Required | Description |\n`;
                            md += `|------|-----|------|----------|-------------|\n`;
                            
                            operation.parameters.forEach((param: any) => {
                                md += `| ${param.name} | ${param.in} | ${param.schema?.type || 'string'} | ${param.required ? '✅' : '❌'} | ${param.description || '-'} |\n`;
                            });
                            md += '\n';
                        }

                        // Request body
                        if (operation.requestBody) {
                            md += `#### Request Body\n\n`;
                            const schema = operation.requestBody.content?.['application/json']?.schema;
                            if (schema?.properties) {
                                md += `| Field | Type | Required | Description |\n`;
                                md += `|-------|------|----------|-------------|\n`;
                                
                                Object.entries(schema.properties).forEach(([name, prop]: [string, any]) => {
                                    const isRequired = schema.required?.includes(name);
                                    md += `| ${name} | ${prop.type || 'string'} | ${isRequired ? '✅' : '❌'} | ${prop.description || '-'} |\n`;
                                });
                                md += '\n';
                            }
                        }

                        // Responses
                        if (operation.responses) {
                            md += `#### Responses\n\n`;
                            
                            Object.entries(operation.responses).forEach(([code, response]: [string, any]) => {
                                md += `**${code}** - ${response.description || ''}\n\n`;
                                
                                const schema = response.content?.['application/json']?.schema;
                                if (schema?.properties) {
                                    md += '```json\n{\n';
                                    Object.entries(schema.properties).forEach(([name, prop]: [string, any]) => {
                                        md += `  "${name}": "${prop.type || 'string'}"\n`;
                                    });
                                    md += '}\n```\n\n';
                                }
                            });
                        }

                        md += '---\n\n';
                    }
                });
            });
        }

        // Footer
        md += `\n---\n*Auto-generated by REST API Doc Generator*\n`;
        md += `*Generated on: ${new Date().toISOString()}*\n`;

        return md;
    }
}