import * as assert from 'assert';
import * as sinon from 'sinon';
import axios from 'axios';
import { OpenRouterClient } from '../../services/OpenRouterClient';
import { PromptBuilder } from '../../utils/PromptBuilder';
import { HttpMethod, RouteInfo } from '../../types/RouteInfo';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FAKE_API_KEY = 'sk-or-test-key';

const sampleRoute: RouteInfo = {
    method: HttpMethod.GET,
    path: '/users/:id',
    handler: 'getUser',
    parameters: [{ name: 'id', type: 'path', required: true, dataType: 'string' }],
    responses: [{ statusCode: 200, description: 'Success' }],
    middlewares: [],
    filePath: 'routes/users.js',
};

function makeSuccessResponse(content: string) {
    return {
        status: 200,
        data: { choices: [{ message: { content } }] },
    };
}

function makeAxiosError(status: number, data: any = {}): any {
    const err: any = new Error(`Request failed with status code ${status}`);
    err.isAxiosError = true;
    err.response = { status, data };
    err.request = {};
    return err;
}

function makeNetworkError(): any {
    const err: any = new Error('Network Error');
    err.isAxiosError = true;
    err.response = undefined;
    err.request = {};
    return err;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('OpenRouterClient', () => {

    let sandbox: sinon.SinonSandbox;
    let postStub: sinon.SinonStub;
    let getStub: sinon.SinonStub;

    /**
     * Before each test:
     * 1. Create a fresh sandbox (silences console + stubs axios).
     * 2. Stub axios.create so the client constructor picks up our fake instance.
     * Returns a freshly-constructed OpenRouterClient.
     */
    function makeClient(model?: string): OpenRouterClient {
        postStub = sinon.stub();
        getStub = sinon.stub();
        const fakeInstance = { post: postStub, get: getStub };
        sandbox.stub(axios, 'create').returns(fakeInstance as any);
        return new OpenRouterClient(FAKE_API_KEY, model);
    }

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

        it('should use the default model when none is supplied', () => {
            const client = makeClient();
            assert.strictEqual(client.getModel(), 'google/gemma-3-12b-it:free');
        });

        it('should use a custom model when one is supplied', () => {
            const client = makeClient('meta-llama/llama-3.2-3b-instruct:free');
            assert.strictEqual(client.getModel(), 'meta-llama/llama-3.2-3b-instruct:free');
        });

        it('should call axios.create exactly once during construction', () => {
            makeClient();
            assert.ok((axios.create as sinon.SinonStub).calledOnce);
        });

        it('should configure axios with the correct baseURL', () => {
            makeClient();
            const args = (axios.create as sinon.SinonStub).firstCall.args[0];
            assert.strictEqual(args.baseURL, 'https://openrouter.ai/api/v1');
        });

        it('should configure axios with a Bearer authorization header', () => {
            makeClient();
            const args = (axios.create as sinon.SinonStub).firstCall.args[0];
            assert.strictEqual(args.headers['Authorization'], `Bearer ${FAKE_API_KEY}`);
        });
    });

    // ── setModel / getModel ───────────────────────────────────────────────────

    describe('setModel() / getModel()', () => {

        it('getModel() should return the current model', () => {
            const client = makeClient('google/gemma-3-12b-it:free');
            assert.strictEqual(client.getModel(), 'google/gemma-3-12b-it:free');
        });

        it('setModel() should update the value returned by getModel()', () => {
            const client = makeClient();
            client.setModel('google/gemma-3-27b-it:free');
            assert.strictEqual(client.getModel(), 'google/gemma-3-27b-it:free');
        });

        it('setModel() should accept any string', () => {
            const client = makeClient();
            client.setModel('custom/model-v1');
            assert.strictEqual(client.getModel(), 'custom/model-v1');
        });
    });

    // ── generateDocumentation ─────────────────────────────────────────────────

    describe('generateDocumentation()', () => {

        it('should return extracted YAML on a successful API response', async () => {
            const yaml = `/users/{id}:\n  get:\n    summary: Get user\n    responses:\n      '200':\n        description: Success`;
            const client = makeClient();
            postStub.resolves(makeSuccessResponse(`\`\`\`yaml\n${yaml}\n\`\`\``));

            const result = await client.generateDocumentation(sampleRoute);
            assert.strictEqual(result, yaml);
        });

        it('should POST to /chat/completions exactly once', async () => {
            const client = makeClient();
            postStub.resolves(makeSuccessResponse('summary: ok\nresponses: {}'));

            await client.generateDocumentation(sampleRoute);
            assert.ok(postStub.calledOnce);
            assert.strictEqual(postStub.firstCall.args[0], '/chat/completions');
        });

        it('should include the current model in the request payload', async () => {
            const client = makeClient('google/gemma-3-27b-it:free');
            postStub.resolves(makeSuccessResponse('summary: ok\nresponses: {}'));

            await client.generateDocumentation(sampleRoute);
            assert.strictEqual(postStub.firstCall.args[1].model, 'google/gemma-3-27b-it:free');
        });

        it('should set temperature to 0.2 in the payload', async () => {
            const client = makeClient();
            postStub.resolves(makeSuccessResponse('summary: ok\nresponses: {}'));

            await client.generateDocumentation(sampleRoute);
            assert.strictEqual(postStub.firstCall.args[1].temperature, 0.2);
        });

        it('should set max_tokens to 2000 in the payload', async () => {
            const client = makeClient();
            postStub.resolves(makeSuccessResponse('summary: ok\nresponses: {}'));

            await client.generateDocumentation(sampleRoute);
            assert.strictEqual(postStub.firstCall.args[1].max_tokens, 2000);
        });

        it('should use PromptBuilder.buildRoutePrompt with the route and code snippet', async () => {
            const buildSpy = sandbox.spy(PromptBuilder, 'buildRoutePrompt');
            const client = makeClient();
            postStub.resolves(makeSuccessResponse('summary: ok\nresponses: {}'));

            await client.generateDocumentation(sampleRoute, 'const x = 1;');
            assert.ok(buildSpy.calledOnce);
            assert.strictEqual(buildSpy.firstCall.args[0], sampleRoute);
            assert.strictEqual(buildSpy.firstCall.args[1], 'const x = 1;');
        });

        it('should throw when content is an empty string', async () => {
            const client = makeClient();
            postStub.resolves({ status: 200, data: { choices: [{ message: { content: '' } }] } });

            await assert.rejects(
                () => client.generateDocumentation(sampleRoute),
                (err: Error) => err.message.includes('Empty response from AI model')
            );
        });

        it('should throw when choices array is empty', async () => {
            const client = makeClient();
            postStub.resolves({ status: 200, data: { choices: [] } });

            await assert.rejects(
                () => client.generateDocumentation(sampleRoute),
                (err: Error) => err.message.includes('Empty response from AI model')
            );
        });

        it('should throw the correct message for a 401 error', async () => {
            const client = makeClient();
            sandbox.stub(axios, 'isAxiosError').returns(true);
            postStub.rejects(makeAxiosError(401));

            await assert.rejects(
                () => client.generateDocumentation(sampleRoute),
                (err: Error) => err.message === 'Invalid API key. Please check your OpenRouter API key.'
            );
        });

        it('should throw the correct message for a 429 error', async () => {
            const client = makeClient();
            sandbox.stub(axios, 'isAxiosError').returns(true);
            postStub.rejects(makeAxiosError(429));
            (client as any).sleep = () => Promise.resolve(); // skip delays

            await assert.rejects(
                () => client.generateDocumentation(sampleRoute),
                (err: Error) => err.message === 'Rate limit exceeded. Please try again later.'
            );
        });

        it('should throw the correct message for a 500 error', async () => {
            const client = makeClient();
            sandbox.stub(axios, 'isAxiosError').returns(true);
            postStub.rejects(makeAxiosError(500));
            (client as any).sleep = () => Promise.resolve();

            await assert.rejects(
                () => client.generateDocumentation(sampleRoute),
                (err: Error) => err.message.includes('OpenRouter server error (500)')
            );
        });

        it('should throw a network error message when no response is received', async () => {
            const client = makeClient();
            sandbox.stub(axios, 'isAxiosError').returns(true);
            postStub.rejects(makeNetworkError());

            await assert.rejects(
                () => client.generateDocumentation(sampleRoute),
                (err: Error) => err.message === 'Network error. Please check your internet connection.'
            );
        });
    });

    // ── generateBatchDocumentation ────────────────────────────────────────────

    describe('generateBatchDocumentation()', () => {

        it('should return extracted YAML for multiple routes on success', async () => {
            const yaml = `/users:\n  get:\n    summary: List users\n    responses:\n      '200':\n        description: Success`;
            const client = makeClient();
            postStub.resolves(makeSuccessResponse(`\`\`\`yaml\n${yaml}\n\`\`\``));

            const result = await client.generateBatchDocumentation([sampleRoute]);
            assert.strictEqual(result, yaml);
        });

        it('should POST to /chat/completions exactly once', async () => {
            const client = makeClient();
            postStub.resolves(makeSuccessResponse('summary: ok\nresponses: {}'));

            await client.generateBatchDocumentation([sampleRoute, sampleRoute]);
            assert.ok(postStub.calledOnce);
        });

        it('should set max_tokens to 4000 for batch requests', async () => {
            const client = makeClient();
            postStub.resolves(makeSuccessResponse('summary: ok\nresponses: {}'));

            await client.generateBatchDocumentation([sampleRoute]);
            assert.strictEqual(postStub.firstCall.args[1].max_tokens, 4000);
        });

        it('should use PromptBuilder.buildMultipleRoutesPrompt', async () => {
            const buildSpy = sandbox.spy(PromptBuilder, 'buildMultipleRoutesPrompt');
            const client = makeClient();
            postStub.resolves(makeSuccessResponse('summary: ok\nresponses: {}'));

            const routes = [sampleRoute, sampleRoute];
            await client.generateBatchDocumentation(routes);
            assert.ok(buildSpy.calledOnce);
            assert.deepStrictEqual(buildSpy.firstCall.args[0], routes);
        });

        it('should throw when content is empty', async () => {
            const client = makeClient();
            postStub.resolves({ status: 200, data: { choices: [{ message: { content: '' } }] } });

            await assert.rejects(
                () => client.generateBatchDocumentation([sampleRoute]),
                (err: Error) => err.message.includes('Empty response from AI model')
            );
        });

        it('should throw the correct message on an API error', async () => {
            const client = makeClient();
            sandbox.stub(axios, 'isAxiosError').returns(true);
            postStub.rejects(makeAxiosError(401));

            await assert.rejects(
                () => client.generateBatchDocumentation([sampleRoute]),
                (err: Error) => err.message === 'Invalid API key. Please check your OpenRouter API key.'
            );
        });
    });

    // ── testConnection ────────────────────────────────────────────────────────

    describe('testConnection()', () => {

        it('should return true when the API responds with content', async () => {
            const client = makeClient();
            postStub.resolves(makeSuccessResponse('Hello'));

            assert.strictEqual(await client.testConnection(), true);
        });

        it('should return false when choices array is empty', async () => {
            const client = makeClient();
            postStub.resolves({ status: 200, data: { choices: [] } });

            assert.strictEqual(await client.testConnection(), false);
        });

        it('should return false when message content is null', async () => {
            const client = makeClient();
            postStub.resolves({ status: 200, data: { choices: [{ message: { content: null } }] } });

            assert.strictEqual(await client.testConnection(), false);
        });

        it('should return false (not throw) on a 401 API error', async () => {
            const client = makeClient();
            sandbox.stub(axios, 'isAxiosError').returns(true);
            postStub.rejects(makeAxiosError(401));

            assert.strictEqual(await client.testConnection(), false);
        });

        it('should return false (not throw) on a network error', async () => {
            const client = makeClient();
            sandbox.stub(axios, 'isAxiosError').returns(true);
            postStub.rejects(makeNetworkError());

            assert.strictEqual(await client.testConnection(), false);
        });

        it('should include "Say hello in one word" in the message payload', async () => {
            const client = makeClient();
            postStub.resolves(makeSuccessResponse('Hello'));

            await client.testConnection();
            const payload = postStub.firstCall.args[1];
            assert.ok(payload.messages[0].content.includes('Say hello in one word'));
        });
    });

    // ── getAvailableModels ────────────────────────────────────────────────────

    describe('getAvailableModels()', () => {

        it('should return the API response data on success', async () => {
            const modelsData = { data: [{ id: 'google/gemma-3-12b-it:free' }] };
            const client = makeClient();
            getStub.resolves({ status: 200, data: modelsData });

            const result = await client.getAvailableModels();
            assert.deepStrictEqual(result, modelsData);
        });

        it('should call GET /models', async () => {
            const client = makeClient();
            getStub.resolves({ status: 200, data: {} });

            await client.getAvailableModels();
            assert.ok(getStub.calledOnce);
            assert.strictEqual(getStub.firstCall.args[0], '/models');
        });

        it('should re-throw errors from the API', async () => {
            const client = makeClient();
            getStub.rejects(new Error('forbidden'));

            await assert.rejects(
                () => client.getAvailableModels(),
                (err: Error) => err.message === 'forbidden'
            );
        });
    });

    // ── Retry logic ───────────────────────────────────────────────────────────

    describe('Retry logic', () => {

        it('should retry on 429 and succeed on the next attempt', async () => {
            const yaml = 'summary: ok\nresponses: {}';
            const client = makeClient();
            sandbox.stub(axios, 'isAxiosError').returns(true);
            (client as any).sleep = () => Promise.resolve();

            postStub
                .onFirstCall().rejects(makeAxiosError(429))
                .onSecondCall().resolves(makeSuccessResponse(yaml));

            const result = await client.generateDocumentation(sampleRoute);
            assert.strictEqual(result, yaml);
            assert.ok(postStub.calledTwice, '1 failure + 1 successful retry');
        });

        it('should retry on 500 and succeed on the next attempt', async () => {
            const yaml = 'summary: ok\nresponses: {}';
            const client = makeClient();
            sandbox.stub(axios, 'isAxiosError').returns(true);
            (client as any).sleep = () => Promise.resolve();

            postStub
                .onFirstCall().rejects(makeAxiosError(500))
                .onSecondCall().resolves(makeSuccessResponse(yaml));

            const result = await client.generateDocumentation(sampleRoute);
            assert.strictEqual(result, yaml);
            assert.ok(postStub.calledTwice);
        });

        it('should NOT retry on 401 (non-retryable)', async () => {
            const client = makeClient();
            sandbox.stub(axios, 'isAxiosError').returns(true);
            postStub.rejects(makeAxiosError(401));

            await assert.rejects(() => client.generateDocumentation(sampleRoute));
            assert.ok(postStub.calledOnce, 'Should not retry on 401');
        });

        it('should NOT retry on 400 (non-retryable)', async () => {
            const client = makeClient();
            sandbox.stub(axios, 'isAxiosError').returns(true);
            postStub.rejects(makeAxiosError(400, { error: { message: 'bad input' } }));

            await assert.rejects(() => client.generateDocumentation(sampleRoute));
            assert.ok(postStub.calledOnce);
        });

        it('should exhaust all 3 retries and throw when 429 persists (4 total calls)', async () => {
            const client = makeClient();
            sandbox.stub(axios, 'isAxiosError').returns(true);
            (client as any).sleep = () => Promise.resolve();
            postStub.rejects(makeAxiosError(429));

            await assert.rejects(
                () => client.generateDocumentation(sampleRoute),
                (err: Error) => err.message === 'Rate limit exceeded. Please try again later.'
            );
            // 1 initial + 3 retries = 4 total
            assert.strictEqual(postStub.callCount, 4);
        });
    });

    // ── Error message mapping ─────────────────────────────────────────────────

    describe('Error message mapping', () => {

        const cases: Array<[number, string | RegExp]> = [
            [400, /^Bad Request:/],
            [401, 'Invalid API key. Please check your OpenRouter API key.'],
            [429, 'Rate limit exceeded. Please try again later.'],
            [500, /OpenRouter server error \(500\)/],
            [502, /OpenRouter server error \(502\)/],
            [503, /OpenRouter server error \(503\)/],
            [504, /OpenRouter server error \(504\)/],
        ];

        for (const [status, expected] of cases) {
            it(`should produce the correct error message for HTTP ${status}`, async () => {
                const client = makeClient();
                sandbox.stub(axios, 'isAxiosError').returns(true);
                postStub.rejects(makeAxiosError(status, { error: { message: 'detail' } }));
                (client as any).sleep = () => Promise.resolve();

                await assert.rejects(
                    () => client.generateDocumentation(sampleRoute),
                    (err: Error) => typeof expected === 'string'
                        ? err.message === expected
                        : expected.test(err.message)
                );
            });
        }

        it('should wrap non-Axios errors with "Unexpected error"', async () => {
            const client = makeClient();
            postStub.rejects(new Error('something weird'));

            await assert.rejects(
                () => client.generateDocumentation(sampleRoute),
                (err: Error) => err.message.includes('Unexpected error')
            );
        });
    });
});
