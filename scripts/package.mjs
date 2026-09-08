/**
 * Packages the complete project (sources, docs, config, tests — no node_modules
 * or build output) into the-world-is-alive.zip next to the project folder.
 * Usage: npm run package
 */
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const out = resolve(root, 'the-world-is-alive.zip');
if (existsSync(out)) rmSync(out);
const excludes = ['node_modules/*', 'dist/*', '.git/*', 'tests/e2e/output/*', '.env', '*.log', 'the-world-is-alive.zip'];
const cmd = `cd "${root}" && zip -r -q "${out}" . ${excludes.map((e) => `-x "${e}"`).join(' ')}`;
execSync(cmd, { stdio: 'inherit' });
console.log(`Packaged ${basename(out)} → ${out}`);
