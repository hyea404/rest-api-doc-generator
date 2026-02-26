import * as assert from 'assert';
import * as sinon from 'sinon';
import * as Module from 'module';
import * as fs from 'fs';

// ── Build lightweight mocks for modules unavailable outside VS Code host ──

// --- vscode mock ---
const withProgressStub = sinon.stub();
const showInformationMessageStub = sinon.stub();
const showWarningMessageStub = sinon.stub();

const vscodeMock = {
    workspace: {},
    window: {
        showInformationMessage: showInformationMessageStub,
        showWarningMessage: showWarningMessageStub,
        withProgress: withProgressStub,
    },
    ProgressLocation: { Notification: 15 },
};

// --- ParserService mock ---
const scanAndParseRoutesStub = sinon.stub();
const parseFileStub = sinon.stub();

class MockParserService {
    constructor(_workspaceRoot: string) { }
    scanAndParseRoutes = scanAndParseRoutesStub;
    parseFile = parseFileStub;
}

// --- OpenRouterClient mock ---
const generateDocumentationStub = sinon.stub();

class MockOpenRouterClient {
    constructor(_apiKey: string) { }
    generateDocumentation = generateDocumentationStub;
}

// --- OpenAPIGenerator mock ---
const addRoutesStub = sinon.stub();
const addRouteWithAIDocStub = sinon.stub();
const finalizeDocumentStub = sinon.stub();
const setServerStub = sinon.stub();
const toYAMLStub = sinon.stub();
const toJSONStub = sinon.stub();
const getDocumentStub = sinon.stub();

class MockOpenAPIGenerator {
    constructor(_title?: string, _version?: string, _description?: string) { }
    addRoutes = addRoutesStub;
    addRouteWithAIDoc = addRouteWithAIDocStub;
    finalizeDocument = finalizeDocumentStub;
    setServer = setServerStub;
    toYAML = toYAMLStub;
    toJSON = toJSONStub;
    getDocument = getDocumentStub;
}

// --- ValidationService mock ---
const validateDocumentStub = sinon.stub();
const generateReportStub = sinon.stub();

class MockValidationService {
    validateDocument = validateDocumentStub;
    generateReport = generateReportStub;
}

// --- fs mock (fs.existsSync is non-configurable in Node, so we mock the whole module) ---
const existsSyncStub = sinon.stub().returns(false);
const writeFileStub = sinon.stub().resolves();
const readFileStub = sinon.stub();

const fsMock: any = {
    ...fs,
    existsSync: existsSyncStub,
    promises: {
        ...fs.promises,
        writeFile: writeFileStub,
        readFile: readFileStub,
    },
};

// Intercept require() for modules not available outside the extension host.
// IMPORTANT: fs mock is scoped to the DocumentationService module only to
// prevent leaking into other test files.
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string, ...args: any[]) {
    if (id === 'vscode') { return vscodeMock; }
    if (id === 'fs' && this.filename && this.filename.includes('DocumentationService')) {
        return fsMock;
    }
    const resolved = originalRequire.apply(this, [id, ...args]);
    return resolved;
};

// We need to patch the service's internal imports after the module loads.
// The easiest approach: stub the prototype after import.
import { DocumentationService } from '../../services/DocumentationService';

// ── Helpers ─────────────────────────────────────────────────────────────

function makeSampleRoute(method = 'GET', routePath = '/users') {
    return {
        method,
        path: routePath,
        handler: 'getUsers',
        parameters: [],
        responses: [{ statusCode: 200 }],
        middlewares: [],
        filePath: '/workspace/routes/users.js',
    };
}

function makeScanResult(routes: any[] = [makeSampleRoute()]) {
    return {
        routes,
        totalFiles: 1,
        totalRoutes: routes.length,
        errors: [],
    };
}

// ── Test Suite ───────────────────────────────────────────────────────────

