import * as assert from 'assert';
import * as sinon from 'sinon';
import * as Module from 'module';

// ── Mock the 'vscode' module before anything tries to require it ────────
// The real 'vscode' module only exists inside the VS Code extension host.
// We intercept Node's require so that `require('vscode')` returns our mock.

const mockWatchers: Array<{
    onDidChange: sinon.SinonStub;
    onDidCreate: sinon.SinonStub;
    onDidDelete: sinon.SinonStub;
    dispose: sinon.SinonStub;
}> = [];

function createMockWatcher() {
    const watcher = {
        onDidChange: sinon.stub(),
        onDidCreate: sinon.stub(),
        onDidDelete: sinon.stub(),
        dispose: sinon.stub(),
    };
    mockWatchers.push(watcher);
    return watcher;
}

const showInformationMessageStub = sinon.stub();

const vscodeMock = {
    workspace: {
        createFileSystemWatcher: sinon.stub().callsFake(() => createMockWatcher()),
    },
    window: {
        showInformationMessage: showInformationMessageStub,
    },
    RelativePattern: class {
        constructor(public base: string, public pattern: string) { }
    },
};

// Monkey-patch require to intercept 'vscode'
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string, ...args: any[]) {
    if (id === 'vscode') {
        return vscodeMock;
    }
    return originalRequire.apply(this, [id, ...args]);
};

// Now it's safe to import the service – it will get our mock vscode
import { FileWatcherService } from '../../services/FileWatcherService';

