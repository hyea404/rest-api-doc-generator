import * as assert from 'assert';
import * as sinon from 'sinon';
import * as yaml from 'js-yaml';
import { OpenAPIGenerator } from '../../generators/OpenAPIGenerator';
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

describe('OpenAPIGenerator', () => {

    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        sandbox.stub(console, 'log');
        sandbox.stub(console, 'warn');
        sandbox.stub(console, 'error');
    });

    afterEach(() => {
        sandbox.restore();
    });

    // ── Constructor ───────────────────────────────────────────────────────────

    describe('constructor', () => {

        it('should create a document with default title and version', () => {
            const gen = new OpenAPIGenerator();
            const doc = gen.getDocument();

            assert.strictEqual(doc.openapi, '3.1.0');
            assert.strictEqual(doc.info.title, 'REST API Documentation');
            assert.strictEqual(doc.info.version, '1.0.0');
        });

        it('should use custom title and version when provided', () => {
            const gen = new OpenAPIGenerator('My API', '2.0.0');
            const doc = gen.getDocument();

            assert.strictEqual(doc.info.title, 'My API');
            assert.strictEqual(doc.info.version, '2.0.0');
        });

        it('should use custom description when provided', () => {
            const gen = new OpenAPIGenerator('API', '1.0.0', 'Custom desc');
            assert.strictEqual(gen.getDocument().info.description, 'Custom desc');
        });

        it('should fall back to default description when none is provided', () => {
            const gen = new OpenAPIGenerator('API', '1.0.0');
            assert.strictEqual(gen.getDocument().info.description, 'Auto-generated API documentation');
        });

        it('should initialize with localhost development server', () => {
            const gen = new OpenAPIGenerator();
            const servers = gen.getDocument().servers;

            assert.ok(servers && servers.length === 1);
            assert.strictEqual(servers![0].url, 'http://localhost:3000');
        });

        it('should initialize with empty paths', () => {
            const gen = new OpenAPIGenerator();
            assert.deepStrictEqual(gen.getDocument().paths, {});
        });

        it('should initialize components with empty schemas', () => {
            const gen = new OpenAPIGenerator();
            assert.deepStrictEqual(gen.getDocument().components, { schemas: {} });
        });

        it('should initialize with empty tags array', () => {
            const gen = new OpenAPIGenerator();
            assert.deepStrictEqual(gen.getDocument().tags, []);
        });
    });

    // ── addRoutes ─────────────────────────────────────────────────────────────

    describe('addRoutes()', () => {

        it('should add a single GET route', () => {
            const gen = new OpenAPIGenerator();
            gen.addRoutes([makeRoute()]);

            const doc = gen.getDocument();
            assert.ok(doc.paths['/users']);
            assert.ok(doc.paths['/users'].get);
        });

        it('should convert Express :param to {param} in path keys', () => {
            const gen = new OpenAPIGenerator();
            gen.addRoutes([makeRoute({ path: '/users/:id' })]);

            const doc = gen.getDocument();
            assert.ok(doc.paths['/users/{id}']);
            assert.strictEqual(doc.paths['/users/:id'], undefined);
        });

        it('should group multiple methods under the same path', () => {
            const gen = new OpenAPIGenerator();
            gen.addRoutes([
                makeRoute({ method: HttpMethod.GET, path: '/users' }),
                makeRoute({ method: HttpMethod.POST, path: '/users', handler: 'createUser' }),
            ]);

            const doc = gen.getDocument();
            assert.ok(doc.paths['/users'].get);
            assert.ok(doc.paths['/users'].post);
        });

        it('should generate a summary from method and resource', () => {
            const gen = new OpenAPIGenerator();
            gen.addRoutes([makeRoute({ method: HttpMethod.POST, path: '/orders', handler: 'createOrder' })]);

            const operation = gen.getDocument().paths['/orders'].post!;
            assert.strictEqual(operation.summary, 'Create Orders');
        });

        it('should use handler name as operationId when it is not anonymous', () => {
            const gen = new OpenAPIGenerator();
            gen.addRoutes([makeRoute({ handler: 'listUsers' })]);

            const operation = gen.getDocument().paths['/users'].get!;
            assert.strictEqual(operation.operationId, 'listUsers');
        });

        it('should generate operationId when handler is anonymous', () => {
            const gen = new OpenAPIGenerator();
            gen.addRoutes([makeRoute({ handler: 'anonymous' })]);

            const operation = gen.getDocument().paths['/users'].get!;
            assert.strictEqual(operation.operationId, 'getUsers');
        });

        it('should generate operationId with ById suffix for parameterized paths', () => {
            const gen = new OpenAPIGenerator();
            gen.addRoutes([makeRoute({ handler: 'anonymous', path: '/users/:id' })]);

            const operation = gen.getDocument().paths['/users/{id}'].get!;
            assert.strictEqual(operation.operationId, 'getUsersById');
        });

        it('should include path parameters in the operation', () => {
            const gen = new OpenAPIGenerator();
            gen.addRoutes([makeRoute({
                path: '/users/:id',
                parameters: [{ name: 'id', type: 'path', required: true, dataType: 'string' }],
            })]);

            const params = gen.getDocument().paths['/users/{id}'].get!.parameters!;
            assert.strictEqual(params.length, 1);
            assert.strictEqual(params[0].name, 'id');
            assert.strictEqual(params[0].in, 'path');
            assert.strictEqual(params[0].required, true);
        });

        it('should include query parameters in the operation', () => {
            const gen = new OpenAPIGenerator();
            gen.addRoutes([makeRoute({
                parameters: [{ name: 'page', type: 'query', required: false, dataType: 'number' }],
            })]);

            const params = gen.getDocument().paths['/users'].get!.parameters!;
            assert.strictEqual(params.length, 1);
            assert.strictEqual(params[0].name, 'page');
            assert.strictEqual(params[0].in, 'query');
            assert.strictEqual(params[0].schema.type, 'number');
        });

        it('should NOT include body params in parameters array (they go to requestBody)', () => {
            const gen = new OpenAPIGenerator();
            gen.addRoutes([makeRoute({
                method: HttpMethod.POST,
                parameters: [{ name: 'email', type: 'body', required: true, dataType: 'string' }],
            })]);

            const params = gen.getDocument().paths['/users'].post!.parameters!;
            assert.strictEqual(params.length, 0);
        });

        it('should add requestBody for POST routes with body parameters', () => {
            const gen = new OpenAPIGenerator();
            gen.addRoutes([makeRoute({
                method: HttpMethod.POST,
                handler: 'createUser',
                parameters: [
                    { name: 'name', type: 'body', required: true, dataType: 'string' },
                    { name: 'email', type: 'body', required: true, dataType: 'string' },
                ],
            })]);

            const op = gen.getDocument().paths['/users'].post!;
            assert.ok(op.requestBody);
            const schema = op.requestBody!.content['application/json'].schema;
            assert.ok(schema.properties.name);
            assert.ok(schema.properties.email);
            assert.deepStrictEqual(schema.required, ['name', 'email']);
        });

        it('should add requestBody for PUT routes', () => {
            const gen = new OpenAPIGenerator();
            gen.addRoutes([makeRoute({
                method: HttpMethod.PUT,
                path: '/users/:id',
                handler: 'updateUser',
                parameters: [
                    { name: 'id', type: 'path', required: true, dataType: 'string' },
                    { name: 'name', type: 'body', required: false, dataType: 'string' },
                ],
            })]);

            const op = gen.getDocument().paths['/users/{id}'].put!;
            assert.ok(op.requestBody);
            assert.strictEqual(op.requestBody!.required, false);
        });

        it('should NOT add requestBody for GET routes', () => {
            const gen = new OpenAPIGenerator();
            gen.addRoutes([makeRoute({
                method: HttpMethod.GET,
                parameters: [{ name: 'field', type: 'body', required: false, dataType: 'string' }],
            })]);

            const op = gen.getDocument().paths['/users'].get!;
            assert.strictEqual(op.requestBody, undefined);
        });

        it('should build responses from route info', () => {
            const gen = new OpenAPIGenerator();
            gen.addRoutes([makeRoute({
                responses: [
                    { statusCode: 200, description: 'OK' },
                    { statusCode: 404, description: 'Not found' },
                ],
            })]);

            const responses = gen.getDocument().paths['/users'].get!.responses;
            assert.ok(responses['200']);
            assert.strictEqual(responses['200'].description, 'OK');
            assert.ok(responses['404']);
            assert.strictEqual(responses['404'].description, 'Not found');
        });

        it('should ensure a 200 response exists even if not specified', () => {
            const gen = new OpenAPIGenerator();
            gen.addRoutes([makeRoute({ responses: [] })]);

            const responses = gen.getDocument().paths['/users'].get!.responses;
            assert.ok(responses['200']);
            assert.strictEqual(responses['200'].description, 'Successful response');
        });

        it('should extract tags from the path resource', () => {
            const gen = new OpenAPIGenerator();
            gen.addRoutes([makeRoute({ path: '/products' })]);

            const tags = gen.getDocument().tags;
            assert.ok(tags!.some(t => t.name === 'Products'));
        });

        it('should extract tags from multiple distinct paths', () => {
            const gen = new OpenAPIGenerator();
            gen.addRoutes([
                makeRoute({ path: '/users' }),
                makeRoute({ path: '/orders', handler: 'getOrders' }),
            ]);

            const tagNames = gen.getDocument().tags!.map(t => t.name);
            assert.ok(tagNames.includes('Users'));
            assert.ok(tagNames.includes('Orders'));
        });
    });

    // ── addRouteWithAIDoc ─────────────────────────────────────────────────────

    describe('addRouteWithAIDoc()', () => {

        it('should merge AI-generated YAML into the document paths', () => {
            const gen = new OpenAPIGenerator();
            const aiYaml = `/users:\n  get:\n    summary: List users\n    responses:\n      '200':\n        description: OK`;

            gen.addRouteWithAIDoc(makeRoute(), aiYaml);

            const doc = gen.getDocument();
            assert.ok(doc.paths['/users']);
            assert.ok(doc.paths['/users'].get);
            assert.strictEqual(doc.paths['/users'].get!.summary, 'List users');
        });

        it('should extract tags from AI-generated operations', () => {
            const gen = new OpenAPIGenerator();
            const aiYaml = `/users:\n  get:\n    summary: List users\n    tags:\n      - Users\n      - Admin\n    responses:\n      '200':\n        description: OK`;

            gen.addRouteWithAIDoc(makeRoute(), aiYaml);

            const tagNames = gen.getDocument().tags!.map(t => t.name);
            assert.ok(tagNames.includes('Users'));
            assert.ok(tagNames.includes('Admin'));
        });

        it('should not duplicate tags', () => {
            const gen = new OpenAPIGenerator();
            const aiYaml1 = `/users:\n  get:\n    summary: List users\n    tags:\n      - Users\n    responses:\n      '200':\n        description: OK`;
            const aiYaml2 = `/users:\n  post:\n    summary: Create user\n    tags:\n      - Users\n    responses:\n      '201':\n        description: Created`;

            gen.addRouteWithAIDoc(makeRoute(), aiYaml1);
            gen.addRouteWithAIDoc(makeRoute({ method: HttpMethod.POST }), aiYaml2);

            const usersTags = gen.getDocument().tags!.filter(t => t.name === 'Users');
            assert.strictEqual(usersTags.length, 1);
        });

        it('should fall back to manual generation on invalid YAML', () => {
            const gen = new OpenAPIGenerator();
            gen.addRouteWithAIDoc(makeRoute(), '{{{{invalid yaml::::');

            // Should still add the route manually
            const doc = gen.getDocument();
            assert.ok(doc.paths['/users']);
            assert.ok(doc.paths['/users'].get);
        });

        it('should merge operations into existing paths', () => {
            const gen = new OpenAPIGenerator();
            const aiYaml1 = `/users:\n  get:\n    summary: List users\n    responses:\n      '200':\n        description: OK`;
            const aiYaml2 = `/users:\n  post:\n    summary: Create user\n    responses:\n      '201':\n        description: Created`;

            gen.addRouteWithAIDoc(makeRoute(), aiYaml1);
            gen.addRouteWithAIDoc(makeRoute({ method: HttpMethod.POST }), aiYaml2);

            const doc = gen.getDocument();
            assert.ok(doc.paths['/users'].get);
            assert.ok(doc.paths['/users'].post);
        });
    });

    // ── extractSchemasToComponents ────────────────────────────────────────────

    describe('extractSchemasToComponents()', () => {

        it('should extract a User schema when properties include id, name, email', () => {
            const gen = new OpenAPIGenerator();
            const aiYaml = `/users:\n  get:\n    summary: List\n    responses:\n      '200':\n        description: OK\n        content:\n          application/json:\n            schema:\n              type: object\n              properties:\n                id:\n                  type: string\n                name:\n                  type: string\n                email:\n                  type: string`;

            gen.addRouteWithAIDoc(makeRoute(), aiYaml);
            gen.extractSchemasToComponents();

            const schemas = gen.getDocument().components!.schemas!;
            assert.ok(schemas['User']);
            assert.ok(schemas['User'].properties.id);
            assert.ok(schemas['User'].properties.name);
            assert.ok(schemas['User'].properties.email);
        });

        it('should extract an ErrorResponse schema when properties include message', () => {
            const gen = new OpenAPIGenerator();
            const aiYaml = `/users:\n  get:\n    summary: List\n    responses:\n      '404':\n        description: Not found\n        content:\n          application/json:\n            schema:\n              type: object\n              properties:\n                message:\n                  type: string`;

            gen.addRouteWithAIDoc(makeRoute(), aiYaml);
            gen.extractSchemasToComponents();

            assert.ok(gen.getDocument().components!.schemas!['ErrorResponse']);
        });

        it('should extract a Product schema when properties include id, name, price', () => {
            const gen = new OpenAPIGenerator();
            const aiYaml = `/products:\n  get:\n    summary: List\n    responses:\n      '200':\n        description: OK\n        content:\n          application/json:\n            schema:\n              type: object\n              properties:\n                id:\n                  type: string\n                name:\n                  type: string\n                price:\n                  type: number`;

            gen.addRouteWithAIDoc(makeRoute({ path: '/products' }), aiYaml);
            gen.extractSchemasToComponents();

            assert.ok(gen.getDocument().components!.schemas!['Product']);
        });

        it('should not extract schemas for non-matching property patterns', () => {
            const gen = new OpenAPIGenerator();
            const aiYaml = `/data:\n  get:\n    summary: Get\n    responses:\n      '200':\n        description: OK\n        content:\n          application/json:\n            schema:\n              type: object\n              properties:\n                foo:\n                  type: string\n                bar:\n                  type: number`;

            gen.addRouteWithAIDoc(makeRoute({ path: '/data' }), aiYaml);
            gen.extractSchemasToComponents();

            const schemas = gen.getDocument().components!.schemas!;
            assert.strictEqual(Object.keys(schemas).length, 0);
        });
    });

    // ── finalizeDocument ──────────────────────────────────────────────────────

    describe('finalizeDocument()', () => {

        it('should set a Default tag if no tags exist', () => {
            const gen = new OpenAPIGenerator();
            gen.finalizeDocument();

            const tags = gen.getDocument().tags!;
            assert.strictEqual(tags.length, 1);
            assert.strictEqual(tags[0].name, 'Default');
        });

        it('should keep existing tags if they exist', () => {
            const gen = new OpenAPIGenerator();
            gen.addRoutes([makeRoute({ path: '/users' })]);
            gen.finalizeDocument();

            const tags = gen.getDocument().tags!;
            assert.ok(tags.some(t => t.name === 'Users'));
        });

        it('should invoke extractSchemasToComponents', () => {
            const gen = new OpenAPIGenerator();
            const aiYaml = `/users:\n  get:\n    summary: List\n    responses:\n      '200':\n        description: OK\n        content:\n          application/json:\n            schema:\n              type: object\n              properties:\n                message:\n                  type: string`;

            gen.addRouteWithAIDoc(makeRoute(), aiYaml);
            gen.finalizeDocument();

            assert.ok(gen.getDocument().components!.schemas!['ErrorResponse']);
        });
    });

    // ── setServer ─────────────────────────────────────────────────────────────

    describe('setServer()', () => {

        it('should replace the default server', () => {
            const gen = new OpenAPIGenerator();
            gen.setServer('https://api.example.com', 'Production');

            const servers = gen.getDocument().servers!;
            assert.strictEqual(servers.length, 1);
            assert.strictEqual(servers[0].url, 'https://api.example.com');
            assert.strictEqual(servers[0].description, 'Production');
        });

        it('should use default description when none is provided', () => {
            const gen = new OpenAPIGenerator();
            gen.setServer('https://api.example.com');

            assert.strictEqual(gen.getDocument().servers![0].description, 'API Server');
        });
    });

    // ── setInfo ───────────────────────────────────────────────────────────────

    describe('setInfo()', () => {

        it('should update the document info', () => {
            const gen = new OpenAPIGenerator();
            gen.setInfo('New Title', '3.0.0', 'New description');

            const info = gen.getDocument().info;
            assert.strictEqual(info.title, 'New Title');
            assert.strictEqual(info.version, '3.0.0');
            assert.strictEqual(info.description, 'New description');
        });

        it('should use default description when none is provided', () => {
            const gen = new OpenAPIGenerator();
            gen.setInfo('API', '1.0.0');

            assert.strictEqual(gen.getDocument().info.description, 'Auto-generated API documentation');
        });
    });

    // ── toYAML / toJSON ───────────────────────────────────────────────────────

    describe('toYAML()', () => {

        it('should return a valid YAML string', () => {
            const gen = new OpenAPIGenerator();
            const output = gen.toYAML();

            assert.ok(typeof output === 'string');
            const parsed = yaml.load(output) as any;
            assert.strictEqual(parsed.openapi, '3.1.0');
        });

        it('should contain path entries after addRoutes', () => {
            const gen = new OpenAPIGenerator();
            gen.addRoutes([makeRoute()]);
            const output = gen.toYAML();

            assert.ok(output.includes('/users'));
        });
    });

    describe('toJSON()', () => {

        it('should return a valid JSON string', () => {
            const gen = new OpenAPIGenerator();
            const output = gen.toJSON();

            const parsed = JSON.parse(output);
            assert.strictEqual(parsed.openapi, '3.1.0');
        });

        it('should be pretty-printed with 2-space indent', () => {
            const gen = new OpenAPIGenerator();
            const output = gen.toJSON();

            // The second line should start with 2 spaces (pretty-printed)
            const lines = output.split('\n');
            assert.ok(lines[1].startsWith('  '));
        });

        it('should contain path entries after addRoutes', () => {
            const gen = new OpenAPIGenerator();
            gen.addRoutes([makeRoute()]);
            const parsed = JSON.parse(gen.toJSON());

            assert.ok(parsed.paths['/users']);
            assert.ok(parsed.paths['/users'].get);
        });
    });

    // ── Edge cases ────────────────────────────────────────────────────────────

    describe('Edge cases', () => {

        it('should handle routes with all HTTP methods', () => {
            const gen = new OpenAPIGenerator();
            const methods = [
                HttpMethod.GET, HttpMethod.POST, HttpMethod.PUT,
                HttpMethod.DELETE, HttpMethod.PATCH,
            ];
            const routes = methods.map((method, i) =>
                makeRoute({ method, path: '/items', handler: `handler${i}` })
            );
            gen.addRoutes(routes);

            const pathItem = gen.getDocument().paths['/items'];
            assert.ok(pathItem.get);
            assert.ok(pathItem.post);
            assert.ok(pathItem.put);
            assert.ok(pathItem.delete);
            assert.ok(pathItem.patch);
        });

        it('should handle routes with custom descriptions', () => {
            const gen = new OpenAPIGenerator();
            gen.addRoutes([makeRoute({ description: 'Custom endpoint description' })]);

            const op = gen.getDocument().paths['/users'].get!;
            assert.strictEqual(op.description, 'Custom endpoint description');
        });

        it('should use default description when route has no description', () => {
            const gen = new OpenAPIGenerator();
            gen.addRoutes([makeRoute()]);

            const op = gen.getDocument().paths['/users'].get!;
            assert.ok(op.description!.includes('GET'));
            assert.ok(op.description!.includes('/users'));
        });

        it('should handle multiple path parameters correctly', () => {
            const gen = new OpenAPIGenerator();
            gen.addRoutes([makeRoute({
                path: '/orgs/:orgId/users/:userId',
                parameters: [
                    { name: 'orgId', type: 'path', required: true, dataType: 'string' },
                    { name: 'userId', type: 'path', required: true, dataType: 'string' },
                ],
            })]);

            const doc = gen.getDocument();
            assert.ok(doc.paths['/orgs/{orgId}/users/{userId}']);
            const params = doc.paths['/orgs/{orgId}/users/{userId}'].get!.parameters!;
            assert.strictEqual(params.length, 2);
        });

        it('should include response content when contentType is specified', () => {
            const gen = new OpenAPIGenerator();
            gen.addRoutes([makeRoute({
                responses: [{
                    statusCode: 200,
                    description: 'A list of users',
                    contentType: 'application/json',
                    schema: { type: 'array', items: { type: 'object' } },
                }],
            })]);

            const resp = gen.getDocument().paths['/users'].get!.responses['200'];
            assert.ok(resp.content);
            assert.ok(resp.content!['application/json']);
        });
    });
});
