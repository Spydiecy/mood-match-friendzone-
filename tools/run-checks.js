#!/usr/bin/env node
/**
 * Runs the shared game-rule checks in `tools/check-logic.ts`.
 *
 * The scene itself runs in a QuickJS sandbox, so there is no test runner inside
 * it. But the rule modules (`shared/emotions`, `shared/scoring`, `shared/config`)
 * are deliberately free of engine imports, which means they can be bundled for
 * Node and exercised directly. That is what this does.
 *
 * esbuild ships with the SDK toolchain, so this needs no extra dependency.
 */

const { buildSync } = require('esbuild')
const { execFileSync } = require('child_process')
const { unlinkSync, existsSync } = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const outfile = path.join(root, '.check-logic.cjs')

try {
  buildSync({
    entryPoints: [path.join(root, 'tools', 'check-logic.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    logLevel: 'warning'
  })

  execFileSync(process.execPath, [outfile], { stdio: 'inherit' })
} finally {
  // Never leave the temporary bundle behind.
  if (existsSync(outfile)) unlinkSync(outfile)
}
