import test from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import {
  ACCOUNT_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  authenticateLocalAccount,
  loadAccounts,
  normalizeUsername,
  readStoredSession,
  readValidSession,
  registerLocalAccount,
  removeLocalAccount,
  removeStoredSession,
  writeStoredSession,
} from '../src/utils/auth.js'
import { authenticationNavigation } from '../src/utils/authNavigation.js'

class MemoryStorage {
  constructor(entries = {}) {
    this.entries = new Map(Object.entries(entries))
  }

  getItem(key) {
    return this.entries.has(key) ? this.entries.get(key) : null
  }

  setItem(key, value) {
    this.entries.set(key, String(value))
  }

  removeItem(key) {
    this.entries.delete(key)
  }
}

test('registration trims username and stores a salted SHA-256 digest', async () => {
  const storage = new MemoryStorage()
  const result = await registerLocalAccount('  OperatorA  ', 'safe-pass-123', {
    storage,
    cryptoApi: webcrypto,
  })

  assert.equal(result.ok, true)
  assert.equal(result.account.username, 'OperatorA')
  assert.equal(result.account.normalizedUsername, 'operatora')
  assert.match(result.account.salt, /^[0-9a-f]{32}$/)
  assert.match(result.account.passwordHash, /^[0-9a-f]{64}$/)
  assert.equal(
    storage.getItem(ACCOUNT_STORAGE_KEY).includes('safe-pass-123'),
    false,
  )
})

test('username uniqueness and login matching are case-insensitive', async () => {
  const storage = new MemoryStorage()
  await registerLocalAccount('SourceUser', 'safe-pass-123', {
    storage,
    cryptoApi: webcrypto,
  })

  const duplicate = await registerLocalAccount(
    ' sourceuser ',
    'other-pass-456',
    {
      storage,
      cryptoApi: webcrypto,
    },
  )
  const login = await authenticateLocalAccount('SOURCEUSER', 'safe-pass-123', {
    storage,
    cryptoApi: webcrypto,
  })

  assert.deepEqual(duplicate, { ok: false, reason: 'duplicate_username' })
  assert.equal(login.ok, true)
  assert.equal(login.account.username, 'SourceUser')
})

test('login distinguishes missing account from an incorrect password', async () => {
  const storage = new MemoryStorage()
  await registerLocalAccount('operator', 'correct-pass', {
    storage,
    cryptoApi: webcrypto,
  })

  assert.deepEqual(
    await authenticateLocalAccount('missing', 'correct-pass', {
      storage,
      cryptoApi: webcrypto,
    }),
    { ok: false, reason: 'account_not_found' },
  )
  assert.deepEqual(
    await authenticateLocalAccount('operator', 'wrong-pass', {
      storage,
      cryptoApi: webcrypto,
    }),
    { ok: false, reason: 'wrong_password' },
  )
})

test('local account reset removes only the requested account', async () => {
  const storage = new MemoryStorage()
  await registerLocalAccount('OperatorA', 'safe-pass-123', {
    storage,
    cryptoApi: webcrypto,
  })
  await registerLocalAccount('OperatorB', 'safe-pass-456', {
    storage,
    cryptoApi: webcrypto,
  })

  const removed = removeLocalAccount(' operatora ', { storage })
  const missingLogin = await authenticateLocalAccount(
    'OperatorA',
    'safe-pass-123',
    { storage, cryptoApi: webcrypto },
  )
  const retainedLogin = await authenticateLocalAccount(
    'OperatorB',
    'safe-pass-456',
    { storage, cryptoApi: webcrypto },
  )

  assert.equal(removed.ok, true)
  assert.deepEqual(missingLogin, { ok: false, reason: 'account_not_found' })
  assert.equal(retainedLogin.ok, true)
})

test('invalid and corrupted account storage degrades to an empty account list', () => {
  const malformed = new MemoryStorage({ [ACCOUNT_STORAGE_KEY]: '{broken' })
  const invalidShape = new MemoryStorage({
    [ACCOUNT_STORAGE_KEY]: JSON.stringify([{ username: 'unsafe' }]),
  })

  assert.deepEqual(loadAccounts(malformed), { ok: true, accounts: [] })
  assert.deepEqual(loadAccounts(invalidShape), { ok: true, accounts: [] })
  assert.equal(normalizeUsername('  Admin  '), 'admin')
})

test('session storage persists and clears only the login state', () => {
  const storage = new MemoryStorage()
  assert.equal(writeStoredSession('OperatorA', storage), true)
  assert.equal(storage.getItem(SESSION_STORAGE_KEY), 'OperatorA')
  assert.equal(readStoredSession(storage), 'OperatorA')
  assert.equal(removeStoredSession(storage), true)
  assert.equal(readStoredSession(storage), null)
})

test('a session is accepted only while its local account record remains valid', async () => {
  const accountStorage = new MemoryStorage()
  const sessionStorage = new MemoryStorage()
  await registerLocalAccount('OperatorA', 'safe-pass-123', {
    storage: accountStorage,
    cryptoApi: webcrypto,
  })
  writeStoredSession('operatora', sessionStorage)

  assert.equal(readValidSession(sessionStorage, accountStorage), 'operatora')
  accountStorage.setItem(ACCOUNT_STORAGE_KEY, '{broken')
  assert.equal(readValidSession(sessionStorage, accountStorage), null)
  assert.equal(readStoredSession(sessionStorage), null)
})

