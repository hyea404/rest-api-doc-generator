import OpenAPISchemaValidator from 'openapi-schema-validator';
import * as yaml from 'js-yaml';
import * as fs from 'fs';

/**
 * Validation result interface
 */
export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}

export interface ValidationError {
    message: string;
    path?: string;
    keyword?: string;
}

export interface ValidationWarning {
    message: string;
    path?: string;
    suggestion?: string;
}

/**
 * ValidationService - Validate OpenAPI documents
 */
export class ValidationService {
    private validator: OpenAPISchemaValidator;

    constructor() {
        // Initialize validator for OpenAPI 3.1
        this.validator = new OpenAPISchemaValidator({
            version: 3
        });
    }

    /**
     * Validate OpenAPI document from object
     */
    validateDocument(document: any): ValidationResult {
        const result: ValidationResult = {
            isValid: true,
            errors: [],
            warnings: []
        };

        try {
            console.log('🔍 Validating OpenAPI document...');

            // Validate against OpenAPI schema
            const validationResult = this.validator.validate(document);

            if (validationResult.errors && validationResult.errors.length > 0) {
                result.isValid = false;
                result.errors = validationResult.errors.map((error: any) => ({
                    message: error.message || 'Validation error',
                    path: error.instancePath || error.dataPath,
                    keyword: error.keyword
                }));
            }

            // Additional custom validations
            this.performCustomValidations(document, result);

            if (result.isValid && result.errors.length === 0) {
                console.log('✅ Document is valid!');
            } else {
                console.warn(`⚠️ Found ${result.errors.length} errors and ${result.warnings.length} warnings`);
            }

            return result;

        } catch (error) {
            console.error('❌ Validation failed:', error);
            result.isValid = false;
            result.errors.push({
                message: `Validation exception: ${error}`
            });
            return result;
        }
    }

