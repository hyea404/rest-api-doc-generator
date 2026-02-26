import * as assert from 'assert';
import * as sinon from 'sinon';
import { SecureStorageService } from '../../services/SecureStorageService';

// ─── Helper ──────────────────────────────────────────────────────────────────

/**
 * Build a fake vscode.ExtensionContext whose `secrets` property
 * is a sinon stub of vscode.SecretStorage.  No real VS Code host required.
 */
function makeContext(overrides?: Partial<{
    store: sinon.SinonStub;
    get: sinon.SinonStub;
    delete: sinon.SinonStub;
}>) {
    const secrets = {
        store: overrides?.store ?? sinon.stub().resolves(),
        get: overrides?.get ?? sinon.stub().resolves(undefined),
        delete: overrides?.delete ?? sinon.stub().resolves(),
        // onDidChange not used by the service but present on the interface
        onDidChange: sinon.stub(),
    };
    return {
        secrets,
        // Minimal shape — service only reads context.secrets
        context: { secrets } as any,
    };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('SecureStorageService', () => {

    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        // Suppress intentional console output produced by the service's
        // error-handling paths so the test runner output stays clean.
        sandbox.stub(console, 'error');
        sandbox.stub(console, 'warn');
        sandbox.stub(console, 'log');
    });

    afterEach(() => {
        sandbox.restore();
    });

    // ── storeApiKey ───────────────────────────────────────────────────────────

    describe('storeApiKey()', () => {

        it('should call secrets.store with the correct key name and value', async () => {
            const { secrets, context } = makeContext();
            const service = new SecureStorageService(context);

            await service.storeApiKey('sk-test-1234');

            assert.ok(secrets.store.calledOnce, 'store should be called once');
            const [storageKey, storedValue] = secrets.store.firstCall.args;
            assert.strictEqual(storageKey, 'openrouter_api_key');
            assert.strictEqual(storedValue, 'sk-test-1234');
        });

        it('should resolve without throwing on success', async () => {
            const { context } = makeContext({ store: sinon.stub().resolves() });
            const service = new SecureStorageService(context);

            await assert.doesNotReject(() => service.storeApiKey('my-key'));
        });

        it('should throw a wrapped Error when secrets.store rejects', async () => {
            const { context } = makeContext({
                store: sinon.stub().rejects(new Error('disk full'))
            });
            const service = new SecureStorageService(context);

            await assert.rejects(
                () => service.storeApiKey('bad-key'),
                (err: Error) => err.message === 'Failed to store API key'
            );
        });

        it('should preserve the public error message regardless of the internal cause', async () => {
            const { context } = makeContext({
                store: sinon.stub().rejects(new Error('access denied'))
            });
            const service = new SecureStorageService(context);

            let thrown: Error | undefined;
            try {
                await service.storeApiKey('x');
            } catch (e: any) {
                thrown = e;
            }
            assert.ok(thrown instanceof Error);
            assert.strictEqual(thrown.message, 'Failed to store API key');
        });
    });

    // ── getApiKey ─────────────────────────────────────────────────────────────

    describe('getApiKey()', () => {

        it('should call secrets.get with the correct storage key', async () => {
            const { secrets, context } = makeContext({ get: sinon.stub().resolves('my-key') });
            const service = new SecureStorageService(context);

            await service.getApiKey();

            assert.ok(secrets.get.calledOnce);
            assert.strictEqual(secrets.get.firstCall.args[0], 'openrouter_api_key');
        });

        it('should return the stored API key when one exists', async () => {
            const { context } = makeContext({ get: sinon.stub().resolves('sk-live-abc') });
            const service = new SecureStorageService(context);

            const result = await service.getApiKey();
            assert.strictEqual(result, 'sk-live-abc');
        });

        it('should return undefined when no key is stored', async () => {
            const { context } = makeContext({ get: sinon.stub().resolves(undefined) });
            const service = new SecureStorageService(context);

            const result = await service.getApiKey();
            assert.strictEqual(result, undefined);
        });

        it('should throw a wrapped Error when secrets.get rejects', async () => {
            const { context } = makeContext({
                get: sinon.stub().rejects(new Error('vault locked'))
            });
            const service = new SecureStorageService(context);

            await assert.rejects(
                () => service.getApiKey(),
                (err: Error) => err.message === 'Failed to retrieve API key'
            );
        });
    });

    // ── deleteApiKey ──────────────────────────────────────────────────────────

    describe('deleteApiKey()', () => {

        it('should call secrets.delete with the correct storage key', async () => {
            const { secrets, context } = makeContext();
            const service = new SecureStorageService(context);

            await service.deleteApiKey();

            assert.ok(secrets.delete.calledOnce);
            assert.strictEqual(secrets.delete.firstCall.args[0], 'openrouter_api_key');
        });

        it('should resolve without throwing on success', async () => {
            const { context } = makeContext({ delete: sinon.stub().resolves() });
            const service = new SecureStorageService(context);

            await assert.doesNotReject(() => service.deleteApiKey());
        });

        it('should throw a wrapped Error when secrets.delete rejects', async () => {
            const { context } = makeContext({
                delete: sinon.stub().rejects(new Error('permission denied'))
            });
            const service = new SecureStorageService(context);

            await assert.rejects(
                () => service.deleteApiKey(),
                (err: Error) => err.message === 'Failed to delete API key'
            );
        });
    });

    // ── hasApiKey ─────────────────────────────────────────────────────────────

    describe('hasApiKey()', () => {

        it('should return true when a non-empty API key is stored', async () => {
            const { context } = makeContext({ get: sinon.stub().resolves('sk-live-xyz') });
            const service = new SecureStorageService(context);

            const result = await service.hasApiKey();
            assert.strictEqual(result, true);
        });

        it('should return false when no key is stored (undefined)', async () => {
            const { context } = makeContext({ get: sinon.stub().resolves(undefined) });
            const service = new SecureStorageService(context);

            const result = await service.hasApiKey();
            assert.strictEqual(result, false);
        });

        it('should return false when the stored key is an empty string', async () => {
            const { context } = makeContext({ get: sinon.stub().resolves('') });
            const service = new SecureStorageService(context);

            const result = await service.hasApiKey();
            assert.strictEqual(result, false);
        });

        it('should delegate internally to getApiKey() and honour its error', async () => {
            const { context } = makeContext({
                get: sinon.stub().rejects(new Error('vault locked'))
            });
            const service = new SecureStorageService(context);

            // hasApiKey calls getApiKey which can throw
            await assert.rejects(
                () => service.hasApiKey(),
                (err: Error) => err.message === 'Failed to retrieve API key'
            );
        });

        it('should return true for a key that is a single whitespace character', async () => {
            // A key of ' ' has length > 0, so hasApiKey considers it present
            const { context } = makeContext({ get: sinon.stub().resolves(' ') });
            const service = new SecureStorageService(context);

            const result = await service.hasApiKey();
            assert.strictEqual(result, true);
        });
    });

    // ── Isolation checks ──────────────────────────────────────────────────────

    describe('Isolation', () => {

        it('should use the same storage key constant across all operations', async () => {
            const storageKey = 'openrouter_api_key';
            const storeStub = sinon.stub().resolves();
            const getStub = sinon.stub().resolves('val');
            const deleteStub = sinon.stub().resolves();
            const { context } = makeContext({ store: storeStub, get: getStub, delete: deleteStub });

            const service = new SecureStorageService(context);
            await service.storeApiKey('x');
            await service.getApiKey();
            await service.deleteApiKey();

            assert.strictEqual(storeStub.firstCall.args[0], storageKey);
            assert.strictEqual(getStub.firstCall.args[0], storageKey);
            assert.strictEqual(deleteStub.firstCall.args[0], storageKey);
        });

        it('should not cross-contaminate between two independent service instances', async () => {
            const getA = sinon.stub().resolves('key-a');
            const getB = sinon.stub().resolves('key-b');
            const { context: ctxA } = makeContext({ get: getA });
            const { context: ctxB } = makeContext({ get: getB });

            const serviceA = new SecureStorageService(ctxA);
            const serviceB = new SecureStorageService(ctxB);

            const resultA = await serviceA.getApiKey();
            const resultB = await serviceB.getApiKey();

            assert.strictEqual(resultA, 'key-a');
            assert.strictEqual(resultB, 'key-b');
        });
    });
});