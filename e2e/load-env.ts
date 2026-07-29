/**
 * Minimal `.env` reader for the test harness.
 *
 * The app gets its env from Next, which loads `.env` itself. Playwright's
 * global setup and the `scripts/mint-session.ts` CLI run outside Next, so they
 * need their own loader. `@next/env` would do it, but it is CommonJS and
 * Playwright's ESM loader rejects the named import; `dotenv` is not a
 * dependency of this project. Parsing the handful of lines we need is smaller
 * than adding either.
 *
 * Existing `process.env` values win, so `E2E_ROLE=teacher npm run e2e` behaves
 * the way the shell leads you to expect.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

export function loadEnvFile(cwd: string = process.cwd(), file = '.env'): void {
  let raw: string
  try {
    raw = readFileSync(path.join(cwd, file), 'utf8')
  } catch {
    // No .env is not an error here: the values may come from the shell, and the
    // callers report a clear message if a required one is still missing.
    return
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separator = trimmed.indexOf('=')
    if (separator <= 0) continue

    const key = trimmed.slice(0, separator).trim()
    if (key in process.env) continue

    let value = trimmed.slice(separator + 1).trim()
    // Strip one layer of matching quotes, as `.env` writes DATABASE_URL.
    const quote = value[0]
    if (value.length >= 2 && (quote === '"' || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1)
    }

    process.env[key] = value
  }
}
