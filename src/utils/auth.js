export const ACCOUNT_STORAGE_KEY = 'parking-lighting-accounts-v1'
export const SESSION_STORAGE_KEY = 'parking-lighting-session'

function getBrowserStorage(name) {
  try {
    return globalThis[name] ?? null
  } catch {
    return null
  }
}

function isValidAccount(account) {
  return (
    account !== null &&
    typeof account === 'object' &&
    typeof account.username === 'string' &&
    account.username.trim() === account.username &&
    account.username.length > 0 &&
    account.username.length <= 30 &&
    typeof account.normalizedUsername === 'string' &&
    account.normalizedUsername === normalizeUsername(account.username) &&
    typeof account.salt === 'string' &&
    typeof account.passwordHash === 'string' &&
    /^[0-9a-f]{32}$/i.test(account.salt) &&
    /^[0-9a-f]{64}$/i.test(account.passwordHash)
  )
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  )
}

function secureCrypto(cryptoApi = globalThis.crypto) {
  if (!cryptoApi?.subtle || typeof cryptoApi.getRandomValues !== 'function')
    return null
  return cryptoApi
}

export function normalizeUsername(username) {
  return typeof username === 'string'
    ? username.trim().toLocaleLowerCase('zh-CN')
    : ''
}

export function loadAccounts(storage = getBrowserStorage('localStorage')) {
  if (!storage) return { ok: false, accounts: [] }
  let raw
  try {
    raw = storage.getItem(ACCOUNT_STORAGE_KEY)
  } catch {
    return { ok: false, accounts: [] }
  }
  try {
    if (!raw) return { ok: true, accounts: [] }
    const parsed = JSON.parse(raw)
    return {
      ok: true,
      accounts: Array.isArray(parsed)
        ? parsed.filter(
            (account, index) =>
              isValidAccount(account) &&
              parsed.findIndex(
                (candidate) =>
                  isValidAccount(candidate) &&
                  candidate.normalizedUsername === account.normalizedUsername,
              ) === index,
          )
        : [],
    }
  } catch {
    return { ok: true, accounts: [] }
  }
}

export async function hashPassword(password, salt, cryptoApi) {
  const provider = secureCrypto(cryptoApi)
  if (!provider) throw new Error('Web Crypto API is unavailable')
  const payload = new TextEncoder().encode(`${salt}:${password}`)
  const digest = await provider.subtle.digest('SHA-256', payload)
  return bytesToHex(new Uint8Array(digest))
}

export async function registerLocalAccount(
  username,
  password,
  {
    storage = getBrowserStorage('localStorage'),
    cryptoApi = globalThis.crypto,
  } = {},
) {
  const displayUsername = typeof username === 'string' ? username.trim() : ''
  const normalizedUsername = normalizeUsername(displayUsername)
  if (!displayUsername || displayUsername.length > 30)
    return { ok: false, reason: 'invalid_username' }
  if (typeof password !== 'string' || password.length < 8)
    return { ok: false, reason: 'invalid_password' }

  const loaded = loadAccounts(storage)
  if (!loaded.ok) return { ok: false, reason: 'storage_unavailable' }
  if (
    loaded.accounts.some(
      (account) => account.normalizedUsername === normalizedUsername,
    )
  ) {
    return { ok: false, reason: 'duplicate_username' }
  }

  const provider = secureCrypto(cryptoApi)
  if (!provider) return { ok: false, reason: 'crypto_unavailable' }
  let account
  try {
    const saltBytes = new Uint8Array(16)
    provider.getRandomValues(saltBytes)
    const salt = bytesToHex(saltBytes)
    account = {
      username: displayUsername,
      normalizedUsername,
      salt,
      passwordHash: await hashPassword(password, salt, provider),
    }
  } catch {
    return { ok: false, reason: 'crypto_unavailable' }
  }

  // Digest calculation is asynchronous: re-read before the synchronous commit.
  const latest = loadAccounts(storage)
  if (!latest.ok) return { ok: false, reason: 'storage_unavailable' }
  if (
    latest.accounts.some(
      (item) => item.normalizedUsername === normalizedUsername,
    )
  )
    return { ok: false, reason: 'duplicate_username' }
  try {
    storage.setItem(
      ACCOUNT_STORAGE_KEY,
      JSON.stringify([...latest.accounts, account]),
    )
  } catch {
    return { ok: false, reason: 'storage_unavailable' }
  }
  return { ok: true, account }
}

export async function authenticateLocalAccount(
  username,
  password,
  {
    storage = getBrowserStorage('localStorage'),
    cryptoApi = globalThis.crypto,
  } = {},
) {
  const normalizedUsername = normalizeUsername(username)
  if (!normalizedUsername || typeof password !== 'string' || !password)
    return { ok: false, reason: 'missing_credentials' }

  const loaded = loadAccounts(storage)
  if (!loaded.ok) return { ok: false, reason: 'storage_unavailable' }
  const account = loaded.accounts.find(
    (item) => item.normalizedUsername === normalizedUsername,
  )
  if (!account) return { ok: false, reason: 'account_not_found' }

  try {
    const passwordHash = await hashPassword(password, account.salt, cryptoApi)
    if (passwordHash !== account.passwordHash)
      return { ok: false, reason: 'wrong_password' }
  } catch {
    return { ok: false, reason: 'crypto_unavailable' }
  }
  return { ok: true, account }
}

export function removeLocalAccount(
  username,
  { storage = getBrowserStorage('localStorage') } = {},
) {
  const normalizedUsername = normalizeUsername(username)
  if (!normalizedUsername) return { ok: false, reason: 'invalid_username' }

  const loaded = loadAccounts(storage)
  if (!loaded.ok) return { ok: false, reason: 'storage_unavailable' }
  const account = loaded.accounts.find(
    (item) => item.normalizedUsername === normalizedUsername,
  )
  if (!account) return { ok: false, reason: 'account_not_found' }

  try {
    storage.setItem(
      ACCOUNT_STORAGE_KEY,
      JSON.stringify(
        loaded.accounts.filter(
          (item) => item.normalizedUsername !== normalizedUsername,
        ),
      ),
    )
  } catch {
    return { ok: false, reason: 'storage_unavailable' }
  }
  return { ok: true, account }
}

export function readStoredSession(
  storage = getBrowserStorage('sessionStorage'),
) {
  if (!storage) return null
  try {
    const username = storage.getItem(SESSION_STORAGE_KEY)
    if (typeof username !== 'string') return null
    const trimmed = username.trim()
    return trimmed && trimmed.length <= 30 ? trimmed : null
  } catch {
    return null
  }
}

export function readValidSession(
  sessionStorage = getBrowserStorage('sessionStorage'),
  accountStorage = getBrowserStorage('localStorage'),
) {
  const username = readStoredSession(sessionStorage)
  if (!username) return null
  const loaded = loadAccounts(accountStorage)
  const hasAccount =
    loaded.ok &&
    loaded.accounts.some(
      (account) => account.normalizedUsername === normalizeUsername(username),
    )
  if (hasAccount) return username
  removeStoredSession(sessionStorage)
  return null
}

export function writeStoredSession(
  username,
  storage = getBrowserStorage('sessionStorage'),
) {
  if (!storage) return false
  try {
    storage.setItem(SESSION_STORAGE_KEY, username)
    return true
  } catch {
    return false
  }
}

export function removeStoredSession(
  storage = getBrowserStorage('sessionStorage'),
) {
  if (!storage) return false
  try {
    storage.removeItem(SESSION_STORAGE_KEY)
    return true
  } catch {
    return false
  }
}