    /**
     * Validate OpenAPI file (YAML or JSON)
     */
    async validateFile(filePath: string): Promise<ValidationResult> {
        try {
            console.log(`🔍 Validating file: ${filePath}`);

            // Read file
            const content = await fs.promises.readFile(filePath, 'utf-8');

            // Parse based on extension
            let document: any;
            if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
                document = yaml.load(content);
            } else if (filePath.endsWith('.json')) {
                document = JSON.parse(content);
            } else {
                throw new Error('Unsupported file format. Use .yaml, .yml, or .json');
            }

            // Validate
            return this.validateDocument(document);

        } catch (error) {
            console.error('❌ File validation failed:', error);
            return {
                isValid: false,
                errors: [{
                    message: `Failed to validate file: ${error}`
                }],
                warnings: []
            };
        }
    }

    /**
     * Perform custom validations
     */
    private performCustomValidations(document: any, result: ValidationResult): void {
        // Check OpenAPI version
        if (!document.openapi || !document.openapi.startsWith('3.')) {
            result.warnings.push({
                message: 'OpenAPI version should be 3.x',
                path: '/openapi'
            });
        }

        // Check required fields
        if (!document.info) {
            result.errors.push({
                message: 'Missing required field: info',
                path: '/info'
            });
            result.isValid = false;
        }

        if (!document.paths || Object.keys(document.paths).length === 0) {
            result.warnings.push({
                message: 'No paths defined in the document',
                path: '/paths',
                suggestion: 'Add at least one API endpoint'
            });
        }

        // Validate info section
        if (document.info) {
            if (!document.info.title) {
                result.errors.push({
                    message: 'Missing required field: info.title',
                    path: '/info/title'
                });
                result.isValid = false;
            }

            if (!document.info.version) {
                result.errors.push({
                    message: 'Missing required field: info.version',
                    path: '/info/version'
                });
                result.isValid = false;
            }
        }

        // Validate paths
        if (document.paths) {
            this.validatePaths(document.paths, result);
        }

        // Check for empty tags
        if (document.tags && document.tags.length === 0) {
            result.warnings.push({
                message: 'Tags array is empty',
                path: '/tags',
                suggestion: 'Add tags to organize your API endpoints'
            });
        }

        // Check for empty components
        if (document.components?.schemas && 
            Object.keys(document.components.schemas).length === 0) {
            result.warnings.push({
                message: 'No reusable schemas defined in components',
                path: '/components/schemas',
                suggestion: 'Consider extracting common schemas to components for reusability'
            });
        }
    }

    /**
     * Validate paths section
     */
    private validatePaths(paths: any, result: ValidationResult): void {
        Object.entries(paths).forEach(([path, pathItem]: [string, any]) => {
            // Check if path starts with /
            if (!path.startsWith('/')) {
                result.warnings.push({
                    message: `Path should start with /: ${path}`,
                    path: `/paths/${path}`
                });
            }

            // Validate operations
            const methods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];
            methods.forEach(method => {
                if (pathItem[method]) {
                    this.validateOperation(pathItem[method], `${path}.${method}`, result);
                }
            });
        });
    }

    /**
     * Validate operation
     */
    private validateOperation(operation: any, operationPath: string, result: ValidationResult): void {
        // Check for summary or description
        if (!operation.summary && !operation.description) {
            result.warnings.push({
                message: `Operation should have summary or description: ${operationPath}`,
                path: `/paths/${operationPath}`,
                suggestion: 'Add summary or description to document the endpoint'
            });
        }

        // Check for responses
        if (!operation.responses || Object.keys(operation.responses).length === 0) {
            result.errors.push({
                message: `Operation must have at least one response: ${operationPath}`,
                path: `/paths/${operationPath}/responses`
            });
            result.isValid = false;
        }

        // Check for 2xx response
        if (operation.responses) {
            const has2xx = Object.keys(operation.responses).some(code => 
                code.startsWith('2') || code === 'default'
            );

            if (!has2xx) {
                result.warnings.push({
                    message: `Operation should have at least one success response (2xx): ${operationPath}`,
                    path: `/paths/${operationPath}/responses`,
                    suggestion: 'Add a 200 or 201 response'
                });
            }
        }

        // Validate parameters
        if (operation.parameters) {
            operation.parameters.forEach((param: any, index: number) => {
                if (!param.name) {
                    result.errors.push({
                        message: `Parameter missing name: ${operationPath}`,
                        path: `/paths/${operationPath}/parameters/${index}`
                    });
                    result.isValid = false;
                }

                if (!param.in) {
                    result.errors.push({
                        message: `Parameter missing 'in' field: ${operationPath}`,
                        path: `/paths/${operationPath}/parameters/${index}`
                    });
                    result.isValid = false;
                }

                if (!param.schema && !param.content) {
                    result.errors.push({
                        message: `Parameter must have schema or content: ${operationPath}`,
                        path: `/paths/${operationPath}/parameters/${index}`
                    });
                    result.isValid = false;
                }
            });
        }
    }

    /**
     * Generate validation report
     */
    generateReport(result: ValidationResult): string {
        let report = '='.repeat(60) + '\n';
        report += 'OPENAPI VALIDATION REPORT\n';
        report += '='.repeat(60) + '\n\n';

        if (result.isValid) {
            report += '✅ Status: VALID\n\n';
        } else {
            report += '❌ Status: INVALID\n\n';
        }

        // Errors section
        if (result.errors.length > 0) {
            report += `ERRORS (${result.errors.length}):\n`;
            report += '-'.repeat(60) + '\n';
            result.errors.forEach((error, index) => {
                report += `${index + 1}. ${error.message}\n`;
                if (error.path) {
                    report += `   Path: ${error.path}\n`;
                }
                if (error.keyword) {
                    report += `   Keyword: ${error.keyword}\n`;
                }
                report += '\n';
            });
        }

        // Warnings section
        if (result.warnings.length > 0) {
            report += `WARNINGS (${result.warnings.length}):\n`;
            report += '-'.repeat(60) + '\n';
            result.warnings.forEach((warning, index) => {
                report += `${index + 1}. ${warning.message}\n`;
                if (warning.path) {
                    report += `   Path: ${warning.path}\n`;
                }
                if (warning.suggestion) {
                    report += `   💡 Suggestion: ${warning.suggestion}\n`;
                }
                report += '\n';
            });
        }

        if (result.errors.length === 0 && result.warnings.length === 0) {
            report += '🎉 No errors or warnings found!\n';
            report += 'Your OpenAPI document is perfectly valid.\n';
        }

        report += '='.repeat(60) + '\n';
        return report;
    }
}