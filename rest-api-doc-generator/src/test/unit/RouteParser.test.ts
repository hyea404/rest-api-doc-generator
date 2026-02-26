import * as assert from 'assert';
import { RouteParser } from '../../parsers/RouteParser';
import { HttpMethod } from '../../types/RouteInfo';

describe('RouteParser', () => {
    let parser: RouteParser;

    beforeEach(() => {
        parser = new RouteParser();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Basic HTTP method detection
    // ─────────────────────────────────────────────────────────────────────────

    describe('HTTP Method Detection', () => {

        it('should parse a simple GET route', () => {
            const code = `
                const router = express.Router();
                router.get('/users', (req, res) => { res.json([]); });
            `;
            const routes = parser.parseRoutes(code, 'test.js');
            assert.strictEqual(routes.length, 1);
            assert.strictEqual(routes[0].method, HttpMethod.GET);
            assert.strictEqual(routes[0].path, '/users');
        });

        it('should detect all standard HTTP methods', () => {
            const code = `
                router.get('/test', handler);
                router.post('/test', handler);
                router.put('/test', handler);
                router.delete('/test', handler);
                router.patch('/test', handler);
                router.options('/test', handler);
                router.head('/test', handler);
            `;
            const routes = parser.parseRoutes(code, 'test.js');
            assert.strictEqual(routes.length, 7);
            assert.strictEqual(routes[0].method, HttpMethod.GET);
            assert.strictEqual(routes[1].method, HttpMethod.POST);
            assert.strictEqual(routes[2].method, HttpMethod.PUT);
            assert.strictEqual(routes[3].method, HttpMethod.DELETE);
            assert.strictEqual(routes[4].method, HttpMethod.PATCH);
            assert.strictEqual(routes[5].method, HttpMethod.OPTIONS);
            assert.strictEqual(routes[6].method, HttpMethod.HEAD);
        });

        it('should parse routes defined on `app` as well as `router`', () => {
            const code = `
                app.get('/health', handler);
                router.get('/users', handler);
            `;
            const routes = parser.parseRoutes(code, 'test.js');
            assert.strictEqual(routes.length, 2);
        });

        it('should NOT pick up non-HTTP method calls like router.use()', () => {
            const code = `
                router.use('/api', middleware);
                router.get('/users', handler);
            `;
            const routes = parser.parseRoutes(code, 'test.js');
            assert.strictEqual(routes.length, 1);
            assert.strictEqual(routes[0].method, HttpMethod.GET);
        });

        it('should ignore method calls on objects other than router/app', () => {
            const code = `
                db.get('/path', handler);
                service.post('/path', handler);
                router.get('/users', handler);
            `;
            const routes = parser.parseRoutes(code, 'test.js');
            assert.strictEqual(routes.length, 1);
        });

        it('should store the filePath on each route', () => {
            const code = `router.get('/ping', handler);`;
            const routes = parser.parseRoutes(code, 'src/routes/ping.js');
            assert.strictEqual(routes[0].filePath, 'src/routes/ping.js');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Path Parameters
    // ─────────────────────────────────────────────────────────────────────────

    describe('Path Parameters', () => {

        it('should extract a single required path parameter', () => {
            const code = `router.get('/users/:id', handler);`;
            const routes = parser.parseRoutes(code, 'test.js');
            assert.strictEqual(routes[0].parameters.length, 1);
            const param = routes[0].parameters[0];
            assert.strictEqual(param.name, 'id');
            assert.strictEqual(param.type, 'path');
            assert.strictEqual(param.required, true);
            assert.strictEqual(param.dataType, 'string');
        });

        it('should extract multiple path parameters', () => {
            const code = `router.get('/orgs/:orgId/repos/:repoId', handler);`;
            const routes = parser.parseRoutes(code, 'test.js');
            const params = routes[0].parameters;
            assert.strictEqual(params.length, 2);
            assert.strictEqual(params[0].name, 'orgId');
            assert.strictEqual(params[1].name, 'repoId');
        });

        it('should mark an optional path parameter (ending with ?) as not required', () => {
            const code = `router.get('/posts/:id?', handler);`;
            const routes = parser.parseRoutes(code, 'test.js');
            const param = routes[0].parameters[0];
            assert.strictEqual(param.name, 'id');
            assert.strictEqual(param.required, false);
        });

        it('should handle a mix of required and optional path parameters', () => {
            const code = `router.get('/users/:userId/posts/:postId?', handler);`;
            const routes = parser.parseRoutes(code, 'test.js');
            const params = routes[0].parameters;
            assert.strictEqual(params.length, 2);
            assert.strictEqual(params[0].required, true);
            assert.strictEqual(params[1].required, false);
        });

        it('should return no parameters for a plain path with no params', () => {
            const code = `router.get('/users', handler);`;
            const routes = parser.parseRoutes(code, 'test.js');
            assert.strictEqual(routes[0].parameters.length, 0);
        });

        it('should handle path parameter names with underscores and numbers', () => {
            const code = `router.get('/items/:item_id_2', handler);`;
            const routes = parser.parseRoutes(code, 'test.js');
            assert.strictEqual(routes[0].parameters[0].name, 'item_id_2');
        });

        it('should extract three nested path parameters', () => {
            const code = `router.get('/api/v2/orgs/:orgId/teams/:teamId/members/:memberId', handler);`;
            const routes = parser.parseRoutes(code, 'test.js');
            assert.strictEqual(routes[0].parameters.length, 3);
            assert.strictEqual(routes[0].parameters[0].name, 'orgId');
            assert.strictEqual(routes[0].parameters[1].name, 'teamId');
            assert.strictEqual(routes[0].parameters[2].name, 'memberId');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Query Parameters
    // ─────────────────────────────────────────────────────────────────────────

    describe('Query Parameters', () => {

        it('should extract a query parameter accessed as req.query.x', () => {
            const code = `
                router.get('/users', (req, res) => {
                    const page = req.query.page;
                    res.json([]);
                });
            `;
            const routes = parser.parseRoutes(code, 'test.js');
            const queryParams = routes[0].parameters.filter(p => p.type === 'query');
            assert.strictEqual(queryParams.length, 1);
            assert.strictEqual(queryParams[0].name, 'page');
            assert.strictEqual(queryParams[0].required, false);
            assert.strictEqual(queryParams[0].dataType, 'string');
        });

        it('should extract multiple distinct query parameters', () => {
            const code = `
                router.get('/search', (req, res) => {
                    const q = req.query.q;
                    const limit = req.query.limit;
                    const offset = req.query.offset;
                    res.json([]);
                });
            `;
            const routes = parser.parseRoutes(code, 'test.js');
            const queryParams = routes[0].parameters.filter(p => p.type === 'query');
            assert.strictEqual(queryParams.length, 3);
            const names = queryParams.map(p => p.name);
            assert.ok(names.includes('q'));
            assert.ok(names.includes('limit'));
            assert.ok(names.includes('offset'));
        });

        it('should NOT extract duplicate query parameters', () => {
            const code = `
                router.get('/users', (req, res) => {
                    if (req.query.page) {
                        console.log(req.query.page);
                    }
                    res.json([]);
                });
            `;
            const routes = parser.parseRoutes(code, 'test.js');
            const queryParams = routes[0].parameters.filter(p => p.type === 'query');
            assert.strictEqual(queryParams.length, 1);
        });

        it('should not extract query params from named (non-inline) handlers', () => {
            const code = `router.get('/users', getUsersHandler);`;
            const routes = parser.parseRoutes(code, 'test.js');
            const queryParams = routes[0].parameters.filter(p => p.type === 'query');
            assert.strictEqual(queryParams.length, 0);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Body Parameters
    // ─────────────────────────────────────────────────────────────────────────

    describe('Body Parameters', () => {

        it('should extract body params from destructuring: const { x } = req.body', () => {
            const code = `
                router.post('/users', (req, res) => {
                    const { name, email, password } = req.body;
                    res.status(201).json({ id: 1 });
                });
            `;
            const routes = parser.parseRoutes(code, 'test.js');
            const bodyParams = routes[0].parameters.filter(p => p.type === 'body');
            assert.strictEqual(bodyParams.length, 3);
            const names = bodyParams.map(p => p.name);
            assert.ok(names.includes('name'));
            assert.ok(names.includes('email'));
            assert.ok(names.includes('password'));
        });

        it('should mark destructured body params as required', () => {
            const code = `
                router.post('/login', (req, res) => {
                    const { username, password } = req.body;
                    res.json({});
                });
            `;
            const routes = parser.parseRoutes(code, 'test.js');
            const bodyParams = routes[0].parameters.filter(p => p.type === 'body');
            bodyParams.forEach(p => assert.strictEqual(p.required, true));
        });

        it('should extract body params from direct access: req.body.x', () => {
            const code = `
                router.post('/items', (req, res) => {
                    const title = req.body.title;
                    res.json({});
                });
            `;
            const routes = parser.parseRoutes(code, 'test.js');
            const bodyParams = routes[0].parameters.filter(p => p.type === 'body');
            assert.strictEqual(bodyParams.length, 1);
            assert.strictEqual(bodyParams[0].name, 'title');
        });

        it('should NOT extract duplicate body params', () => {
            const code = `
                router.put('/users/:id', (req, res) => {
                    const name = req.body.name;
                    if (!req.body.name) { return; }
                    res.json({});
                });
            `;
            const routes = parser.parseRoutes(code, 'test.js');
            const bodyParams = routes[0].parameters.filter(p => p.type === 'body');
            assert.strictEqual(bodyParams.length, 1);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Middleware Detection
    // ─────────────────────────────────────────────────────────────────────────

    describe('Middleware Detection', () => {

        it('should extract middleware names between path and final handler', () => {
            const code = `router.post('/users', authenticate, validate, handler);`;
            const routes = parser.parseRoutes(code, 'test.js');
            assert.strictEqual(routes[0].middlewares.length, 2);
            assert.strictEqual(routes[0].middlewares[0].name, 'authenticate');
            assert.strictEqual(routes[0].middlewares[1].name, 'validate');
        });

        it('should classify middleware as "auth" when name contains "auth"', () => {
            const code = `router.get('/profile', authMiddleware, handler);`;
            const routes = parser.parseRoutes(code, 'test.js');
            assert.strictEqual(routes[0].middlewares[0].type, 'auth');
        });

        it('should classify middleware as "auth" when name contains "verify"', () => {
            const code = `router.get('/admin', verifyToken, handler);`;
            const routes = parser.parseRoutes(code, 'test.js');
            assert.strictEqual(routes[0].middlewares[0].type, 'auth');
        });

        it('should classify middleware as "validation" when name contains "valid"', () => {
            const code = `router.post('/users', validateBody, handler);`;
            const routes = parser.parseRoutes(code, 'test.js');
            assert.strictEqual(routes[0].middlewares[0].type, 'validation');
        });

        it('should classify middleware as "validation" when name contains "check"', () => {
            const code = `router.post('/users', checkInput, handler);`;
            const routes = parser.parseRoutes(code, 'test.js');
            assert.strictEqual(routes[0].middlewares[0].type, 'validation');
        });

        it('should classify unknown middleware names as "custom"', () => {
            const code = `router.get('/items', rateLimiter, handler);`;
            const routes = parser.parseRoutes(code, 'test.js');
            assert.strictEqual(routes[0].middlewares[0].type, 'custom');
        });

        it('should have no middlewares when only path and handler are provided', () => {
            const code = `router.get('/users', handler);`;
            const routes = parser.parseRoutes(code, 'test.js');
            assert.strictEqual(routes[0].middlewares.length, 0);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Response Information
    // ─────────────────────────────────────────────────────────────────────────

    describe('Response Information', () => {

        it('should extract response with explicit status via res.status().json()', () => {
            const code = `
                router.post('/users', (req, res) => {
                    res.status(201).json({ id: 1 });
                });
            `;
            const routes = parser.parseRoutes(code, 'test.js');
            const created = routes[0].responses.find(r => r.statusCode === 201);
            assert.ok(created, '201 response should be found');
            assert.strictEqual(created!.description, 'Created');
            assert.strictEqual(created!.contentType, 'application/json');
        });

        it('should extract multiple response status codes from one handler', () => {
            const code = `
                router.get('/users/:id', (req, res) => {
                    if (!user) {
                        return res.status(404).json({ message: 'Not found' });
                    }
                    res.status(200).json(user);
                });
            `;
            const routes = parser.parseRoutes(code, 'test.js');
            const statuses = routes[0].responses.map(r => r.statusCode);
            assert.ok(statuses.includes(200));
            assert.ok(statuses.includes(404));
        });

        it('should default to 200 response when res.json() is used without explicit status', () => {
            const code = `
                router.get('/users', (req, res) => {
                    res.json([]);
                });
            `;
            const routes = parser.parseRoutes(code, 'test.js');
            assert.strictEqual(routes[0].responses[0].statusCode, 200);
            assert.strictEqual(routes[0].responses[0].contentType, 'application/json');
        });

        it('should set contentType to text/plain for res.status().send()', () => {
            const code = `
                router.delete('/users/:id', (req, res) => {
                    res.status(204).send();
                });
            `;
            const routes = parser.parseRoutes(code, 'test.js');
            const noContent = routes[0].responses.find(r => r.statusCode === 204);
            assert.ok(noContent);
            assert.strictEqual(noContent!.contentType, 'text/plain');
        });

        it('should set contentType to text/plain for res.send() without status', () => {
            const code = `
                router.get('/ping', (req, res) => {
                    res.send('pong');
                });
            `;
            const routes = parser.parseRoutes(code, 'test.js');
            assert.strictEqual(routes[0].responses[0].contentType, 'text/plain');
        });

        it('should NOT add duplicate responses for the same status code', () => {
            const code = `
                router.get('/items', (req, res) => {
                    res.status(200).json({ a: 1 });
                    res.status(200).json({ b: 2 });
                });
            `;
            const routes = parser.parseRoutes(code, 'test.js');
            const okResponses = routes[0].responses.filter(r => r.statusCode === 200);
            assert.strictEqual(okResponses.length, 1);
        });

        it('should provide a default 200 response even for named handler routes', () => {
            const code = `router.get('/users', getUsers);`;
            const routes = parser.parseRoutes(code, 'test.js');
            assert.strictEqual(routes[0].responses.length, 1);
            assert.strictEqual(routes[0].responses[0].statusCode, 200);
        });

        it('should use the correct description for known status codes', () => {
            const knownCodes: [number, string][] = [
                [200, 'Success'],
                [201, 'Created'],
                [204, 'No Content'],
                [400, 'Bad Request'],
                [401, 'Unauthorized'],
                [403, 'Forbidden'],
                [404, 'Not Found'],
                [500, 'Internal Server Error'],
            ];
            for (const [code, expectedDesc] of knownCodes) {
                const jsCode = `
                    router.get('/test', (req, res) => {
                        res.status(${code}).json({});
                    });
                `;
                const routes = parser.parseRoutes(jsCode, 'test.js');
                const response = routes[0].responses.find(r => r.statusCode === code);
                assert.strictEqual(
                    response?.description,
                    expectedDesc,
                    `Status ${code} should map to "${expectedDesc}"`
                );
            }
        });

        it('should use "Unknown" description for unrecognised status codes', () => {
            const code = `
                router.get('/teapot', (req, res) => {
                    res.status(418).json({ message: "I'm a teapot" });
                });
            `;
            const routes = parser.parseRoutes(code, 'test.js');
            const teapot = routes[0].responses.find(r => r.statusCode === 418);
            assert.strictEqual(teapot!.description, 'Unknown');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Response Schema Extraction
    // ─────────────────────────────────────────────────────────────────────────

    describe('Response Schema Extraction', () => {

        it('should infer object schema from an object literal response', () => {
            const code = `
                router.get('/users', (req, res) => {
                    res.json({ users: [], total: 0 });
                });
            `;
            const routes = parser.parseRoutes(code, 'test.js');
            const schema = routes[0].responses[0].schema;
            assert.ok(schema, 'Schema should be defined');
            assert.strictEqual(schema.type, 'object');
            assert.strictEqual(schema.properties.users.type, 'array');
            assert.strictEqual(schema.properties.total.type, 'number');
        });

        it('should infer string and boolean schema property types', () => {
            const code = `
                router.get('/status', (req, res) => {
                    res.json({ status: 'ok', healthy: true });
                });
            `;
            const routes = parser.parseRoutes(code, 'test.js');
            const schema = routes[0].responses[0].schema;
            assert.strictEqual(schema.properties.status.type, 'string');
            assert.strictEqual(schema.properties.healthy.type, 'boolean');
        });

        it('should infer array schema from an array literal response', () => {
            const code = `
                router.get('/items', (req, res) => {
                    res.json([]);
                });
            `;
            const routes = parser.parseRoutes(code, 'test.js');
            const schema = routes[0].responses[0].schema;
            assert.ok(schema);
            assert.strictEqual(schema.type, 'array');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Handler Name Extraction
    // ─────────────────────────────────────────────────────────────────────────

    describe('Handler Name Extraction', () => {

        it('should record the name for named function reference handlers', () => {
            const code = `router.get('/users', getUsers);`;
            const routes = parser.parseRoutes(code, 'test.js');
            assert.strictEqual(routes[0].handler, 'getUsers');
        });

        it('should mark inline arrow functions as "inline function"', () => {
            const code = `router.get('/users', (req, res) => { res.json([]); });`;
            const routes = parser.parseRoutes(code, 'test.js');
            assert.strictEqual(routes[0].handler, 'inline function');
        });

        it('should mark inline function expressions as "inline function"', () => {
            const code = `router.get('/users', function(req, res) { res.json([]); });`;
            const routes = parser.parseRoutes(code, 'test.js');
            assert.strictEqual(routes[0].handler, 'inline function');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Combined / Integration scenarios
    // ─────────────────────────────────────────────────────────────────────────

    describe('Combined Parameter Extraction', () => {

        it('should combine path, query, and body params on the same route', () => {
            const code = `
                router.put('/users/:id', (req, res) => {
                    const { name, email } = req.body;
                    const lang = req.query.lang;
                    res.json({});
                });
            `;
            const routes = parser.parseRoutes(code, 'test.js');
            const params = routes[0].parameters;

            const pathParams = params.filter(p => p.type === 'path');
            const queryParams = params.filter(p => p.type === 'query');
            const bodyParams = params.filter(p => p.type === 'body');

            assert.strictEqual(pathParams.length, 1);
            assert.strictEqual(pathParams[0].name, 'id');
            assert.strictEqual(queryParams.length, 1);
            assert.strictEqual(queryParams[0].name, 'lang');
            assert.strictEqual(bodyParams.length, 2);
        });

        it('should parse a realistic CRUD router file correctly', () => {
            const code = `
                const express = require('express');
                const router = express.Router();

                router.get('/products', (req, res) => {
                    const page = req.query.page;
                    const limit = req.query.limit;
                    res.json({ products: [], total: 0 });
                });

                router.get('/products/:id', (req, res) => {
                    res.status(200).json({ id: 1 });
                });

                router.post('/products', authMiddleware, validateBody, (req, res) => {
                    const { name, price } = req.body;
                    res.status(201).json({ id: 2, name, price });
                });

                router.put('/products/:id', authMiddleware, (req, res) => {
                    const { name } = req.body;
                    res.status(200).json({ id: 1, name });
                });

                router.delete('/products/:id', authMiddleware, (req, res) => {
                    res.status(204).send();
                });

                module.exports = router;
            `;
            const routes = parser.parseRoutes(code, 'routes/products.js');
            assert.strictEqual(routes.length, 5);

            const getAll = routes[0];
            assert.strictEqual(getAll.method, HttpMethod.GET);
            assert.strictEqual(getAll.path, '/products');
            assert.strictEqual(getAll.parameters.filter(p => p.type === 'query').length, 2);

            const getOne = routes[1];
            assert.strictEqual(getOne.parameters.filter(p => p.type === 'path').length, 1);

            const create = routes[2];
            assert.strictEqual(create.method, HttpMethod.POST);
            assert.strictEqual(create.middlewares.length, 2);
            assert.strictEqual(create.middlewares[0].type, 'auth');
            assert.strictEqual(create.middlewares[1].type, 'validation');
            assert.strictEqual(create.parameters.filter(p => p.type === 'body').length, 2);

            const remove = routes[4];
            assert.strictEqual(remove.method, HttpMethod.DELETE);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Error Handling & Edge Cases
    // ─────────────────────────────────────────────────────────────────────────

    describe('Error Handling & Edge Cases', () => {

        it('should return empty array for empty file content', () => {
            const routes = parser.parseRoutes('', 'empty.js');
            assert.strictEqual(routes.length, 0);
        });

        it('should return empty array for a file with no routes', () => {
            const code = `
                const x = 1;
                function helper() { return 'hello'; }
            `;
            const routes = parser.parseRoutes(code, 'noroutes.js');
            assert.strictEqual(routes.length, 0);
        });

        it('should return empty array for syntactically invalid code', () => {
            const code = `this is not valid javascript ===`;
            const routes = parser.parseRoutes(code, 'broken.js');
            assert.strictEqual(routes.length, 0);
        });

        it('should skip route calls where the path argument is not a string literal', () => {
            const code = `
                router.get(pathVar, handler);
                router.get('/valid', handler);
            `;
            const routes = parser.parseRoutes(code, 'test.js');
            assert.strictEqual(routes.length, 1);
            assert.strictEqual(routes[0].path, '/valid');
        });

        it('should handle TypeScript typed code without errors', () => {
            const code = `
                import express, { Request, Response } from 'express';
                const router = express.Router();

                router.get('/ts-route', (req: Request, res: Response): void => {
                    res.json({ message: 'typed' });
                });
            `;
            const routes = parser.parseRoutes(code, 'routes.ts');
            assert.strictEqual(routes.length, 1);
            assert.strictEqual(routes[0].path, '/ts-route');
        });

        it('should record a numeric line number for each parsed route', () => {
            const code = `
                router.get('/first', handler);
                router.post('/second', handler);
            `;
            const routes = parser.parseRoutes(code, 'test.js');
            routes.forEach(route => {
                assert.strictEqual(
                    typeof route.lineNumber,
                    'number',
                    `lineNumber should be a number, got ${route.lineNumber}`
                );
            });
        });
    });
});