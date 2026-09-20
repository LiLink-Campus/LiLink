import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const { output } = JSON.parse(await readFile(new URL('../../artifacts/e2e/latest.json', import.meta.url), 'utf8'));
const child = spawn('npx', ['playwright', 'show-report', `${output}/report`], { stdio: 'inherit' });
child.on('exit', code => { process.exitCode = code ?? 1; });
