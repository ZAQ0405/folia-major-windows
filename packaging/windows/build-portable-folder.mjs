#!/usr/bin/env node

// Builds a self-contained Windows directory distribution without installing anything into the
// user's machine. The executable and the sibling "音源" directory are intentionally kept next to
// each other so the whole folder can be copied or zipped for sharing.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT_ROOT = path.join(ROOT, 'release-portable');
const APP_ROOT = path.join(OUTPUT_ROOT, 'Folia');
const RESOURCES_ROOT = path.join(APP_ROOT, 'resources');
const APP_RESOURCES = path.join(RESOURCES_ROOT, 'app');
const ELECTRON_DIST = path.join(ROOT, 'node_modules', 'electron', 'dist');

const copyTree = async (source, destination) => {
    await cp(source, destination, { recursive: true, force: true });
};

const copyFile = async (source, destination) => {
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(source, destination, { force: true });
};

const run = (command, args, options = {}) => {
    execFileSync(command, args, { stdio: 'inherit', ...options });
};

await rm(OUTPUT_ROOT, { recursive: true, force: true });
await mkdir(APP_ROOT, { recursive: true });

// Electron's runtime is copied rather than installed. Rename its launcher to the product name.
await copyTree(ELECTRON_DIST, APP_ROOT);
await rm(path.join(APP_ROOT, 'electron.exe'), { force: true });
await copyFile(path.join(ELECTRON_DIST, 'electron.exe'), path.join(APP_ROOT, 'Folia.exe'));

await mkdir(APP_RESOURCES, { recursive: true });
for (const entry of ['dist', 'electron', 'shared']) {
    await copyTree(path.join(ROOT, entry), path.join(APP_RESOURCES, entry));
}
await copyFile(path.join(ROOT, 'package.json'), path.join(APP_RESOURCES, 'package.json'));
await copyFile(path.join(ROOT, 'package-lock.json'), path.join(APP_RESOURCES, 'package-lock.json'));

// Install only production dependencies into the portable app. Electron itself is already the
// runtime copied above, so devDependencies are intentionally omitted from the shareable folder.
if (process.platform === 'win32') {
    run(process.env.ComSpec || 'cmd.exe', [
        '/d',
        '/s',
        '/c',
        'npm',
        'ci',
        '--omit=dev',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
    ], { cwd: APP_RESOURCES });
} else {
    run('npm', [
        'ci',
        '--omit=dev',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
    ], { cwd: APP_RESOURCES });
}

await copyTree(path.join(ROOT, '音源'), path.join(APP_ROOT, '音源'));
await copyFile(
    path.join(ROOT, 'packaging', 'windows', 'README-portable.txt'),
    path.join(APP_ROOT, 'README-便携版.txt'),
);

// Runtime resources expected by Electron main-process bridges.
await copyTree(path.join(ROOT, 'build', 'ffmpeg', 'win-x64'), path.join(RESOURCES_ROOT, 'ffmpeg-audio'));
await copyFile(path.join(ROOT, 'build', 'icon.png'), path.join(RESOURCES_ROOT, 'icon.png'));
await copyFile(path.join(ROOT, 'build', 'trayTemplate.png'), path.join(RESOURCES_ROOT, 'trayTemplate.png'));
await copyFile(path.join(ROOT, 'build', 'trayTemplate@2x.png'), path.join(RESOURCES_ROOT, 'trayTemplate@2x.png'));
await copyFile(
    path.join(ROOT, 'build', 'folia-wallpaper-helper.exe'),
    path.join(RESOURCES_ROOT, 'folia-wallpaper-helper.exe'),
);

const packageInfo = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
await writeFile(
    path.join(APP_ROOT, 'PORTABLE-BUILD.txt'),
    `Folia ${packageInfo.version} Windows x64 portable build\n` +
    'Keep Folia.exe and the 音源 folder together.\n',
    'utf8',
);

console.log(`[portable] ready: ${APP_ROOT}`);
