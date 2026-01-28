import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * FileScanner - Scan workspace untuk menemukan file routes
 */
export class FileScanner {
    private workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    /**
     * Scan direktori untuk menemukan file routes
     */
    async scanRoutesDirectory(): Promise<string[]> {
    const routeFiles: string[] = [];
    
    console.log('🔍 Starting scan from workspace:', this.workspaceRoot);
    
    // Common patterns untuk routes folder
    const routePatterns = [
        'routes/**/*.js',
        'routes/**/*.ts',
        'src/routes/**/*.js',
        'src/routes/**/*.ts',
        'app/routes/**/*.js',
        'app/routes/**/*.ts',
        'server/routes/**/*.js',
        'server/routes/**/*.ts',
        'sample-express-project/routes/**/*.js',  // ADD THIS LINE
        'sample-express-project/routes/**/*.ts',  // ADD THIS LINE
    ];

    try {
        for (const pattern of routePatterns) {
            console.log(`🔎 Searching pattern: ${pattern}`);
            
            const files = await vscode.workspace.findFiles(
                pattern,
                '**/node_modules/**'
            );
            
            console.log(`   Found ${files.length} files for pattern: ${pattern}`);
            
            routeFiles.push(...files.map(uri => uri.fsPath));
        }

        console.log(`📁 Total found ${routeFiles.length} route files`);
        console.log(`📁 Files:`, routeFiles);
        
        return [...new Set(routeFiles)]; // Remove duplicates
        } catch (error) {
            console.error('❌ Error scanning routes directory:', error);
            throw error;
        }
    }


    /**
     * Read file content
     */
    async readFile(filePath: string): Promise<string> {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            return content;
        } catch (error) {
            console.error(`❌ Error reading file ${filePath}:`, error);
            throw error;
        }
    }

    /**
     * Check if file is a routes file based on content
     */
    isRoutesFile(content: string): boolean {
        // Check for common Express patterns
        const patterns = [
            /express\.Router\(\)/,
            /router\.(get|post|put|delete|patch)/i,
            /app\.(get|post|put|delete|patch)/i,
            /require\(['"]express['"]\)/,
            /from ['"]express['"]/,
        ];

        return patterns.some(pattern => pattern.test(content));
    }

    /**
     * Get relative path from workspace root
     */
    getRelativePath(filePath: string): string {
        return path.relative(this.workspaceRoot, filePath);
    }
}