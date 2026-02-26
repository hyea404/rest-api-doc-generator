import * as assert from 'assert';
import { RouteParser } from '../../parsers/RouteParser';
import { HttpMethod } from '../../types/RouteInfo';

suite('RouteParser Test Suite', () => {
    let parser: RouteParser;

    setup(() => {
        parser = new RouteParser();
    });

    test('Should parse simple GET route', () => {
        const code = `
            const express = require('express');
            const router = express.Router();
            
            router.get('/users', async (req, res) => {
                res.json({ users: [] });
            });
        `;

        const routes = parser.parseRoutes(code, 'test.js');
        
        assert.strictEqual(routes.length, 1);
        assert.strictEqual(routes[0].method, HttpMethod.GET);
        assert.strictEqual(routes[0].path, '/users');
    });

    test('Should extract path parameters', () => {
        const code = `
            router.get('/users/:id', handler);
        `;

        const routes = parser.parseRoutes(code, 'test.js');
        
        assert.strictEqual(routes[0].parameters.length, 1);
        assert.strictEqual(routes[0].parameters[0].name, 'id');
        assert.strictEqual(routes[0].parameters[0].type, 'path');
        assert.strictEqual(routes[0].parameters[0].required, true);
    });

    test('Should detect multiple HTTP methods', () => {
        const code = `
            router.get('/test', handler);
            router.post('/test', handler);
            router.put('/test', handler);
            router.delete('/test', handler);
        `;

        const routes = parser.parseRoutes(code, 'test.js');
        
        assert.strictEqual(routes.length, 4);
        assert.strictEqual(routes[0].method, HttpMethod.GET);
        assert.strictEqual(routes[1].method, HttpMethod.POST);
        assert.strictEqual(routes[2].method, HttpMethod.PUT);
        assert.strictEqual(routes[3].method, HttpMethod.DELETE);
    });

    test('Should extract middlewares', () => {
        const code = `
            router.post('/users', authenticate, validate, handler);
        `;

        const routes = parser.parseRoutes(code, 'test.js');
        
        assert.strictEqual(routes[0].middlewares.length, 2);
        assert.strictEqual(routes[0].middlewares[0].name, 'authenticate');
        assert.strictEqual(routes[0].middlewares[1].name, 'validate');
    });

    test('Should handle optional parameters', () => {
        const code = `
            router.get('/posts/:id?', handler);
        `;

        const routes = parser.parseRoutes(code, 'test.js');
        
        assert.strictEqual(routes[0].parameters[0].required, false);
    });
});