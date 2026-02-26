import * as assert from 'assert';
import * as sinon from 'sinon';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { ValidationService, ValidationResult } from '../../services/ValidationService';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** Minimal valid OpenAPI 3.0 document (passes the schema validator). */
function makeValidDoc(overrides?: Record<string, any>): any {
    return {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
            '/users': {
                get: {
                    summary: 'List users',
                    responses: {
                        '200': { description: 'OK' },
                    },
                },
            },
        },
        ...overrides,
    };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('ValidationService', () => {

    let sandbox: sinon.SinonSandbox;
    let service: ValidationService;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        sandbox.stub(console, 'log');
        sandbox.stub(console, 'warn');
        sandbox.stub(console, 'error');
        service = new ValidationService();
    });

    afterEach(() => {
        sandbox.restore();
    });

    // ── validateDocument ──────────────────────────────────────────────────────

    describe('validateDocument()', () => {

        it('should return isValid=true for a minimal valid document', () => {
            const result = service.validateDocument(makeValidDoc());
            assert.strictEqual(result.isValid, true);
            assert.strictEqual(result.errors.length, 0);
        });

        it('should return isValid=false when "info" is missing', () => {
            const doc = makeValidDoc();
            delete doc.info;

            const result = service.validateDocument(doc);
            assert.strictEqual(result.isValid, false);
            assert.ok(result.errors.some(e => e.message.includes('info')));
        });

        it('should return an error when info.title is missing', () => {
            const doc = makeValidDoc();
            delete doc.info.title;

            const result = service.validateDocument(doc);
            assert.strictEqual(result.isValid, false);
            assert.ok(result.errors.some(e => e.message.includes('info.title')));
        });

        it('should return an error when info.version is missing', () => {
            const doc = makeValidDoc();
            delete doc.info.version;

            const result = service.validateDocument(doc);
            assert.strictEqual(result.isValid, false);
            assert.ok(result.errors.some(e => e.message.includes('info.version')));
        });

        // ── Paths warnings ───────────────────────────────────────────────────

        it('should warn when paths is empty', () => {
            const doc = makeValidDoc({ paths: {} });
            const result = service.validateDocument(doc);

            assert.ok(result.warnings.some(
                w => w.message.includes('No paths defined')
            ));
        });

        it('should warn when a path does not start with /', () => {
            const doc = makeValidDoc({
                paths: {
                    'users': {
                        get: {
                            summary: 'No leading slash',
                            responses: { '200': { description: 'OK' } },
                        },
                    },
                },
            });
            const result = service.validateDocument(doc);

            assert.ok(result.warnings.some(
                w => w.message.includes('should start with /')
            ));
        });

        // ── Operation validations ────────────────────────────────────────────

        it('should warn when an operation has no summary or description', () => {
            const doc = makeValidDoc({
                paths: {
                    '/items': {
                        get: {
                            responses: { '200': { description: 'OK' } },
                        },
                    },
                },
            });
            const result = service.validateDocument(doc);

            assert.ok(result.warnings.some(
                w => w.message.includes('summary or description')
            ));
        });

        it('should error when an operation has no responses', () => {
            const doc = makeValidDoc({
                paths: {
                    '/items': {
                        get: {
                            summary: 'Get items',
                            responses: {},
                        },
                    },
                },
            });
            const result = service.validateDocument(doc);

            assert.strictEqual(result.isValid, false);
            assert.ok(result.errors.some(
                e => e.message.includes('must have at least one response')
            ));
        });

        it('should warn when no 2xx or default response exists', () => {
            const doc = makeValidDoc({
                paths: {
                    '/items': {
                        get: {
                            summary: 'Get items',
                            responses: { '404': { description: 'Not found' } },
                        },
                    },
                },
            });
            const result = service.validateDocument(doc);

            assert.ok(result.warnings.some(
                w => w.message.includes('success response (2xx)')
            ));
        });

        it('should NOT warn about 2xx when a "default" response exists', () => {
            const doc = makeValidDoc({
                paths: {
                    '/items': {
                        get: {
                            summary: 'Get items',
                            responses: { default: { description: 'Default response' } },
                        },
                    },
                },
            });
            const result = service.validateDocument(doc);

            assert.ok(!result.warnings.some(
                w => w.message.includes('success response (2xx)')
            ));
        });

        // ── Parameter validations ────────────────────────────────────────────

        it('should error when a parameter is missing its name', () => {
            const doc = makeValidDoc({
                paths: {
                    '/items': {
                        get: {
                            summary: 'Get items',
                            parameters: [{ in: 'query', schema: { type: 'string' } }],
                            responses: { '200': { description: 'OK' } },
                        },
                    },
                },
            });
            const result = service.validateDocument(doc);

            assert.strictEqual(result.isValid, false);
            assert.ok(result.errors.some(e => e.message.includes('missing name')));
        });

        it('should error when a parameter is missing "in"', () => {
            const doc = makeValidDoc({
                paths: {
                    '/items': {
                        get: {
                            summary: 'Get items',
                            parameters: [{ name: 'filter', schema: { type: 'string' } }],
                            responses: { '200': { description: 'OK' } },
                        },
                    },
                },
            });
            const result = service.validateDocument(doc);

            assert.strictEqual(result.isValid, false);
            assert.ok(result.errors.some(e => e.message.includes("missing 'in'")));
        });

        it('should error when a parameter has no schema or content', () => {
            const doc = makeValidDoc({
                paths: {
                    '/items': {
                        get: {
                            summary: 'Get items',
                            parameters: [{ name: 'filter', in: 'query' }],
                            responses: { '200': { description: 'OK' } },
                        },
                    },
                },
            });
            const result = service.validateDocument(doc);

            assert.strictEqual(result.isValid, false);
            assert.ok(result.errors.some(e => e.message.includes('schema or content')));
        });

        // ── Tags and components warnings ─────────────────────────────────────

        it('should warn when tags array is empty', () => {
            const doc = makeValidDoc({ tags: [] });
            const result = service.validateDocument(doc);

            assert.ok(result.warnings.some(
                w => w.message.includes('Tags array is empty')
            ));
        });

        it('should warn when components.schemas is empty', () => {
            const doc = makeValidDoc({ components: { schemas: {} } });
            const result = service.validateDocument(doc);

            assert.ok(result.warnings.some(
                w => w.message.includes('No reusable schemas')
            ));
        });

        // ── OpenAPI version warning ──────────────────────────────────────────

        it('should warn when openapi version does not start with 3.', () => {
            const doc = makeValidDoc({ openapi: '2.0' });
            const result = service.validateDocument(doc);

            assert.ok(result.warnings.some(
                w => w.message.includes('3.x')
            ));
        });

        it('should NOT warn when openapi version starts with 3.', () => {
            const result = service.validateDocument(makeValidDoc({ openapi: '3.1.0' }));

            assert.ok(!result.warnings.some(
                w => w.message.includes('3.x')
            ));
        });

        // ── Exception handling ───────────────────────────────────────────────

        it('should catch exceptions and return isValid=false', () => {
            // Force an exception by passing null
            const result = service.validateDocument(null);

            assert.strictEqual(result.isValid, false);
            assert.ok(result.errors.length > 0);
            assert.ok(result.errors.some(e => e.message.includes('Validation exception')));
        });
    });

    // ── validateFile ──────────────────────────────────────────────────────────

    describe('validateFile()', () => {

        it('should validate a YAML file', async () => {
            const doc = makeValidDoc();
            const yamlContent = yaml.dump(doc);
            sandbox.stub(fs.promises, 'readFile').resolves(yamlContent);

            const result = await service.validateFile('/tmp/api.yaml');
            assert.strictEqual(result.isValid, true);
        });

        it('should validate a .yml file', async () => {
            const doc = makeValidDoc();
            const yamlContent = yaml.dump(doc);
            sandbox.stub(fs.promises, 'readFile').resolves(yamlContent);

            const result = await service.validateFile('/tmp/api.yml');
            assert.strictEqual(result.isValid, true);
        });

        it('should validate a JSON file', async () => {
            const doc = makeValidDoc();
            sandbox.stub(fs.promises, 'readFile').resolves(JSON.stringify(doc));

            const result = await service.validateFile('/tmp/api.json');
            assert.strictEqual(result.isValid, true);
        });

        it('should return an error for unsupported file extensions', async () => {
            sandbox.stub(fs.promises, 'readFile').resolves('');

            const result = await service.validateFile('/tmp/api.txt');
            assert.strictEqual(result.isValid, false);
            assert.ok(result.errors.some(e => e.message.includes('Unsupported file format')));
        });

        it('should return an error when the file cannot be read', async () => {
            sandbox.stub(fs.promises, 'readFile').rejects(new Error('ENOENT: no such file'));

            const result = await service.validateFile('/tmp/missing.yaml');
            assert.strictEqual(result.isValid, false);
            assert.ok(result.errors.some(e => e.message.includes('Failed to validate file')));
        });

        it('should return an error for invalid JSON content', async () => {
            sandbox.stub(fs.promises, 'readFile').resolves('{ not valid json }}}');

            const result = await service.validateFile('/tmp/broken.json');
            assert.strictEqual(result.isValid, false);
            assert.ok(result.errors.length > 0);
        });
    });

    // ── generateReport ────────────────────────────────────────────────────────

    describe('generateReport()', () => {

        it('should show VALID status for a valid result', () => {
            const result: ValidationResult = { isValid: true, errors: [], warnings: [] };
            const report = service.generateReport(result);

            assert.ok(report.includes('VALID'));
            assert.ok(report.includes('No errors or warnings'));
        });

        it('should show INVALID status for an invalid result', () => {
            const result: ValidationResult = {
                isValid: false,
                errors: [{ message: 'Something is wrong', path: '/info' }],
                warnings: [],
            };
            const report = service.generateReport(result);

            assert.ok(report.includes('INVALID'));
            assert.ok(report.includes('Something is wrong'));
        });

        it('should list all errors with their paths and keywords', () => {
            const result: ValidationResult = {
                isValid: false,
                errors: [
                    { message: 'Error 1', path: '/a', keyword: 'required' },
                    { message: 'Error 2', path: '/b' },
                ],
                warnings: [],
            };
            const report = service.generateReport(result);

            assert.ok(report.includes('ERRORS (2)'));
            assert.ok(report.includes('Error 1'));
            assert.ok(report.includes('Path: /a'));
            assert.ok(report.includes('Keyword: required'));
            assert.ok(report.includes('Error 2'));
        });

        it('should list all warnings with suggestions', () => {
            const result: ValidationResult = {
                isValid: true,
                errors: [],
                warnings: [
                    { message: 'Warning 1', path: '/paths', suggestion: 'Add more paths' },
                ],
            };
            const report = service.generateReport(result);

            assert.ok(report.includes('WARNINGS (1)'));
            assert.ok(report.includes('Warning 1'));
            assert.ok(report.includes('Suggestion: Add more paths'));
        });

        it('should include the report header and footer', () => {
            const result: ValidationResult = { isValid: true, errors: [], warnings: [] };
            const report = service.generateReport(result);

            assert.ok(report.includes('OPENAPI VALIDATION REPORT'));
            assert.ok(report.includes('='.repeat(60)));
        });

        it('should show the celebration message when there are no errors or warnings', () => {
            const result: ValidationResult = { isValid: true, errors: [], warnings: [] };
            const report = service.generateReport(result);

            assert.ok(report.includes('perfectly valid'));
        });

        it('should NOT show the celebration message when there are errors', () => {
            const result: ValidationResult = {
                isValid: false,
                errors: [{ message: 'Oops' }],
                warnings: [],
            };
            const report = service.generateReport(result);

            assert.ok(!report.includes('perfectly valid'));
        });
    });

    // ── Integration-style: full document validation ──────────────────────────

    describe('Full document validation', () => {

        it('should validate a fully populated document with paths and operations', () => {
            const doc = {
                openapi: '3.0.0',
                info: { title: 'Full API', version: '2.0.0', description: 'A complete API' },
                servers: [{ url: 'https://api.example.com' }],
                paths: {
                    '/users': {
                        get: {
                            summary: 'List users',
                            parameters: [
                                { name: 'page', in: 'query', schema: { type: 'integer' } },
                            ],
                            responses: {
                                '200': { description: 'OK' },
                            },
                        },
                        post: {
                            summary: 'Create user',
                            requestBody: {
                                content: {
                                    'application/json': {
                                        schema: { type: 'object' },
                                    },
                                },
                            },
                            responses: {
                                '201': { description: 'Created' },
                            },
                        },
                    },
                    '/users/{id}': {
                        get: {
                            summary: 'Get single user',
                            parameters: [
                                { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                            ],
                            responses: {
                                '200': { description: 'OK' },
                                '404': { description: 'Not found' },
                            },
                        },
                    },
                },
                tags: [{ name: 'Users', description: 'User endpoints' }],
            };

            const result = service.validateDocument(doc);
            assert.strictEqual(result.isValid, true);
            assert.strictEqual(result.errors.length, 0);
        });

        it('should accumulate multiple errors from different validations', () => {
            const doc = {
                openapi: '3.0.0',
                info: { title: 'Bad API', version: '1.0.0' },
                paths: {
                    '/items': {
                        get: {
                            // no summary
                            parameters: [
                                { /* no name, no in, no schema */ },
                            ],
                            responses: {},
                        },
                    },
                },
            };

            const result = service.validateDocument(doc);
            assert.strictEqual(result.isValid, false);
            // Should have errors for: empty responses, missing param name, missing param.in, missing schema
            assert.ok(result.errors.length >= 3);
        });
    });
});
