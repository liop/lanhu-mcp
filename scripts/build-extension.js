// Build script for Chrome extension - uses esbuild to bundle

import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const srcDir = join(rootDir, 'src', 'extension');
const distDir = join(rootDir, 'extension-dist');

// Ensure dist directory exists
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// Build background script (service worker)
await esbuild.build({
  entryPoints: [join(srcDir, 'background', 'background.ts')],
  bundle: true,
  outfile: join(distDir, 'background.js'),
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: false,
  sourcemap: true,
  external: ['chrome']
});

// Build content script
await esbuild.build({
  entryPoints: [join(srcDir, 'content', 'content.ts')],
  bundle: true,
  outfile: join(distDir, 'content.js'),
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: false,
  sourcemap: true,
  globalName: 'LanhuMCPContent'
});

// Build page-world API interceptor
await esbuild.build({
  entryPoints: [join(srcDir, 'content', 'interceptor.ts')],
  bundle: true,
  outfile: join(distDir, 'interceptor.js'),
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: false,
  sourcemap: true,
  globalName: 'LanhuMCPInterceptor'
});

// Build popup script
await esbuild.build({
  entryPoints: [join(srcDir, 'popup', 'popup.ts')],
  bundle: true,
  outfile: join(distDir, 'popup.js'),
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: false,
  sourcemap: true,
  globalName: 'LanhuMCPPopup'
});

// Copy static files
copyFileSync(join(srcDir, 'manifest.json'), join(distDir, 'manifest.json'));
copyFileSync(join(srcDir, 'popup', 'popup.html'), join(distDir, 'popup.html'));
copyFileSync(join(srcDir, 'popup', 'popup.css'), join(distDir, 'popup.css'));

// Copy icons directory if exists
const iconsSrcDir = join(srcDir, 'icons');
const iconsDistDir = join(distDir, 'icons');
if (existsSync(iconsSrcDir)) {
  if (!existsSync(iconsDistDir)) {
    mkdirSync(iconsDistDir, { recursive: true });
  }
  const iconFiles = readdirSync(iconsSrcDir);
  for (const file of iconFiles) {
    copyFileSync(join(iconsSrcDir, file), join(iconsDistDir, file));
  }
} else {
  // Create placeholder icons
  if (!existsSync(iconsDistDir)) {
    mkdirSync(iconsDistDir, { recursive: true });
  }
  console.log('Note: Icons directory not found. Create icons manually or use placeholder icons.');
}

console.log('Extension built successfully to:', distDir);
console.log('Load the extension from chrome://extensions/');
