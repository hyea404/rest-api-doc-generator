import * as yaml from 'js-yaml';
import { RouteInfo, HttpMethod } from '../types/RouteInfo';
import { 
    OpenAPIDocument, 
    OpenAPIInfo, 
    OpenAPIPaths, 
    OpenAPIPathItem,
    OpenAPIOperation,
    OpenAPIParameter,
    OpenAPIRequestBody
} from '../types/OpenAPIDocument';

/**
 * OpenAPIGenerator - Generate OpenAPI 3.1 documentation
 */
export class OpenAPIGenerator {
    private document: OpenAPIDocument;

    constructor(
        title: string = 'REST API Documentation',
        version: string = '1.0.0',
        description?: string
    ) {
        // Initialize base OpenAPI document
        this.document = {
            openapi: '3.1.0',
            info: {
                title: title,
                version: version,
                description: description || 'Auto-generated API documentation'
            },
            servers: [
                {
                    url: 'http://localhost:3000',
                    description: 'Development server'
                }
            ],
            paths: {},
            components: {
                schemas: {}
            },
            tags: []
        };
    }

    /**
     * Add routes ke OpenAPI document
     */
    addRoutes(routes: RouteInfo[]): void {
        // Group routes by path
        const routesByPath = this.groupRoutesByPath(routes);

        // Build paths object
        for (const [path, pathRoutes] of routesByPath) {
            const pathItem = this.buildPathItem(pathRoutes);
            this.document.paths[path] = pathItem;
        }

        // Extract and add tags
        this.extractTags(routes);
    }

    /**
     * Add single route with AI-generated documentation - IMPROVED
     */
    addRouteWithAIDoc(route: RouteInfo, aiGeneratedYaml: string): void {
        try {
            // Parse AI-generated YAML
            const aiDoc = yaml.load(aiGeneratedYaml) as any;
            
            // Extract path and operations from AI output
            const pathKey = Object.keys(aiDoc)[0];
            const operations = aiDoc[pathKey];

            // Merge with existing path or create new
            if (!this.document.paths[pathKey]) {
                this.document.paths[pathKey] = {};
            }

            // Add operations
            Object.assign(this.document.paths[pathKey], operations);

            // Extract and add tags from AI-generated doc
            this.extractTagsFromAIDoc(operations);

        } catch (error) {
            console.error('❌ Error parsing AI-generated YAML:', error);
            // Fallback to manual generation
            this.addRoute(route);
        }
    }

    /**
     * Extract tags from AI-generated operations
     */
    private extractTagsFromAIDoc(operations: any): void {
        const existingTags = new Set(this.document.tags?.map(t => t.name) || []);

        // Check each operation for tags
        Object.values(operations).forEach((operation: any) => {
            if (operation.tags && Array.isArray(operation.tags)) {
                operation.tags.forEach((tag: string) => {
                    if (!existingTags.has(tag)) {
                        existingTags.add(tag);
                        this.document.tags?.push({
                            name: tag,
                            description: `${tag} related endpoints`
                        });
                    }
                });
            }
        });
    }

    /**
     * Extract common schemas to components (for reusability)
     */
    extractSchemasToComponents(): void {
        const schemaMap = new Map<string, any>();

        // Scan all paths for response schemas
        Object.values(this.document.paths).forEach((pathItem: any) => {
            Object.values(pathItem).forEach((operation: any) => {
                if (!operation.responses) return;

                Object.values(operation.responses).forEach((response: any) => {
                    if (!response.content) return;

                    Object.values(response.content).forEach((mediaType: any) => {
                        if (mediaType.schema && mediaType.schema.type === 'object') {
                            // Generate schema name from properties
                            const schemaName = this.generateSchemaName(mediaType.schema);
                            
                            if (schemaName && !schemaMap.has(schemaName)) {
                                schemaMap.set(schemaName, mediaType.schema);
                            }
                        }
                    });
                });
            });
        });

        // Add to components
        if (!this.document.components) {
            this.document.components = {};
        }
        if (!this.document.components.schemas) {
            this.document.components.schemas = {};
        }

        schemaMap.forEach((schema, name) => {
            this.document.components!.schemas![name] = schema;
        });
    }

