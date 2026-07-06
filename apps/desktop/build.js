const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BACKEND_DIR = path.join(ROOT, 'apps', 'backend');
const FRONTEND_DIR = path.join(ROOT, 'apps', 'frontend');
const RESOURCES = path.join(__dirname, 'resources');
const BACKEND_TARGET = path.join(RESOURCES, 'backend');

const BACKEND_DEPS = {
  "@nestjs/common": "^11.0.0",
  "@nestjs/core": "^11.0.0",
  "@nestjs/platform-express": "^11.0.0",
  "@nestjs/serve-static": "^5.0.0",
  "@prisma/client": "^6.6.0",
  "class-transformer": "^0.5.0",
  "class-validator": "^0.14.0",
  "reflect-metadata": "^0.2.0",
  "rxjs": "^7.8.0",
};

function run(cmd, cwd, silent) {
  console.log(`  $ ${cmd}`);
  try {
    return execSync(cmd, { cwd, stdio: silent ? 'pipe' : 'inherit', encoding: 'utf-8' });
  } catch (e) {
    if (!silent) process.exit(1);
    throw e;
  }
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    if (entry === '.pnpm') continue; // skip pnpm virtual store
    if (fs.statSync(srcPath).isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2));
}

async function main() {
  console.log('\n=== Building Dashlet Desktop ===\n');

  // 1. Build the backend
  console.log('[1/4] Building backend...');
  run('npx tsc', BACKEND_DIR);

  // 2. Build the frontend
  console.log('\n[2/4] Building frontend...');
  cleanDir(path.join(BACKEND_DIR, 'public'));
  run('npx vite build', FRONTEND_DIR);

  // Move frontend dist -> backend/public
  const frontendDist = path.join(FRONTEND_DIR, 'dist');
  fs.renameSync(frontendDist, path.join(BACKEND_DIR, 'public'));

  // 3. Create standalone backend in resources
  console.log('\n[3/4] Creating standalone backend bundle...');
  cleanDir(BACKEND_TARGET);
  fs.mkdirSync(BACKEND_TARGET, { recursive: true });

  // Copy compiled dist
  copyRecursive(path.join(BACKEND_DIR, 'dist'), path.join(BACKEND_TARGET, 'dist'));

  // Copy prisma schema + SQLite database
  copyRecursive(path.join(BACKEND_DIR, 'prisma'), path.join(BACKEND_TARGET, 'prisma'));

  // Copy the public folder (frontend build)
  copyRecursive(path.join(BACKEND_DIR, 'public'), path.join(BACKEND_TARGET, 'public'));
  cleanDir(path.join(BACKEND_DIR, 'public'));

  // Create minimal package.json with all production dependencies
  writeJson(path.join(BACKEND_TARGET, 'package.json'), {
    name: 'backend',
    private: true,
    dependencies: BACKEND_DEPS,
  });

  // Install production dependencies (flat node_modules)
  console.log('  Installing production dependencies...');
  run('npm install --production --no-optional --ignore-scripts 2>&1', BACKEND_TARGET, true);

  // 4. Copy Prisma generated client + engine binary
  console.log('\n[4/4] Setting up Prisma...');
  const pnpmStore = path.join(ROOT, 'node_modules', '.pnpm');

  // Find and copy .prisma/client generated files
  for (const entry of fs.readdirSync(pnpmStore)) {
    if (entry.startsWith('@prisma+client@')) {
      const srcClientDir = path.join(pnpmStore, entry, 'node_modules', '.prisma', 'client');
      if (fs.existsSync(srcClientDir)) {
        const targetDir = path.join(BACKEND_TARGET, 'node_modules', '.prisma', 'client');
        fs.mkdirSync(targetDir, { recursive: true });
        copyRecursive(srcClientDir, targetDir);
        console.log('  Copied .prisma/client');

        // Also copy @prisma/client package
        const srcPrismaClient = path.join(pnpmStore, entry, 'node_modules', '@prisma', 'client');
        if (fs.existsSync(srcPrismaClient)) {
          const targetPrismaClient = path.join(BACKEND_TARGET, 'node_modules', '@prisma', 'client');
          fs.mkdirSync(targetPrismaClient, { recursive: true });
          copyRecursive(srcPrismaClient, targetPrismaClient);
        }
      }
      break;
    }
  }

  // Copy @prisma/engines (query engine binary)
  for (const entry of fs.readdirSync(pnpmStore)) {
    if (entry.startsWith('@prisma+engines@')) {
      const srcEngines = path.join(pnpmStore, entry, 'node_modules', '@prisma', 'engines');
      if (fs.existsSync(srcEngines)) {
        const targetEngines = path.join(BACKEND_TARGET, 'node_modules', '@prisma', 'engines');
        fs.mkdirSync(targetEngines, { recursive: true });
        copyRecursive(srcEngines, targetEngines);
        console.log('  Copied @prisma/engines');
      }
      break;
    }
  }

  // Delete .pnpm directory from deployed node_modules if it exists (from pnpm deploy leftovers)
  const pnpmDir = path.join(BACKEND_TARGET, 'node_modules', '.pnpm');
  if (fs.existsSync(pnpmDir)) {
    fs.rmSync(pnpmDir, { recursive: true, force: true });
    console.log('  Removed .pnpm virtual store');
  }

  console.log('\n=== Build complete! ===');
  console.log(`Resources ready at: ${RESOURCES}`);
  console.log('Run `pnpm --filter dashlet-desktop exec npx electron-builder --win portable` to build .exe\n');
}

main().catch((err) => {
  console.error('\nBuild failed:', err);
  process.exit(1);
});
