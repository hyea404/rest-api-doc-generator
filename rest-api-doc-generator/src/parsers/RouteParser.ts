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
                CallExpression: (path) => {
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

            // Extract parameters dari path (e.g., /users/:id)
            const parameters = this.extractPathParameters(routePath);

            // Extract handler name (last argument is usually the handler)
            const handlerArg = node.arguments[node.arguments.length - 1];
            let handlerName = 'anonymous';
            
            if (t.isIdentifier(handlerArg)) {
                handlerName = handlerArg.name;
            } else if (t.isFunctionExpression(handlerArg) || t.isArrowFunctionExpression(handlerArg)) {
                handlerName = 'inline function';
            }

            // Extract middlewares (arguments between path and handler)
            const middlewareArgs = node.arguments.slice(1, -1);
            const middlewares = this.extractMiddlewares(middlewareArgs);


            const route: RouteInfo = {
                method: method as HttpMethod,
                path: routePath,
                handler: handlerName,
                parameters: parameters,
                responses: [
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
}