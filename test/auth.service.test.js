process.env.MAX_LOGIN_ATTEMPTS = '3';
process.env.LOCKOUT_MINUTES = '15';

const test = require('node:test');
const assert = require('node:assert/strict');
const { patch, restoreAll } = require('./helpers');

const userModel = require('../src/models/user.model');
const password = require('../src/utils/password');
const jwtUtil = require('../src/utils/jwt');
const authService = require('../src/services/auth.service');

test.afterEach(restoreAll);

test('register rejects a weak password and a bad email', async () => {
  await assert.rejects(
    authService.register({ name: 'Ana', email: 'ana@example.com', pass: 'short1' }),
    /8\+/
  );
  await assert.rejects(
    authService.register({ name: 'Ana', email: 'not-an-email', pass: 'GoodPass1' }),
    /valid email/i
  );
});

test('register rejects a duplicate email', async () => {
  patch(userModel, 'findByEmail', async () => ({ id: 1 }));
  await assert.rejects(
    authService.register({ name: 'Ana', email: 'ana@example.com', pass: 'GoodPass1' }),
    /already exists/i
  );
});

test('register hashes the password; JWT carries ONLY { id, role }', async () => {
  patch(userModel, 'findByEmail', async () => null);
  let saved;
  patch(userModel, 'create', async (row) => { saved = row; return 11; });

  const session = await authService.register({
    name: '  Ana  ', email: 'Ana@Example.com', pass: 'GoodPass1',
  });

  assert.notEqual(saved.passwordHash, 'GoodPass1');
  assert.ok(await password.compare('GoodPass1', saved.passwordHash));
  assert.equal(saved.email, 'ana@example.com');
  assert.equal(session.user.name, 'Ana');

  const claims = jwtUtil.verify(session.token);
  assert.deepEqual({ id: claims.id, role: claims.role }, { id: 11, role: 'user' });
  assert.equal(claims.email, undefined);
});

test('login failure increments attempts; the Nth failure locks the account', async () => {
  const hash = await password.hash('GoodPass1');
  const account = {
    id: 5, name: 'Ana', email: 'ana@example.com', password_hash: hash,
    is_active: 1, failed_login_attempts: 0, locked_until: null,
  };
  patch(userModel, 'findByEmail', async () => ({ ...account }));
  let lastLockArg;
  patch(userModel, 'recordFailedLogin', async (_id, lockedUntil) => {
    lastLockArg = lockedUntil;
    account.failed_login_attempts += 1;
  });

  await assert.rejects(authService.loginUser({ email: 'ana@example.com', pass: 'wrong' }), /incorrect/i);
  assert.equal(lastLockArg, null);
  await assert.rejects(authService.loginUser({ email: 'ana@example.com', pass: 'wrong' }), /incorrect/i);
  assert.equal(lastLockArg, null);
  await assert.rejects(authService.loginUser({ email: 'ana@example.com', pass: 'wrong' }), /locked/i);
  assert.ok(lastLockArg instanceof Date && lastLockArg > new Date());
});

test('a locked account is refused even with the CORRECT password', async () => {
  const hash = await password.hash('GoodPass1');
  patch(userModel, 'findByEmail', async () => ({
    id: 5, name: 'Ana', email: 'ana@example.com', password_hash: hash,
    is_active: 1, failed_login_attempts: 3,
    locked_until: new Date(Date.now() + 60 * 1000),
  }));
  await assert.rejects(
    authService.loginUser({ email: 'ana@example.com', pass: 'GoodPass1' }),
    /locked/i
  );
});

test('a successful login resets the failure counter', async () => {
  const hash = await password.hash('GoodPass1');
  patch(userModel, 'findByEmail', async () => ({
    id: 5, name: 'Ana', email: 'ana@example.com', password_hash: hash,
    is_active: 1, failed_login_attempts: 2, locked_until: null,
  }));
  let resetCalled = false;
  patch(userModel, 'resetLoginState', async () => { resetCalled = true; });

  const session = await authService.loginUser({ email: 'ana@example.com', pass: 'GoodPass1' });
  assert.equal(session.user.role, 'user');
  assert.equal(resetCalled, true);
});

test('a deactivated account cannot log in; unknown email gets the generic error', async () => {
  const hash = await password.hash('GoodPass1');
  patch(userModel, 'findByEmail', async () => ({
    id: 5, name: 'Ana', email: 'ana@example.com', password_hash: hash,
    is_active: 0, failed_login_attempts: 0, locked_until: null,
  }));
  await assert.rejects(
    authService.loginUser({ email: 'ana@example.com', pass: 'GoodPass1' }),
    /deactivated/i
  );

  patch(userModel, 'findByEmail', async () => null);
  await assert.rejects(
    authService.loginUser({ email: 'ghost@example.com', pass: 'whatever1' }),
    /incorrect email or password/i
  );
});
