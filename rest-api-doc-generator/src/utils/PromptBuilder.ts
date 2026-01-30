import { RouteInfo, HttpMethod } from '../types/RouteInfo';

/**
 * PromptBuilder - Build optimized prompts untuk Gemma 3 12B-IT
 * Focus: Generate OpenAPI 3.1 documentation
 */
export class PromptBuilder {
    
    /**
     * Build prompt untuk single route
     */
    static buildRoutePrompt(route: RouteInfo, codeSnippet?: string): string {
        const prompt = `${this.getSystemContext()}

${this.getTaskInstruction()}

${this.getRouteInformation(route)}

${codeSnippet ? this.getCodeSnippet(codeSnippet) : ''}

${this.getFewShotExample()}

${this.getOutputFormat()}`;

        return prompt;
    }

    /**
     * Build prompt untuk multiple routes
     */
    static buildMultipleRoutesPrompt(routes: RouteInfo[]): string {
        const routesInfo = routes.map((route, index) => 
            `Route ${index + 1}:\n${this.getRouteInformation(route)}`
        ).join('\n\n');

        const prompt = `${this.getSystemContext()}

${this.getTaskInstruction()}

${routesInfo}

${this.getFewShotExample()}

${this.getOutputFormat()}`;

        return prompt;
    }

    /**
     * System context untuk AI
     */
    private static getSystemContext(): string {
        return `You are an expert API documentation assistant specialized in generating OpenAPI 3.1 specifications from Express.js code.`;
    }

    /**
     * Task instruction
     */
    private static getTaskInstruction(): string {
        return `TASK: Generate accurate OpenAPI 3.1 documentation for the following Express.js REST API endpoint(s).`;
    }

    /**
     * Format route information
     */
    private static getRouteInformation(route: RouteInfo): string {
        let info = `METHOD: ${route.method}
PATH: ${route.path}`;

        // Add parameters
        if (route.parameters.length > 0) {
            info += `\nPARAMETERS:`;
            
            const pathParams = route.parameters.filter(p => p.type === 'path');
            const queryParams = route.parameters.filter(p => p.type === 'query');
            const bodyParams = route.parameters.filter(p => p.type === 'body');

            if (pathParams.length > 0) {
                info += `\n  Path: ${pathParams.map(p => `${p.name} (${p.dataType})`).join(', ')}`;
            }
            if (queryParams.length > 0) {
                info += `\n  Query: ${queryParams.map(p => `${p.name} (${p.dataType})`).join(', ')}`;
            }
            if (bodyParams.length > 0) {
                info += `\n  Body: ${bodyParams.map(p => `${p.name} (${p.dataType})`).join(', ')}`;
            }
        }

        // Add middlewares (hints for auth/validation)
        if (route.middlewares.length > 0) {
            info += `\nMIDDLEWARES: ${route.middlewares.map(m => m.name).join(', ')}`;
        }

        // Add response info
        if (route.responses.length > 0) {
            info += `\nRESPONSES:`;
            route.responses.forEach(r => {
                info += `\n  ${r.statusCode}: ${r.description}`;
            });
        }

        return info;
    }

    /**
     * Format code snippet
     */
    private static getCodeSnippet(code: string): string {
        return `CODE SNIPPET:
\`\`\`javascript
${code}
\`\`\``;
    }

    /**
     * Few-shot example untuk guide AI
     */
    private static getFewShotExample(): string {
        return `EXAMPLE OUTPUT FORMAT:

\`\`\`yaml
/users/{id}:
  get:
    summary: Get user by ID
    description: Retrieve detailed information about a specific user
    operationId: getUserById
    tags:
      - Users
    parameters:
      - name: id
        in: path
        required: true
        description: User ID
        schema:
          type: string
    responses:
      '200':
        description: Successful response
        content:
          application/json:
            schema:
              type: object
              properties:
                id:
                  type: string
                name:
                  type: string
                email:
                  type: string
      '404':
        description: User not found
        content:
          application/json:
            schema:
              type: object
              properties:
                message:
                  type: string
\`\`\``;
    }

    /**
     * Output format instructions
     */
    private static getOutputFormat(): string {
        return `REQUIREMENTS:
1. Generate ONLY the OpenAPI path object in YAML format
2. Include accurate parameter definitions with proper types
3. Include all relevant response status codes (200, 201, 400, 401, 404, 500, etc.)
4. Add clear descriptions for the endpoint and parameters
5. Use proper OpenAPI 3.1 schema definitions
6. Do NOT include any explanations, just the YAML content
7. Ensure valid YAML syntax

OUTPUT (YAML only):`;
    }

    /**
     * Build prompt untuk testing AI response
     */
    static buildTestPrompt(): string {
        return `You are an API documentation expert. 

Generate OpenAPI 3.1 documentation for this Express route:

METHOD: GET
PATH: /users/:id
PARAMETERS:
  Path: id (string)
RESPONSES:
  200: Success
  404: Not Found

Output only valid OpenAPI 3.1 YAML for this path, no explanations.`;
    }

    /**
     * Extract YAML from AI response (remove markdown code blocks)
     */
    static extractYAML(response: string): string {
        // Remove ```yaml and ``` markers
        let yaml = response.trim();
        
        // Remove opening code block
        yaml = yaml.replace(/^```yaml\s*/i, '');
        yaml = yaml.replace(/^```yml\s*/i, '');
        yaml = yaml.replace(/^```\s*/, '');
        
        // Remove closing code block
        yaml = yaml.replace(/\s*```\s*$/, '');
        
        return yaml.trim();
    }

    /**
     * Validate AI response structure
     */
    static validateResponse(response: string): {
        isValid: boolean;
        errors: string[];
    } {
        const errors: string[] = [];
        
        // Check if response contains YAML
        if (!response.includes(':') || response.trim().length < 10) {
            errors.push('Response does not appear to be valid YAML');
        }

        // Check for common OpenAPI fields
        const requiredFields = ['summary', 'responses'];
        const hasRequiredFields = requiredFields.some(field => 
            response.includes(`${field}:`)
        );

        if (!hasRequiredFields) {
            errors.push('Response missing required OpenAPI fields (summary, responses)');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}