    /**
     * Generate schema name from schema properties
     */
    private generateSchemaName(schema: any): string | null {
        if (!schema.properties) return null;

        const props = Object.keys(schema.properties);
        
        // Common patterns
        if (props.includes('id') && props.includes('name') && props.includes('email')) {
            return 'User';
        }
        if (props.includes('id') && props.includes('name') && props.includes('price')) {
            return 'Product';
        }
        if (props.includes('message')) {
            return 'ErrorResponse';
        }

        return null;
    }

    /**
     * Finalize document - extract schemas and clean up
     */
    finalizeDocument(): void {
        // Extract schemas
        this.extractSchemasToComponents();

        // Ensure tags array exists
        if (!this.document.tags || this.document.tags.length === 0) {
            this.document.tags = [{
                name: 'Default',
                description: 'API endpoints'
            }];
        }
    }



    /**
     * Add single route manually (fallback)
     */
    private addRoute(route: RouteInfo): void {
        const path = this.convertPathToOpenAPI(route.path);
        
        if (!this.document.paths[path]) {
            this.document.paths[path] = {};
        }

        const operation = this.buildOperation(route);
        const method = route.method.toLowerCase() as keyof OpenAPIPathItem;
        
        this.document.paths[path][method] = operation;
    }

    /**
     * Convert Express path to OpenAPI path
     * /users/:id -> /users/{id}
     */
    private convertPathToOpenAPI(expressPath: string): string {
        return expressPath.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{$1}');
    }

    /**
     * Build OpenAPI operation from route info
     */
    private buildOperation(route: RouteInfo): OpenAPIOperation {
        const operation: OpenAPIOperation = {
            summary: this.generateSummary(route),
            description: route.description || `${route.method} operation for ${route.path}`,
            operationId: route.handler !== 'anonymous' && route.handler !== 'inline function' 
                ? route.handler 
                : this.generateOperationId(route),
            tags: this.extractTagsFromPath(route.path),
            parameters: this.buildParameters(route),
            responses: this.buildResponses(route)
        };

        // Add request body for POST, PUT, PATCH
        if (['POST', 'PUT', 'PATCH'].includes(route.method)) {
            const bodyParams = route.parameters.filter(p => p.type === 'body');
            if (bodyParams.length > 0) {
                operation.requestBody = this.buildRequestBody(bodyParams);
            }
        }

        return operation;
    }

    /**
     * Generate summary from route
     */
    private generateSummary(route: RouteInfo): string {
        const action = this.getActionFromMethod(route.method);
        const resource = this.getResourceFromPath(route.path);
        return `${action} ${resource}`;
    }

    /**
     * Get action verb from HTTP method
     */
    private getActionFromMethod(method: HttpMethod): string {
        const actions: { [key in HttpMethod]: string } = {
            GET: 'Get',
            POST: 'Create',
            PUT: 'Update',
            DELETE: 'Delete',
            PATCH: 'Update',
            OPTIONS: 'Options',
            HEAD: 'Head'
        };
        return actions[method];
    }

