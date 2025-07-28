#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ExtensionDevServer {
  constructor() {
    this.buildDir = 'extension-build';
    this.isBuilding = false;
    this.buildQueue = false;
  }

  start() {
    console.log('🔧 Starting Octra Wallet Extension Development Server...\n');

    // Initial build
    this.buildExtension();

    // Watch for changes
    this.setupWatchers();

    console.log('👀 Watching for changes...');
    console.log('📁 Extension files: extension-build/');
    console.log('\n🔧 To reload extension in Chrome:');
    console.log('1. Go to chrome://extensions/');
    console.log('2. Click the reload button on Octra Wallet extension');
    console.log('\n💡 Tip: Enable "Auto-reload" in Chrome DevTools for faster development');
  }

  setupWatchers() {
    // Watch extension-specific files
    const extensionFiles = [
      'manifest.json',
      'popup.html',
      'popup.css', 
      'popup.js',
      'background.js',
      'content.js',
      'injected.js'
    ];

    chokidar.watch(extensionFiles, { ignoreInitial: true })
      .on('change', (filePath) => {
        console.log(`📝 Extension file changed: ${filePath}`);
        this.copyExtensionFile(filePath);
      });

    // Watch source files
    chokidar.watch('src/**/*', { ignoreInitial: true })
      .on('change', () => {
        console.log('📝 Source files changed, rebuilding...');
        this.debouncedBuild();
      });

    // Watch icons
    chokidar.watch('icons/**/*', { ignoreInitial: true })
      .on('change', (filePath) => {
        console.log(`🖼️  Icon changed: ${filePath}`);
        this.copyIconFile(filePath);
      });
  }

  debouncedBuild() {
    if (this.isBuilding) {
      this.buildQueue = true;
      return;
    }

    this.buildExtension();
  }

  async buildExtension() {
    if (this.isBuilding) return;
    
    this.isBuilding = true;
    
    try {
      console.log('🔨 Building extension...');
      
      // Build main app
      execSync('npm run build', { stdio: 'pipe' });
      
      // Run extension builder
      const { default: ExtensionBuilder } = await import('./build-extension.js');
      const builder = new ExtensionBuilder();
      await builder.build();
      
      console.log('✅ Extension rebuilt successfully!');
      
    } catch (error) {
      console.error('❌ Build failed:', error.message);
    } finally {
      this.isBuilding = false;
      
      // Check if another build was queued
      if (this.buildQueue) {
        this.buildQueue = false;
        setTimeout(() => this.buildExtension(), 100);
      }
    }
  }

  copyExtensionFile(filePath) {
    try {
      const destPath = path.join(this.buildDir, filePath);
      fs.copyFileSync(filePath, destPath);
      console.log(`✅ Copied: ${filePath}`);
    } catch (error) {
      console.error(`❌ Failed to copy ${filePath}:`, error.message);
    }
  }

  copyIconFile(filePath) {
    try {
      const destPath = path.join(this.buildDir, filePath);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(filePath, destPath);
      console.log(`✅ Copied icon: ${filePath}`);
    } catch (error) {
      console.error(`❌ Failed to copy icon ${filePath}:`, error.message);
    }
  }
}

// Run the dev server
if (import.meta.url === `file://${process.argv[1]}`) {
  const devServer = new ExtensionDevServer();
  devServer.start();
}

export default ExtensionDevServer;