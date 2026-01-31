import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { RouteInfo, HttpMethod, RouteParameter, RouteResponse, MiddlewareInfo } from '../types/RouteInfo';

/**
 * RouteParser - Parse Express.js code untuk extract route information
 */
export class RouteParser {
    
    /**
     * Parse file content untuk extract routes
     */
    parseRoutes(content: string, filePath: string): RouteInfo[] {
        const routes: RouteInfo[] = [];

        try {
            // Parse code menjadi AST (Abstract Syntax Tree)
            const ast = parser.parse(content, {
                sourceType: 'module',
                plugins: ['typescript', 'jsx']
            });

            // Traverse AST untuk find route definitions
            traverse(ast, {
                // Detect: router.get(), router.post(), dll
                CallExpression: (path: any) => {
                    const node = path.node;
                    
                    // Check if it's a router/app method call
                    if (
                        t.isMemberExpression(node.callee) &&
                        t.isIdentifier(node.callee.object) &&
                        (node.callee.object.name === 'router' || 
                         node.callee.object.name === 'app') &&
                        t.isIdentifier(node.callee.property)
                    ) {
                        const method = node.callee.property.name.toUpperCase();
                        
                        // Check if it's a valid HTTP method
                        if (this.isValidHttpMethod(method)) {
                            const route = this.extractRouteInfo(node, method, filePath);
                            if (route) {
                                routes.push(route);
                            }
                        }
                    }
                }
            });

            console.log(`✅ Parsed ${routes.length} routes from ${filePath}`);
            return routes;

        } catch (error) {
            console.error(`❌ Error parsing ${filePath}:`, error);
            return [];
        }
    }

    /**
     * Extract route information dari CallExpression node
     */
    private extractRouteInfo(
    node: t.CallExpression, 
    method: string, 
    filePath: string
    ): RouteInfo | null {
        try {
            // First argument should be the path (string)
            const pathArg = node.arguments[0];
            if (!t.isStringLiteral(pathArg)) {
                return null;
            }

            const routePath = pathArg.value;

            // Extract path parameters dari route path
            const pathParameters = this.extractPathParameters(routePath);

            // Extract handler (last argument)
            const handlerArg = node.arguments[node.arguments.length - 1];
            let handlerName = 'anonymous';
            let queryParams: RouteParameter[] = [];
            let bodyParams: RouteParameter[] = [];
            let responses: RouteResponse[] = [];
            
            if (t.isIdentifier(handlerArg)) {
                handlerName = handlerArg.name;
            } else if (t.isFunctionExpression(handlerArg) || t.isArrowFunctionExpression(handlerArg)) {
                handlerName = 'inline function';
                
                // Extract from inline function
                queryParams = this.extractQueryParameters(handlerArg);
                bodyParams = this.extractBodyParameters(handlerArg);
                responses = this.extractResponseInfo(handlerArg);
            }

            // Extract middlewares
            const middlewareArgs = node.arguments.slice(1, -1);
            const middlewares = this.extractMiddlewares(middlewareArgs);

            // Combine all parameters
            const allParameters = [...pathParameters, ...queryParams, ...bodyParams];

            const route: RouteInfo = {
                method: method as HttpMethod,
                path: routePath,
                handler: handlerName,
                parameters: allParameters,
                responses: responses.length > 0 ? responses : [
                    {
                        statusCode: 200,
                        description: 'Success',
                        contentType: 'application/json'
                    }
                ],
                middlewares: middlewares,
                filePath: filePath,
                lineNumber: node.loc?.start.line
            };

            return route;

        } catch (error) {
            console.error('❌ Error extracting route info:', error);
            return null;
        }
    }

    /**
     * Extract path parameters dari route path
     */
    private extractPathParameters(routePath: string): RouteParameter[] {
        const parameters: RouteParameter[] = [];
        
        // Regex untuk match :paramName atau :paramName?
        const paramRegex = /:([a-zA-Z_][a-zA-Z0-9_]*)\??/g;
        let match;

        while ((match = paramRegex.exec(routePath)) !== null) {
            const paramName = match[1];
            const isOptional = match[0].endsWith('?');

            parameters.push({
                name: paramName,
                type: 'path',
                required: !isOptional,
                dataType: 'string'
            });
        }

        return parameters;
    }

    /**
     * Extract middleware information
     */
    private extractMiddlewares(middlewareArgs: (t.Expression | t.SpreadElement | t.ArgumentPlaceholder)[]): MiddlewareInfo[] {
        const middlewares: MiddlewareInfo[] = [];

        for (const arg of middlewareArgs) {
            // Filter hanya Expression types (bukan SpreadElement atau ArgumentPlaceholder)
            if (t.isExpression(arg) && t.isIdentifier(arg)) {
                middlewares.push({
                    name: arg.name,
                    type: this.guessMiddlewareType(arg.name)
                });
            }
        }

        return middlewares;
    }


