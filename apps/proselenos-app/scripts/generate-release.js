const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get short git hash (matches Vercel/Render deployment logs)
const gitHash = execSync('git rev-parse --short HEAD').toString().trim();

// Generate release.ts for About pages
const releaseContent = `// Auto-generated at build time - do not edit manually
export const RELEASE_HASH = '${gitHash}';
`;
const releasePath = path.join(__dirname, '../src/generated/release.ts');
fs.mkdirSync(path.dirname(releasePath), { recursive: true });
fs.writeFileSync(releasePath, releaseContent);
console.log('Generated release.ts with hash:', gitHash);