describe('FileWatcherService Test Suite', () => {
    let service: FileWatcherService;
    let sandbox: sinon.SinonSandbox;
    let onChangeSpy: sinon.SinonSpy;
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        clock = sinon.useFakeTimers();

        sandbox.stub(console, 'log');
        sandbox.stub(console, 'warn');
        sandbox.stub(console, 'error');

        // Reset shared state
        mockWatchers.length = 0;
        (vscodeMock.workspace.createFileSystemWatcher as sinon.SinonStub).resetHistory();
        showInformationMessageStub.reset();

        onChangeSpy = sinon.spy();
        service = new FileWatcherService('/workspace', onChangeSpy);
    });

    afterEach(() => {
        clock.restore();
        sandbox.restore();
    });

    // ─── constructor ───────────────────────────────────────────────

    describe('constructor', () => {
        it('should initialise with enabled state but no active watchers', () => {
            assert.strictEqual(service.isActive(), false);
        });
    });

    // ─── start() ───────────────────────────────────────────────────

    describe('start()', () => {
        it('should create file system watchers for all 6 route patterns', () => {
            service.start();

            assert.strictEqual(mockWatchers.length, 6);
            assert.strictEqual(
                (vscodeMock.workspace.createFileSystemWatcher as sinon.SinonStub).callCount,
                6,
            );
        });

        it('should register onDidChange, onDidCreate, and onDidDelete on each watcher', () => {
            service.start();

            mockWatchers.forEach((w) => {
                assert.ok(w.onDidChange.calledOnce, 'onDidChange registered');
                assert.ok(w.onDidCreate.calledOnce, 'onDidCreate registered');
                assert.ok(w.onDidDelete.calledOnce, 'onDidDelete registered');
            });
        });

        it('should show an information message to the user', () => {
            service.start();

            assert.ok(showInformationMessageStub.calledOnce);
        });

        it('should not create watchers when the service is disabled', () => {
            service.setEnabled(false);

            // Reset after setEnabled may have altered state
            mockWatchers.length = 0;
            (vscodeMock.workspace.createFileSystemWatcher as sinon.SinonStub).resetHistory();

            service.start();

            assert.strictEqual(mockWatchers.length, 0);
        });
    });

    // ─── stop() ────────────────────────────────────────────────────

    describe('stop()', () => {
        it('should dispose all watchers', () => {
            service.start();
            const refs = [...mockWatchers];

            service.stop();

            refs.forEach((w) => assert.ok(w.dispose.calledOnce, 'watcher disposed'));
        });

        it('should clear any pending debounce timer', () => {
            service.start();

            // Trigger a change so a debounce timer is started
            const handler = mockWatchers[0].onDidChange.firstCall.args[0];
            handler({ fsPath: '/workspace/routes/users.js' });

            service.stop();

            // Advance past debounce period – callback must NOT fire
            clock.tick(3000);
            assert.ok(onChangeSpy.notCalled);
        });

        it('should be safe to call without a prior start()', () => {
            assert.doesNotThrow(() => service.stop());
        });
    });

    // ─── debounce behaviour ────────────────────────────────────────

    describe('debounce behaviour', () => {
        it('should invoke onChange after the default 2 s debounce', () => {
            service.start();

            const handler = mockWatchers[0].onDidChange.firstCall.args[0];
            handler({ fsPath: '/workspace/routes/users.js' });

            clock.tick(1999);
            assert.ok(onChangeSpy.notCalled, 'should not fire before 2 s');

            clock.tick(1);
            assert.ok(onChangeSpy.calledOnce);
            assert.strictEqual(onChangeSpy.firstCall.args[0], '/workspace/routes/users.js');
        });

        it('should reset the debounce timer on rapid successive changes', () => {
            service.start();
            const handler = mockWatchers[0].onDidChange.firstCall.args[0];

            handler({ fsPath: '/workspace/routes/a.js' });
            clock.tick(1000);

            handler({ fsPath: '/workspace/routes/b.js' });
            clock.tick(1000);
            assert.ok(onChangeSpy.notCalled, 'timer was reset — should not fire yet');

            clock.tick(1000);
            assert.ok(onChangeSpy.calledOnce);
            assert.strictEqual(onChangeSpy.firstCall.args[0], '/workspace/routes/b.js');
        });

        it('should respect a custom debounce delay set via setDebounceDelay()', () => {
            service.setDebounceDelay(500);
            service.start();

            const handler = mockWatchers[0].onDidChange.firstCall.args[0];
            handler({ fsPath: '/workspace/routes/users.js' });

            clock.tick(499);
            assert.ok(onChangeSpy.notCalled);

            clock.tick(1);
            assert.ok(onChangeSpy.calledOnce);
        });

        it('should debounce onDidCreate events', () => {
            service.start();

            const handler = mockWatchers[0].onDidCreate.firstCall.args[0];
            handler({ fsPath: '/workspace/routes/new-file.ts' });

            clock.tick(2000);
            assert.ok(onChangeSpy.calledOnce);
            assert.strictEqual(onChangeSpy.firstCall.args[0], '/workspace/routes/new-file.ts');
        });

        it('should debounce onDidDelete events', () => {
            service.start();

            const handler = mockWatchers[0].onDidDelete.firstCall.args[0];
            handler({ fsPath: '/workspace/routes/removed.ts' });

            clock.tick(2000);
            assert.ok(onChangeSpy.calledOnce);
            assert.strictEqual(onChangeSpy.firstCall.args[0], '/workspace/routes/removed.ts');
        });
    });

    // ─── setEnabled() ──────────────────────────────────────────────

    describe('setEnabled()', () => {
        it('should start watchers when set to true', () => {
            service.setEnabled(true);

            assert.strictEqual(mockWatchers.length, 6);
        });

        it('should stop watchers and show a message when set to false', () => {
            service.start();
            const refs = [...mockWatchers];

            service.setEnabled(false);

            refs.forEach((w) => assert.ok(w.dispose.calledOnce));
            // start() shows one message, setEnabled(false) shows another
            assert.strictEqual(showInformationMessageStub.callCount, 2);
        });
    });

    // ─── isActive() ────────────────────────────────────────────────

    describe('isActive()', () => {
        it('should return false before start()', () => {
            assert.strictEqual(service.isActive(), false);
        });

        it('should return true after start()', () => {
            service.start();
            assert.strictEqual(service.isActive(), true);
        });

        it('should return false after stop()', () => {
            service.start();
            service.stop();
            assert.strictEqual(service.isActive(), false);
        });

        it('should return false after being disabled', () => {
            service.start();
            service.setEnabled(false);
            assert.strictEqual(service.isActive(), false);
        });
    });

    // ─── setDebounceDelay() ────────────────────────────────────────

    describe('setDebounceDelay()', () => {
        it('should update the debounce delay for subsequent events', () => {
            service.setDebounceDelay(100);
            service.start();

            const handler = mockWatchers[0].onDidChange.firstCall.args[0];
            handler({ fsPath: '/workspace/routes/users.js' });

            clock.tick(100);
            assert.ok(onChangeSpy.calledOnce);
        });
    });
});
