import * as vscode from 'vscode';
import { FileScanner } from '../parsers/FileScanner';
import { RouteParser } from '../parsers/RouteParser';
import { ScanResult, RouteInfo, ScanError } from '../types/RouteInfo';

/**
 * ParserService - Main service untuk coordinate scanning & parsing
 */
export class ParserService {
    private fileScanner: FileScanner;
    private routeParser: RouteParser;

    constructor(workspaceRoot: string) {
        this.fileScanner = new FileScanner(workspaceRoot);
        this.routeParser = new RouteParser();
    }

    /**
     * Scan dan parse semua routes di workspace
     */
    async scanAndParseRoutes(): Promise<ScanResult> {
        const result: ScanResult = {
            routes: [],
            totalFiles: 0,
            totalRoutes: 0,
            errors: []
        };

        try {
            console.log('🚀 Starting scanAndParseRoutes...');
            console.log('📂 Workspace root:', this.fileScanner);
            
            // Step 1: Scan untuk find route files
            console.log('🔍 Scanning for route files...');
            const routeFiles = await this.fileScanner.scanRoutesDirectory();
            
            console.log('📊 Scan complete. Files found:', routeFiles.length);
            console.log('📄 File paths:', routeFiles);
            
            result.totalFiles = routeFiles.length;


            if (routeFiles.length === 0) {
                vscode.window.showWarningMessage('⚠️ No route files found in workspace');
                return result;
            }

            // Step 2: Parse each file
            console.log(`📖 Parsing ${routeFiles.length} files...`);
            
            for (const filePath of routeFiles) {
                try {
                    const content = await this.fileScanner.readFile(filePath);
                    
                    // Check if it's actually a routes file
                    if (!this.fileScanner.isRoutesFile(content)) {
                        continue;
                    }

                    // Parse routes
                    const routes = this.routeParser.parseRoutes(content, filePath);
                    result.routes.push(...routes);

                } catch (error) {
                    const scanError: ScanError = {
                        filePath: filePath,
                        message: `Failed to parse file: ${error}`,
                        error: error as Error
                    };
                    result.errors.push(scanError);
                    console.error(`❌ Error parsing ${filePath}:`, error);
                }
            }

            result.totalRoutes = result.routes.length;

            // Show summary
            vscode.window.showInformationMessage(
                `✅ Found ${result.totalRoutes} routes in ${result.totalFiles} files`
            );

            return result;

        } catch (error) {
            console.error('❌ Error in scanAndParseRoutes:', error);
            vscode.window.showErrorMessage('❌ Failed to scan routes');
            throw error;
        }
    }

    /**
     * Get routes dari specific file
     */
    async parseFile(filePath: string): Promise<RouteInfo[]> {
        try {
            const content = await this.fileScanner.readFile(filePath);
            return this.routeParser.parseRoutes(content, filePath);
        } catch (error) {
            console.error(`❌ Error parsing file ${filePath}:`, error);
            return [];
        }
    }
}