    /**
     * Guess middleware type berdasarkan nama
     */
    private guessMiddlewareType(name: string): 'auth' | 'validation' | 'custom' {
        const lowerName = name.toLowerCase();
        
        if (lowerName.includes('auth') || lowerName.includes('verify')) {
            return 'auth';
        }
        if (lowerName.includes('valid') || lowerName.includes('check')) {
            return 'validation';
        }
        return 'custom';
    }

    /**
     * Check if method is valid HTTP method
     */
    private isValidHttpMethod(method: string): boolean {
        const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];
        return validMethods.includes(method);
    }

    /**
     * Extract query parameters dari handler function
     * Mencari pattern: req.query.xxx
     */
    private extractQueryParameters(handlerNode: t.Node): RouteParameter[] {
        const queryParams: RouteParameter[] = [];
        const foundParams = new Set<string>();

        // Manual recursive traversal instead of using traverse()
        const visitNode = (node: any) => {
            if (!node || typeof node !== 'object') return;

            // Check for: req.query.paramName
            if (
                node.type === 'MemberExpression' &&
                node.object?.type === 'MemberExpression' &&
                node.object?.object?.type === 'Identifier' &&
                node.object?.object?.name === 'req' &&
                node.object?.property?.type === 'Identifier' &&
                node.object?.property?.name === 'query' &&
                node.property?.type === 'Identifier'
            ) {
                const paramName = node.property.name;
                
                if (!foundParams.has(paramName)) {
                    foundParams.add(paramName);
                    queryParams.push({
                        name: paramName,
                        type: 'query',
                        required: false,
                        dataType: 'string'
                    });
                }
            }

            // Recursively visit all properties
            for (const key in node) {
                if (node.hasOwnProperty(key)) {
                    const child = node[key];
                    if (Array.isArray(child)) {
                        child.forEach(visitNode);
                    } else if (typeof child === 'object') {
                        visitNode(child);
                    }
                }
            }
        };

        visitNode(handlerNode);
        return queryParams;
    }

    /**
     * Extract body parameters dari handler function
     * Mencari pattern: req.body.xxx atau destructuring
     */
    private extractBodyParameters(handlerNode: t.Node): RouteParameter[] {
        const bodyParams: RouteParameter[] = [];
        const foundParams = new Set<string>();

        const visitNode = (node: any) => {
            if (!node || typeof node !== 'object') return;

            // Pattern: const { name, email } = req.body
            if (
                node.type === 'VariableDeclarator' &&
                node.id?.type === 'ObjectPattern' &&
                node.init?.type === 'MemberExpression' &&
                node.init?.object?.type === 'Identifier' &&
                node.init?.object?.name === 'req' &&
                node.init?.property?.type === 'Identifier' &&
                node.init?.property?.name === 'body'
            ) {
                // Extract destructured properties
                node.id.properties?.forEach((prop: any) => {
                    if (prop.type === 'ObjectProperty' && prop.key?.type === 'Identifier') {
                        const paramName = prop.key.name;
                        
                        if (!foundParams.has(paramName)) {
                            foundParams.add(paramName);
                            bodyParams.push({
                                name: paramName,
                                type: 'body',
                                required: true,
                                dataType: 'string'
                            });
                        }
                    }
                });
            }

            // Pattern: req.body.name
            if (
                node.type === 'MemberExpression' &&
                node.object?.type === 'MemberExpression' &&
                node.object?.object?.type === 'Identifier' &&
                node.object?.object?.name === 'req' &&
                node.object?.property?.type === 'Identifier' &&
                node.object?.property?.name === 'body' &&
                node.property?.type === 'Identifier'
            ) {
                const paramName = node.property.name;
                
                if (!foundParams.has(paramName)) {
                    foundParams.add(paramName);
                    bodyParams.push({
                        name: paramName,
                        type: 'body',
                        required: false,
                        dataType: 'string'
                    });
                }
            }

            // Recursively visit all properties
            for (const key in node) {
                if (node.hasOwnProperty(key)) {
                    const child = node[key];
                    if (Array.isArray(child)) {
                        child.forEach(visitNode);
                    } else if (typeof child === 'object') {
                        visitNode(child);
                    }
                }
            }
        };

        visitNode(handlerNode);
        return bodyParams;
    }

    /**
     * Extract response information dari handler
     * Mencari pattern: res.status().json(), res.send(), dll
     */
    private extractResponseInfo(handlerNode: t.Node): RouteResponse[] {
        const responses: RouteResponse[] = [];
        const foundStatuses = new Set<number>();

        const visitNode = (node: any) => {
            if (!node || typeof node !== 'object') return;

            // Pattern: res.status(200).json(...)
            if (
                node.type === 'CallExpression' &&
                node.callee?.type === 'MemberExpression' &&
                node.callee?.object?.type === 'CallExpression' &&
                node.callee?.object?.callee?.type === 'MemberExpression'
            ) {
                const statusCall = node.callee.object;
                const statusCallProperty = statusCall.callee?.property;
                
                if (statusCallProperty?.name === 'status') {
                    // Get status code
                    const statusArg = statusCall.arguments?.[0];
                    if (statusArg?.type === 'NumericLiteral') {
                        const statusCode = statusArg.value;
                        
                        if (!foundStatuses.has(statusCode)) {
                            foundStatuses.add(statusCode);
                            
                            // Get response method (json, send, etc)
                            const responseMethod = node.callee.property;
                            let contentType = 'application/json';
                            
                            if (responseMethod?.name === 'json') {
                                contentType = 'application/json';
                            } else if (responseMethod?.name === 'send') {
                                contentType = 'text/plain';
                            }

                            responses.push({
                                statusCode: statusCode,
                                description: this.getStatusDescription(statusCode),
                                contentType: contentType,
                                schema: this.extractResponseSchema(node.arguments?.[0])
                            });
                        }
                    }
                }
            }
            
            // Pattern: res.json(...) without explicit status
            if (
                node.type === 'CallExpression' &&
                node.callee?.type === 'MemberExpression' &&
                node.callee?.object?.type === 'Identifier' &&
                node.callee?.object?.name === 'res' &&
                node.callee?.property?.type === 'Identifier'
            ) {
                const method = node.callee.property.name;
                
                if ((method === 'json' || method === 'send') && !foundStatuses.has(200)) {
                    foundStatuses.add(200);
                    responses.push({
                        statusCode: 200,
                        description: 'Success',
                        contentType: method === 'json' ? 'application/json' : 'text/plain',
                        schema: this.extractResponseSchema(node.arguments?.[0])
                    });
                }
            }

            // Recursively visit all properties
            for (const key in node) {
                if (node.hasOwnProperty(key)) {
                    const child = node[key];
                    if (Array.isArray(child)) {
                        child.forEach(visitNode);
                    } else if (typeof child === 'object') {
                        visitNode(child);
                    }
                }
            }
        };

        visitNode(handlerNode);

        return responses.length > 0 ? responses : [{
            statusCode: 200,
            description: 'Success',
            contentType: 'application/json'
        }];
    }

    /**
     * Extract schema dari response data
     */
    private extractResponseSchema(arg: any): any {
        if (!arg) return undefined;

        try {
            // Object literal: { users: [], total: 0 }
            if (arg.type === 'ObjectExpression') {
                const schema: any = { type: 'object', properties: {} };
                
                arg.properties?.forEach((prop: any) => {
                    if (prop.type === 'ObjectProperty' && prop.key?.type === 'Identifier') {
                        const key = prop.key.name;
                        const value = prop.value;
                        
                        // Infer type from value
                        if (value?.type === 'ArrayExpression') {
                            schema.properties[key] = { type: 'array' };
                        } else if (value?.type === 'NumericLiteral') {
                            schema.properties[key] = { type: 'number' };
                        } else if (value?.type === 'StringLiteral') {
                            schema.properties[key] = { type: 'string' };
                        } else if (value?.type === 'BooleanLiteral') {
                            schema.properties[key] = { type: 'boolean' };
                        } else {
                            schema.properties[key] = { type: 'unknown' };
                        }
                    }
                });
                
                return schema;
            }
            
            // Array literal: [...]
            if (arg.type === 'ArrayExpression') {
                return { type: 'array', items: { type: 'object' } };
            }
            
        } catch (error) {
            console.warn('Could not extract response schema:', error);
        }

        return undefined;
    }

    /**
     * Get status code description
     */
    private getStatusDescription(statusCode: number): string {
        const descriptions: { [key: number]: string } = {
            200: 'Success',
            201: 'Created',
            204: 'No Content',
            400: 'Bad Request',
            401: 'Unauthorized',
            403: 'Forbidden',
            404: 'Not Found',
            500: 'Internal Server Error'
        };
        
        return descriptions[statusCode] || 'Unknown';
    }

}