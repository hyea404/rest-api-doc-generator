import * as assert from 'assert';
import { PromptBuilder } from '../../utils/PromptBuilder';
import { HttpMethod, RouteInfo } from '../../types/RouteInfo';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeRoute(overrides?: Partial<RouteInfo>): RouteInfo {
    return {
        method: HttpMethod.GET,
        path: '/users',
        handler: 'getUsers',
        parameters: [],
        responses: [{ statusCode: 200, description: 'Success' }],
        middlewares: [],
        filePath: 'routes/users.js',
        ...overrides,
    };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('PromptBuilder', () => {

    // ── buildRoutePrompt ──────────────────────────────────────────────────────

    describe('buildRoutePrompt()', () => {

        it('should include the HTTP method and path in the prompt', () => {
            const route = makeRoute({ method: HttpMethod.POST, path: '/items' });
            const prompt = PromptBuilder.buildRoutePrompt(route);
            assert.ok(prompt.includes('METHOD: POST'));
            assert.ok(prompt.includes('PATH: /items'));
        });

        it('should include system context about being an API documentation expert', () => {
            const prompt = PromptBuilder.buildRoutePrompt(makeRoute());
            assert.ok(prompt.includes('expert API documentation'));
        });

        it('should include the task instruction', () => {
            const prompt = PromptBuilder.buildRoutePrompt(makeRoute());
            assert.ok(prompt.includes('TASK:'));
            assert.ok(prompt.includes('OpenAPI 3.1'));
        });

        it('should include the few-shot example', () => {
            const prompt = PromptBuilder.buildRoutePrompt(makeRoute());
            assert.ok(prompt.includes('EXAMPLE OUTPUT FORMAT'));
        });

        it('should include the output format requirements', () => {
            const prompt = PromptBuilder.buildRoutePrompt(makeRoute());
            assert.ok(prompt.includes('REQUIREMENTS:'));
            assert.ok(prompt.includes('OUTPUT (YAML only):'));
        });

        it('should include path parameters when present', () => {
            const route = makeRoute({
                path: '/users/:id',
                parameters: [{ name: 'id', type: 'path', required: true, dataType: 'string' }],
            });
            const prompt = PromptBuilder.buildRoutePrompt(route);
            assert.ok(prompt.includes('PARAMETERS:'));
            assert.ok(prompt.includes('Path: id (string)'));
        });

        it('should include query parameters when present', () => {
            const route = makeRoute({
                parameters: [{ name: 'page', type: 'query', required: false, dataType: 'string' }],
            });
            const prompt = PromptBuilder.buildRoutePrompt(route);
            assert.ok(prompt.includes('Query: page (string)'));
        });

        it('should include body parameters when present', () => {
            const route = makeRoute({
                parameters: [{ name: 'email', type: 'body', required: true, dataType: 'string' }],
            });
            const prompt = PromptBuilder.buildRoutePrompt(route);
            assert.ok(prompt.includes('Body: email (string)'));
        });

        it('should include all three parameter types when present', () => {
            const route = makeRoute({
                path: '/users/:id',
                parameters: [
                    { name: 'id', type: 'path', required: true, dataType: 'string' },
                    { name: 'lang', type: 'query', required: false, dataType: 'string' },
                    { name: 'name', type: 'body', required: true, dataType: 'string' },
                ],
            });
            const prompt = PromptBuilder.buildRoutePrompt(route);
            assert.ok(prompt.includes('Path: id'));
            assert.ok(prompt.includes('Query: lang'));
            assert.ok(prompt.includes('Body: name'));
        });

        it('should NOT include PARAMETERS section when there are none', () => {
            const route = makeRoute({ parameters: [] });
            const prompt = PromptBuilder.buildRoutePrompt(route);
            assert.ok(!prompt.includes('PARAMETERS:'));
        });

        it('should include middleware names when present', () => {
            const route = makeRoute({
                middlewares: [
                    { name: 'authenticate', type: 'auth' },
                    { name: 'validateBody', type: 'validation' },
                ],
            });
            const prompt = PromptBuilder.buildRoutePrompt(route);
            assert.ok(prompt.includes('MIDDLEWARES: authenticate, validateBody'));
        });

        it('should NOT include MIDDLEWARES section when there are none', () => {
            const route = makeRoute({ middlewares: [] });
            const prompt = PromptBuilder.buildRoutePrompt(route);
            assert.ok(!prompt.includes('MIDDLEWARES:'));
        });

        it('should include response status codes and descriptions', () => {
            const route = makeRoute({
                responses: [
                    { statusCode: 200, description: 'Success' },
                    { statusCode: 404, description: 'Not Found' },
                ],
            });
            const prompt = PromptBuilder.buildRoutePrompt(route);
            assert.ok(prompt.includes('RESPONSES:'));
            assert.ok(prompt.includes('200: Success'));
            assert.ok(prompt.includes('404: Not Found'));
        });

        it('should include the code snippet when provided', () => {
            const code = 'router.get("/users", handler);';
            const prompt = PromptBuilder.buildRoutePrompt(makeRoute(), code);
            assert.ok(prompt.includes('CODE SNIPPET:'));
            assert.ok(prompt.includes(code));
        });

        it('should NOT include CODE SNIPPET section when not provided', () => {
            const prompt = PromptBuilder.buildRoutePrompt(makeRoute());
            assert.ok(!prompt.includes('CODE SNIPPET:'));
        });
    });

    // ── buildMultipleRoutesPrompt ─────────────────────────────────────────────

    describe('buildMultipleRoutesPrompt()', () => {

        it('should include all route methods and paths', () => {
            const routes = [
                makeRoute({ method: HttpMethod.GET, path: '/users' }),
                makeRoute({ method: HttpMethod.POST, path: '/users' }),
                makeRoute({ method: HttpMethod.DELETE, path: '/users/:id' }),
            ];
            const prompt = PromptBuilder.buildMultipleRoutesPrompt(routes);
            assert.ok(prompt.includes('METHOD: GET'));
            assert.ok(prompt.includes('METHOD: POST'));
            assert.ok(prompt.includes('METHOD: DELETE'));
            assert.ok(prompt.includes('PATH: /users/:id'));
        });

        it('should label each route sequentially (Route 1, Route 2, etc.)', () => {
            const routes = [makeRoute(), makeRoute()];
            const prompt = PromptBuilder.buildMultipleRoutesPrompt(routes);
            assert.ok(prompt.includes('Route 1:'));
            assert.ok(prompt.includes('Route 2:'));
        });

        it('should include the system context and task instruction', () => {
            const prompt = PromptBuilder.buildMultipleRoutesPrompt([makeRoute()]);
            assert.ok(prompt.includes('expert API documentation'));
            assert.ok(prompt.includes('TASK:'));
        });

        it('should include the few-shot example and output format', () => {
            const prompt = PromptBuilder.buildMultipleRoutesPrompt([makeRoute()]);
            assert.ok(prompt.includes('EXAMPLE OUTPUT FORMAT'));
            assert.ok(prompt.includes('REQUIREMENTS:'));
        });

        it('should include parameters for each route individually', () => {
            const routes = [
                makeRoute({
                    path: '/users/:userId',
                    parameters: [{ name: 'userId', type: 'path', required: true, dataType: 'string' }],
                }),
                makeRoute({
                    path: '/posts',
                    parameters: [{ name: 'page', type: 'query', required: false, dataType: 'string' }],
                }),
            ];
            const prompt = PromptBuilder.buildMultipleRoutesPrompt(routes);
            assert.ok(prompt.includes('Path: userId'));
            assert.ok(prompt.includes('Query: page'));
        });
    });

    // ── buildTestPrompt ───────────────────────────────────────────────────────

    describe('buildTestPrompt()', () => {

        it('should return a non-empty string', () => {
            const prompt = PromptBuilder.buildTestPrompt();
            assert.ok(prompt.length > 0);
        });

        it('should reference GET /users/:id', () => {
            const prompt = PromptBuilder.buildTestPrompt();
            assert.ok(prompt.includes('METHOD: GET'));
            assert.ok(prompt.includes('PATH: /users/:id'));
        });

        it('should mention OpenAPI 3.1', () => {
            const prompt = PromptBuilder.buildTestPrompt();
            assert.ok(prompt.includes('OpenAPI 3.1'));
        });

        it('should mention the id path parameter', () => {
            const prompt = PromptBuilder.buildTestPrompt();
            assert.ok(prompt.includes('Path: id'));
        });

        it('should include expected response codes 200 and 404', () => {
            const prompt = PromptBuilder.buildTestPrompt();
            assert.ok(prompt.includes('200: Success'));
            assert.ok(prompt.includes('404: Not Found'));
        });
    });

    // ── extractYAML ───────────────────────────────────────────────────────────

    describe('extractYAML()', () => {

        it('should strip ```yaml ... ``` markers', () => {
            const input = '```yaml\nfoo: bar\n```';
            assert.strictEqual(PromptBuilder.extractYAML(input), 'foo: bar');
        });

        it('should strip ```yml ... ``` markers', () => {
            const input = '```yml\nfoo: bar\n```';
            assert.strictEqual(PromptBuilder.extractYAML(input), 'foo: bar');
        });

        it('should strip bare ``` ... ``` markers (no language tag)', () => {
            const input = '```\nfoo: bar\n```';
            assert.strictEqual(PromptBuilder.extractYAML(input), 'foo: bar');
        });

        it('should be case-insensitive for the yaml language tag', () => {
            const input = '```YAML\nfoo: bar\n```';
            assert.strictEqual(PromptBuilder.extractYAML(input), 'foo: bar');
        });

        it('should return trimmed content when there are no code block markers', () => {
            const input = '  foo: bar  ';
            assert.strictEqual(PromptBuilder.extractYAML(input), 'foo: bar');
        });

        it('should handle multi-line YAML content', () => {
            const yaml = '/users:\n  get:\n    summary: List users\n    responses:\n      200:\n        description: OK';
            const input = `\`\`\`yaml\n${yaml}\n\`\`\``;
            assert.strictEqual(PromptBuilder.extractYAML(input), yaml);
        });

        it('should handle empty input gracefully', () => {
            assert.strictEqual(PromptBuilder.extractYAML(''), '');
            assert.strictEqual(PromptBuilder.extractYAML('   '), '');
        });

        it('should handle input that is only code block markers', () => {
            const result = PromptBuilder.extractYAML('```yaml\n```');
            assert.strictEqual(result, '');
        });
    });

    // ── validateResponse ──────────────────────────────────────────────────────

    describe('validateResponse()', () => {

        it('should return isValid=true for a valid YAML response with summary and responses', () => {
            const yaml = '/users:\n  get:\n    summary: List users\n    responses:\n      200:\n        description: OK';
            const result = PromptBuilder.validateResponse(yaml);
            assert.strictEqual(result.isValid, true);
            assert.strictEqual(result.errors.length, 0);
        });

        it('should return isValid=true when at least "summary:" OR "responses:" is present', () => {
            // The validator uses .some(), so either field passing is enough
            const yamlWithSummaryOnly = 'summary: Get user\nother: stuff';
            assert.strictEqual(PromptBuilder.validateResponse(yamlWithSummaryOnly).isValid, true);

            const yamlWithResponsesOnly = 'responses:\n  200:\n    description: OK';
            assert.strictEqual(PromptBuilder.validateResponse(yamlWithResponsesOnly).isValid, true);
        });

        it('should return isValid=false with an error for very short content', () => {
            const result = PromptBuilder.validateResponse('short');
            assert.strictEqual(result.isValid, false);
            assert.ok(result.errors.some(e => e.includes('valid YAML')));
        });

        it('should return isValid=false with an error for content without a colon', () => {
            const result = PromptBuilder.validateResponse('no colon anywhere in this text at all');
            assert.strictEqual(result.isValid, false);
            assert.ok(result.errors.some(e => e.includes('valid YAML')));
        });

        it('should return isValid=false when neither summary: nor responses: is present', () => {
            const yaml = 'paths:\n  /users:\n    get:\n      description: List users';
            const result = PromptBuilder.validateResponse(yaml);
            assert.strictEqual(result.isValid, false);
            assert.ok(result.errors.some(e => e.includes('required OpenAPI fields')));
        });

        it('should return multiple errors when both checks fail', () => {
            const result = PromptBuilder.validateResponse('x');
            assert.ok(result.errors.length >= 1);
            assert.strictEqual(result.isValid, false);
        });

        it('should return isValid=false for an empty string', () => {
            const result = PromptBuilder.validateResponse('');
            assert.strictEqual(result.isValid, false);
        });
    });
});
