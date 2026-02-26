import * as assert from 'assert';
import * as sinon from 'sinon';
import { SecureStorageService } from '../../services/SecureStorageService';

describe('SecureStorageService Test Suite', () => {
    let service: SecureStorageService;
    let sandbox: sinon.SinonSandbox;
    let mockSecrets: {
        store: sinon.SinonStub;
        get: sinon.SinonStub;
        delete: sinon.SinonStub;
    };

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        sandbox.stub(console, 'log');
        sandbox.stub(console, 'warn');
        sandbox.stub(console, 'error');

        mockSecrets = {
            store: sinon.stub(),
            get: sinon.stub(),
            delete: sinon.stub(),
        };

        // Create the service using a fake context
        const fakeContext = { secrets: mockSecrets } as any;
        service = new SecureStorageService(fakeContext);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('storeApiKey()', () => {
        it('should call secrets.store with the correct key and value', async () => {
            mockSecrets.store.resolves();

            await service.storeApiKey('sk-test-key');

            assert.ok(mockSecrets.store.calledOnce);
            assert.strictEqual(mockSecrets.store.firstCall.args[0], 'openrouter_api_key');
            assert.strictEqual(mockSecrets.store.firstCall.args[1], 'sk-test-key');
        });

        it('should throw when secrets.store fails', async () => {
            mockSecrets.store.rejects(new Error('storage error'));

            await assert.rejects(
                () => service.storeApiKey('sk-test-key'),
                (err: Error) => err.message === 'Failed to store API key'
            );
        });
    });

    describe('getApiKey()', () => {
        it('should return the stored API key', async () => {
            mockSecrets.get.resolves('sk-stored-key');

            const result = await service.getApiKey();
            assert.strictEqual(result, 'sk-stored-key');
        });

        it('should return undefined when no key is stored', async () => {
            mockSecrets.get.resolves(undefined);

            const result = await service.getApiKey();
            assert.strictEqual(result, undefined);
        });

        it('should throw when secrets.get fails', async () => {
            mockSecrets.get.rejects(new Error('read error'));

            await assert.rejects(
                () => service.getApiKey(),
                (err: Error) => err.message === 'Failed to retrieve API key'
            );
        });
    });

    describe('deleteApiKey()', () => {
        it('should call secrets.delete with the correct key', async () => {
            mockSecrets.delete.resolves();

            await service.deleteApiKey();

            assert.ok(mockSecrets.delete.calledOnce);
            assert.strictEqual(mockSecrets.delete.firstCall.args[0], 'openrouter_api_key');
        });

        it('should throw when secrets.delete fails', async () => {
            mockSecrets.delete.rejects(new Error('delete error'));

            await assert.rejects(
                () => service.deleteApiKey(),
                (err: Error) => err.message === 'Failed to delete API key'
            );
        });
    });

    describe('hasApiKey()', () => {
        it('should return true when an API key exists', async () => {
            mockSecrets.get.resolves('sk-existing-key');

            const result = await service.hasApiKey();
            assert.strictEqual(result, true);
        });

        it('should return false when no API key exists', async () => {
            mockSecrets.get.resolves(undefined);

            const result = await service.hasApiKey();
            assert.strictEqual(result, false);
        });

        it('should return false when the API key is an empty string', async () => {
            mockSecrets.get.resolves('');

            const result = await service.hasApiKey();
            assert.strictEqual(result, false);
        });
    });
});