describe('DocumentationService Test Suite', () => {
    let service: DocumentationService;
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        sandbox.stub(console, 'log');
        sandbox.stub(console, 'warn');
        sandbox.stub(console, 'error');

        // Reset all shared stubs
        scanAndParseRoutesStub.reset();
        parseFileStub.reset();
        generateDocumentationStub.reset();
        addRoutesStub.reset();
        addRouteWithAIDocStub.reset();
        finalizeDocumentStub.reset();
        setServerStub.reset();
        toYAMLStub.reset();
        toYAMLStub.returns('openapi: "3.1.0"');
        toJSONStub.reset();
        toJSONStub.returns('{"openapi":"3.1.0"}');
        getDocumentStub.reset();
        getDocumentStub.returns({ openapi: '3.1.0' });
        validateDocumentStub.reset();
        validateDocumentStub.returns({ isValid: true, errors: [], warnings: [] });
        generateReportStub.reset();
        generateReportStub.returns('Validation OK');
        showInformationMessageStub.reset();
        showWarningMessageStub.reset();

        // Reset fs stubs
        existsSyncStub.reset();
        existsSyncStub.returns(false);
        writeFileStub.reset();
        writeFileStub.resolves();
        readFileStub.reset();

        // withProgress: immediately invoke the callback
        withProgressStub.reset();
        withProgressStub.callsFake(async (_opts: any, cb: Function) => {
            const fakeProgress = { report: sinon.stub() };
            const fakeToken = { isCancellationRequested: false };
            return cb(fakeProgress, fakeToken);
        });

        service = new DocumentationService('/workspace', 'sk-test-key');

        // Replace internally-created dependencies with mocks
        (service as any).parserService = new MockParserService('/workspace');
        (service as any).aiClient = new MockOpenRouterClient('sk-test-key');
    });

    afterEach(() => {
        sandbox.restore();
    });

    // ─── generateDocumentation() ───────────────────────────────────

    describe('generateDocumentation()', () => {
        it('should return YAML and JSON file paths on success', async () => {
            scanAndParseRoutesStub.resolves(makeScanResult());
            generateDocumentationStub.resolves('summary: Get users');

            const result = await service.generateDocumentation('My API', '2.0.0');

            assert.strictEqual(result.yamlPath, '/workspace/openapi.yaml');
            assert.strictEqual(result.jsonPath, '/workspace/openapi.json');
        });

        it('should write YAML, JSON, and validation report files', async () => {
            scanAndParseRoutesStub.resolves(makeScanResult());
            generateDocumentationStub.resolves('summary: Get users');

            await service.generateDocumentation();

            // 3 writeFile calls: yaml, json, validation report
            assert.strictEqual(writeFileStub.callCount, 3);
            assert.ok(writeFileStub.calledWith('/workspace/openapi.yaml'));
            assert.ok(writeFileStub.calledWith('/workspace/openapi.json'));
            assert.ok(writeFileStub.calledWith('/workspace/validation-report.txt'));
        });

        it('should throw when no routes are found', async () => {
            scanAndParseRoutesStub.resolves(makeScanResult([]));

            await assert.rejects(
                () => service.generateDocumentation(),
                (err: Error) => err.message === 'No routes found to document',
            );
        });

        it('should use withProgress to show generation progress', async () => {
            scanAndParseRoutesStub.resolves(makeScanResult());
            generateDocumentationStub.resolves('summary: ok');

            await service.generateDocumentation();

            assert.ok(withProgressStub.calledOnce);
        });

        it('should show a warning when validation finds errors', async () => {
            scanAndParseRoutesStub.resolves(makeScanResult());
            generateDocumentationStub.resolves('summary: ok');
            validateDocumentStub.returns({
                isValid: false,
                errors: [{ message: 'Missing info' }],
                warnings: [],
            });

            await service.generateDocumentation();

            assert.ok(showWarningMessageStub.calledOnce);
        });

        it('should still succeed when AI docs for a single route fail', async () => {
            const routes = [makeSampleRoute('GET', '/users'), makeSampleRoute('POST', '/users')];
            scanAndParseRoutesStub.resolves(makeScanResult(routes));
            // First route succeeds, second fails
            generateDocumentationStub.onFirstCall().resolves('summary: ok');
            generateDocumentationStub.onSecondCall().rejects(new Error('AI fail'));

            const result = await service.generateDocumentation();

            assert.ok(result.yamlPath);
            assert.ok(result.jsonPath);
        });

        it('should use default project name and version when not provided', async () => {
            scanAndParseRoutesStub.resolves(makeScanResult());
            generateDocumentationStub.resolves('summary: ok');

            // No args — defaults to 'REST API Documentation' / '1.0.0'
            await service.generateDocumentation();

            // The test implicitly passes if no error. We verify files were written.
            assert.ok(writeFileStub.called);
        });

        it('should abort when the user cancels via the progress token', async () => {
            scanAndParseRoutesStub.resolves(makeScanResult());

            // Simulate cancellation
            withProgressStub.reset();
            withProgressStub.callsFake(async (_opts: any, cb: Function) => {
                const fakeProgress = { report: sinon.stub() };
                const fakeToken = { isCancellationRequested: true };
                return cb(fakeProgress, fakeToken);
            });

            await assert.rejects(
                () => service.generateDocumentation(),
                (err: Error) => err.message === 'Documentation generation cancelled by user',
            );
        });
    });

    // ─── generateForFile() ─────────────────────────────────────────

    describe('generateForFile()', () => {
        it('should return YAML content for a single file', async () => {
            parseFileStub.resolves([makeSampleRoute()]);
            generateDocumentationStub.resolves('summary: ok');
            toYAMLStub.returns('openapi: "3.1.0"\npaths: {}');

            const result = await service.generateForFile('/workspace/routes/users.js');

            assert.ok(result.includes('openapi'));
        });

        it('should throw when no routes are found in the file', async () => {
            parseFileStub.resolves([]);

            await assert.rejects(
                () => service.generateForFile('/workspace/routes/empty.js'),
                (err: Error) => err.message === 'No routes found in file',
            );
        });

        it('should call AI for each route in the file', async () => {
            const routes = [makeSampleRoute('GET', '/a'), makeSampleRoute('POST', '/b')];
            parseFileStub.resolves(routes);
            generateDocumentationStub.resolves('summary: ok');

            await service.generateForFile('/workspace/routes/multi.js');

            assert.strictEqual(generateDocumentationStub.callCount, 2);
        });
    });

    // ─── generateQuick() ───────────────────────────────────────────

    describe('generateQuick()', () => {
        it('should return YAML and JSON paths', async () => {
            scanAndParseRoutesStub.resolves(makeScanResult());

            const result = await service.generateQuick();

            assert.strictEqual(result.yamlPath, '/workspace/openapi.yaml');
            assert.strictEqual(result.jsonPath, '/workspace/openapi.json');
        });

        it('should NOT call the AI client', async () => {
            scanAndParseRoutesStub.resolves(makeScanResult());

            await service.generateQuick();

            assert.ok(generateDocumentationStub.notCalled, 'AI client should not be called');
        });

        it('should not use AI and should write both YAML and JSON files', async () => {
            scanAndParseRoutesStub.resolves(makeScanResult());

            await service.generateQuick();

            // Quick mode must NOT call the AI client
            assert.ok(generateDocumentationStub.notCalled, 'AI should not be used in quick mode');
            // Should write exactly 2 files (YAML + JSON)
            assert.strictEqual(writeFileStub.callCount, 2);
        });

        it('should throw when no routes found', async () => {
            scanAndParseRoutesStub.resolves(makeScanResult([]));

            await assert.rejects(
                () => service.generateQuick(),
                (err: Error) => err.message === 'No routes found',
            );
        });
    });

    // ─── generateForChangedFile() ──────────────────────────────────

    describe('generateForChangedFile()', () => {
        it('should fall back to generateQuick when the changed file has no routes', async () => {
            parseFileStub.resolves([]);
            // generateQuick path
            scanAndParseRoutesStub.resolves(makeScanResult());

            const result = await service.generateForChangedFile('/workspace/routes/empty.js');

            assert.ok(result.yamlPath);
        });

        it('should fall back to full generateDocumentation when no existing doc exists', async () => {
            parseFileStub.resolves([makeSampleRoute()]);
            existsSyncStub.returns(false);

            // Full generation path
            scanAndParseRoutesStub.resolves(makeScanResult());
            generateDocumentationStub.resolves('summary: ok');

            const result = await service.generateForChangedFile('/workspace/routes/users.js');

            assert.ok(result.yamlPath);
        });

        it('should merge AI docs into existing YAML when the file exists', async () => {
            parseFileStub.resolves([makeSampleRoute()]);
            existsSyncStub.withArgs('/workspace/openapi.yaml').returns(true);
            readFileStub.resolves('openapi: "3.1.0"\npaths: {}');
            generateDocumentationStub.resolves('paths:\n  /users:\n    get:\n      summary: ok');

            const result = await service.generateForChangedFile('/workspace/routes/users.js');

            assert.ok(result.yamlPath);
            assert.ok(result.jsonPath);
            // Should write updated YAML + JSON
            assert.strictEqual(writeFileStub.callCount, 2);
        });

        it('should read existing JSON when YAML does not exist', async () => {
            parseFileStub.resolves([makeSampleRoute()]);
            existsSyncStub.withArgs('/workspace/openapi.yaml').returns(false);
            existsSyncStub.withArgs('/workspace/openapi.json').returns(true);
            readFileStub.resolves('{"openapi":"3.1.0","paths":{}}');
            generateDocumentationStub.resolves('paths:\n  /users:\n    get:\n      summary: ok');

            const result = await service.generateForChangedFile('/workspace/routes/users.js');

            assert.ok(result.yamlPath);
        });

        it('should continue when AI generation for a route fails', async () => {
            parseFileStub.resolves([makeSampleRoute()]);
            existsSyncStub.withArgs('/workspace/openapi.yaml').returns(true);
            readFileStub.resolves('openapi: "3.1.0"\npaths: {}');
            generateDocumentationStub.rejects(new Error('AI error'));

            const result = await service.generateForChangedFile('/workspace/routes/users.js');

            // Should still write files even if AI fails
            assert.ok(result.yamlPath);
        });
    });
});