test('route access redirects guests and keeps authenticated users out of guest pages', () => {
  assert.deepEqual(
    authenticationNavigation(
      {
        fullPath: '/devices?status=fault',
        meta: { requiresAuth: true },
      },
      false,
    ),
    {
      name: 'login',
      query: { redirect: '/devices?status=fault' },
    },
  )
  assert.deepEqual(
    authenticationNavigation(
      { fullPath: '/login', meta: { guestOnly: true } },
      true,
    ),
    { name: 'dashboard' },
  )
  assert.equal(
    authenticationNavigation(
      { fullPath: '/dashboard', meta: { requiresAuth: true } },
      true,
    ),
    true,
  )
})

test('blank usernames and seven-character passwords are rejected without writing accounts', async () => {
  const storage = new MemoryStorage()
  for (const username of ['', '   ', '\t\n']) {
    assert.deepEqual(
      await registerLocalAccount(username, '12345678', { storage }),
      {
        ok: false,
        reason: 'invalid_username',
      },
    )
    assert.deepEqual(
      await authenticateLocalAccount(username, '12345678', { storage }),
      {
        ok: false,
        reason: 'missing_credentials',
      },
    )
  }
  assert.deepEqual(
    await registerLocalAccount('operator', '1234567', { storage }),
    {
      ok: false,
      reason: 'invalid_password',
    },
  )
  assert.equal(storage.getItem(ACCOUNT_STORAGE_KEY), null)
})

test('concurrent registrations retain different accounts and reject case-insensitive duplicates', async () => {
  const storage = new MemoryStorage()
  const options = { storage, cryptoApi: webcrypto }
  const results = await Promise.all([
    registerLocalAccount('OperatorA', '12345678', options),
    registerLocalAccount('OperatorB', '12345678', options),
    registerLocalAccount(' operatora ', '12345678', options),
  ])
  assert.equal(results.filter((result) => result.ok).length, 2)
  assert.equal(
    results.filter((result) => result.reason === 'duplicate_username').length,
    1,
  )
  assert.deepEqual(
    loadAccounts(storage)
      .accounts.map((account) => account.normalizedUsername)
      .sort(),
    ['operatora', 'operatorb'],
  )
})

test('storage denial and crypto failures return explicit errors instead of throwing', async () => {
  const blocked = {
    getItem() {
      throw new Error('denied')
    },
  }
  assert.deepEqual(loadAccounts(blocked), { ok: false, accounts: [] })
  assert.deepEqual(
    await registerLocalAccount('operator', '12345678', { storage: blocked }),
    { ok: false, reason: 'storage_unavailable' },
  )
  assert.deepEqual(
    await authenticateLocalAccount('operator', '12345678', {
      storage: blocked,
    }),
    { ok: false, reason: 'storage_unavailable' },
  )
  const storage = new MemoryStorage()
  const brokenCrypto = {
    getRandomValues() {
      throw new Error('unavailable')
    },
    subtle: webcrypto.subtle,
  }
  assert.deepEqual(
    await registerLocalAccount('operator', '12345678', {
      storage,
      cryptoApi: brokenCrypto,
    }),
    { ok: false, reason: 'crypto_unavailable' },
  )
  const quotaStorage = new MemoryStorage()
  quotaStorage.setItem = () => {
    throw new Error('quota')
  }
  assert.deepEqual(
    await registerLocalAccount('operator', '12345678', {
      storage: quotaStorage,
      cryptoApi: webcrypto,
    }),
    { ok: false, reason: 'storage_unavailable' },
  )
  assert.equal(writeStoredSession('operator', quotaStorage), false)
  assert.equal(readStoredSession(blocked), null)
})

test('corrupt records cannot authenticate and duplicate stored identities are reduced to one', async () => {
  const storage = new MemoryStorage()
  const { account } = await registerLocalAccount('operator', '12345678', {
    storage,
    cryptoApi: webcrypto,
  })
  storage.setItem(
    ACCOUNT_STORAGE_KEY,
    JSON.stringify([
      null,
      42,
      {},
      account,
      account,
      { ...account, salt: null },
    ]),
  )
  assert.equal(loadAccounts(storage).accounts.length, 1)
  assert.equal(
    (
      await authenticateLocalAccount('operator', '12345678', {
        storage,
        cryptoApi: webcrypto,
      })
    ).ok,
    true,
  )
  for (const raw of ['null', '{}', '42', '"text"', '{broken']) {
    storage.setItem(ACCOUNT_STORAGE_KEY, raw)
    assert.deepEqual(
      await authenticateLocalAccount('operator', '12345678', {
        storage,
        cryptoApi: webcrypto,
      }),
      { ok: false, reason: 'account_not_found' },
    )
  }
})

test('every protected business address preserves its full return address', () => {
  for (const path of [
    '/dashboard',
    '/zones',
    '/devices',
    '/scenes',
    '/alerts',
    '/energy',
  ]) {
    const fullPath = `${path}?check=1#section`
    assert.deepEqual(
      authenticationNavigation(
        { fullPath, meta: { requiresAuth: true } },
        false,
      ),
      { name: 'login', query: { redirect: fullPath } },
    )
    assert.equal(
      authenticationNavigation(
        { fullPath, meta: { requiresAuth: true } },
        true,
      ),
      true,
    )
  }
})
