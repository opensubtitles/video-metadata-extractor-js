#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

// Read version from package.json
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = packageJson.version;

console.log(`Updating version to: ${version}`);

// Update version.ts
const versionTsPath = 'src/version.ts';
const versionTsContent = `export const VERSION = '${version}';\n`;
fs.writeFileSync(versionTsPath, versionTsContent);
console.log(`✅ Updated ${versionTsPath}`);

// Update any other files that might contain version references
const filesToUpdate = [
  // Add more files here if needed
];

filesToUpdate.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    // Replace version patterns - customize regex as needed
    content = content.replace(/("version":\s*")[^"]+(")/g, `$1${version}$2`);
    fs.writeFileSync(file, content);
    console.log(`✅ Updated ${file}`);
  }
});

console.log(`🎉 Version sync complete: ${version}`);