    /**
     * Extract resource name from path
     */
    private getResourceFromPath(path: string): string {
        // Remove leading slash and get first segment
        const segments = path.replace(/^\//, '').split('/');
        const resource = segments[0] || 'resource';
        
        // Capitalize first letter
        return resource.charAt(0).toUpperCase() + resource.slice(1);
    }

    /**
     * Generate operation ID
     */
    private generateOperationId(route: RouteInfo): string {
        const method = route.method.toLowerCase();
        const resource = this.getResourceFromPath(route.path);
        const hasParam = route.path.includes(':');
        
        if (hasParam) {
            return `${method}${resource}ById`;
        }
        return `${method}${resource}`;
    }

    /**
     * Build parameters array
     */
    private buildParameters(route: RouteInfo): OpenAPIParameter[] {
        const parameters: OpenAPIParameter[] = [];

        // Add path and query parameters
        route.parameters
            .filter(p => p.type === 'path' || p.type === 'query')
            .forEach(param => {
                parameters.push({
                    name: param.name,
                    in: param.type === 'path' ? 'path' : 'query',
                    description: param.description || `${param.name} parameter`,
                    required: param.required,
                    schema: {
                        type: param.dataType || 'string'
                    }
                });
            });

        return parameters;
    }

    /**
     * Build request body for POST/PUT/PATCH
     */
    private buildRequestBody(bodyParams: any[]): OpenAPIRequestBody {
        const properties: any = {};
        const required: string[] = [];

        bodyParams.forEach(param => {
            properties[param.name] = {
                type: param.dataType || 'string',
                description: param.description
            };
            if (param.required) {
                required.push(param.name);
            }
        });

        return {
            description: 'Request body',
            required: required.length > 0,
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: properties,
                        required: required.length > 0 ? required : undefined
                    }
                }
            }
        };
    }

    /**
     * Build responses object
     */
    private buildResponses(route: RouteInfo): any {
        const responses: any = {};

        route.responses.forEach(response => {
            responses[response.statusCode.toString()] = {
                description: response.description,
                content: response.contentType ? {
                    [response.contentType]: {
                        schema: response.schema || {
                            type: 'object',
                            properties: {
                                message: { type: 'string' }
                            }
                        }
                    }
                } : undefined
            };
        });

        // Ensure at least 200 response exists
        if (!responses['200']) {
            responses['200'] = {
                description: 'Successful response',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object'
                        }
                    }
                }
            };
        }

        return responses;
    }

    /**
     * Group routes by path
     */
    private groupRoutesByPath(routes: RouteInfo[]): Map<string, RouteInfo[]> {
        const grouped = new Map<string, RouteInfo[]>();

        routes.forEach(route => {
            const path = this.convertPathToOpenAPI(route.path);
            if (!grouped.has(path)) {
                grouped.set(path, []);
            }
            grouped.get(path)!.push(route);
        });

        return grouped;
    }

    /**
     * Build path item with multiple methods
     */
    private buildPathItem(routes: RouteInfo[]): OpenAPIPathItem {
        const pathItem: OpenAPIPathItem = {};

        routes.forEach(route => {
            const method = route.method.toLowerCase() as keyof OpenAPIPathItem;
            pathItem[method] = this.buildOperation(route);
        });

        return pathItem;
    }

    /**
     * Extract tags from path - IMPROVED
     */
    private extractTagsFromPath(path: string): string[] {
        const segments = path.replace(/^\//, '').split('/');
        
        // Filter out path parameters (yang punya { atau :)
        const nonParamSegments = segments.filter(seg => 
            !seg.startsWith(':') && 
            !seg.startsWith('{') && 
            seg.length > 0
        );
        
        if (nonParamSegments.length === 0) {
            return ['Default'];
        }
        
        const resource = nonParamSegments[0];
        return [resource.charAt(0).toUpperCase() + resource.slice(1)];
    }

    /**
     * Extract and add unique tags - IMPROVED
     */
    private extractTags(routes: RouteInfo[]): void {
        const tagSet = new Set<string>();

        routes.forEach(route => {
            const tags = this.extractTagsFromPath(route.path);
            tags.forEach(tag => {
                // Don't add tags that are just parameter names
                if (tag !== 'Default' && !tag.startsWith(':')) {
                    tagSet.add(tag);
                }
            });
        });

        // Convert to tag objects
        const tagArray = Array.from(tagSet).map(tag => ({
            name: tag,
            description: `${tag} related endpoints`
        }));
        
        // Add Default tag if no other tags exist
        if (tagArray.length === 0) {
            tagArray.push({
                name: 'Default',
                description: 'Default endpoints'
            });
        }

        this.document.tags = tagArray;
    }

    /**
     * Set server URL
     */
    setServer(url: string, description?: string): void {
        this.document.servers = [{
            url: url,
            description: description || 'API Server'
        }];
    }

    /**
     * Set API info
     */
    setInfo(title: string, version: string, description?: string): void {
        this.document.info = {
            title,
            version,
            description: description || 'Auto-generated API documentation'
        };
    }

    /**
     * Get OpenAPI document as object
     */
    getDocument(): OpenAPIDocument {
        return this.document;
    }

    /**
     * Generate YAML output
     */
    toYAML(): string {
        return yaml.dump(this.document, {
            indent: 2,
            lineWidth: -1,
            noRefs: true
        });
    }

    /**
     * Generate JSON output
     */
    toJSON(): string {
        return JSON.stringify(this.document, null, 2);
    }
}