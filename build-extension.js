#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ExtensionBuilder {
  constructor() {
    this.distDir = 'dist';
    this.extensionDir = 'extension';
    this.buildDir = 'extension-build';
  }

  async build() {
    console.log('🚀 Building Octra Wallet Chrome Extension...\n');

    try {
      // Step 1: Build the main application
      console.log('📦 Building main application...');
      this.buildMainApp();

      // Step 2: Create extension directory structure
      console.log('📁 Creating extension structure...');
      this.createExtensionStructure();

      // Step 3: Copy extension files
      console.log('📋 Copying extension files...');
      this.copyExtensionFiles();

      // Step 4: Copy built application
      console.log('🔄 Copying built application...');
      this.copyBuiltApp();

      // Step 5: Update manifest for production
      console.log('⚙️  Updating manifest...');
      this.updateManifest();

      // Step 6: Create extension package
      console.log('📦 Creating extension package...');
      this.createPackage();

      console.log('\n✅ Extension build completed successfully!');
      console.log(`📁 Extension files: ${this.buildDir}/`);
      console.log(`📦 Extension package: ${this.buildDir}.zip`);
      console.log('\n🔧 To install in Chrome:');
      console.log('1. Open Chrome and go to chrome://extensions/');
      console.log('2. Enable "Developer mode"');
      console.log('3. Click "Load unpacked" and select the extension-build folder');
      console.log('   OR drag and drop the extension-build.zip file');

    } catch (error) {
      console.error('❌ Build failed:', error.message);
      console.error('Stack trace:', error.stack);
      process.exit(1);
    }
  }

  buildMainApp() {
    try {
      // Check if build:prod script exists, otherwise use build
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const buildScript = packageJson.scripts['build:prod'] ? 'build:prod' : 'build';
      
      console.log(`Running: npm run ${buildScript}`);
      execSync(`npm run ${buildScript}`, { stdio: 'inherit' });
    } catch (error) {
      throw new Error('Failed to build main application');
    }
  }

  createExtensionStructure() {
    // Remove existing build directory
    if (fs.existsSync(this.buildDir)) {
      fs.rmSync(this.buildDir, { recursive: true, force: true });
    }

    // Create build directory
    fs.mkdirSync(this.buildDir, { recursive: true });

    // Create subdirectories
    const dirs = ['icons', 'scripts', 'styles'];
    dirs.forEach(dir => {
      fs.mkdirSync(path.join(this.buildDir, dir), { recursive: true });
    });
  }

  copyExtensionFiles() {
    const extensionFiles = [
      'manifest.json',
      'popup.html',
      'popup.css',
      'popup.js',
      'background.js',
      'content.js',
      'injected.js'
    ];

    extensionFiles.forEach(file => {
      if (fs.existsSync(file)) {
        console.log(`Copying ${file}...`);
        fs.copyFileSync(file, path.join(this.buildDir, file));
      } else {
        console.warn(`Warning: ${file} not found, skipping...`);
      }
    });

    // Copy icons
    if (fs.existsSync('icons')) {
      console.log('Copying icons directory...');
      this.copyDirectory('icons', path.join(this.buildDir, 'icons'));
    } else {
      console.warn('Warning: icons directory not found, skipping...');
    }
  }

  copyBuiltApp() {
    if (!fs.existsSync(this.distDir)) {
      throw new Error('Built application not found. Run npm run build first.');
    }

    console.log(`Copying ${this.distDir} to ${this.buildDir}...`);
    // Copy the entire dist directory contents to extension build
    this.copyDirectory(this.distDir, this.buildDir);
  }

  updateManifest() {
    const manifestPath = path.join(this.buildDir, 'manifest.json');
    
    if (!fs.existsSync(manifestPath)) {
      throw new Error('manifest.json not found in build directory');
    }
    
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // Update version from package.json
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    manifest.version = packageJson.version || '1.0.0';

    // Add production optimizations
    manifest.content_security_policy = {
      extension_pages: "script-src 'self'; object-src 'self';"
    };

    // Update permissions for production
    manifest.host_permissions = [
      "https://octra.network/*",
      "https://octrascan.io/*",
      "https://ons-api.xme.my.id/*"
    ];

    console.log(`Updated manifest version to ${manifest.version}`);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }

  createPackage() {
    try {
      // Create zip package
      console.log('Creating zip package...');
      execSync(`cd ${this.buildDir} && zip -r ../${this.buildDir}.zip .`, { stdio: 'inherit' });
      console.log('✅ Zip package created successfully');
    } catch (error) {
      console.warn('⚠️  Could not create zip package. You can manually zip the extension-build folder.');
      console.warn('Error details:', error.message);
    }
  }

  copyDirectory(src, dest) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDirectory(srcPath, destPath);
      } else {
        // Skip copying certain files that shouldn't be in extension
        if (entry.name.endsWith('.map') || entry.name === '.DS_Store') {
          continue;
        }
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

// Run the builder
if (import.meta.url === `file://${process.argv[1]}`) {
  const builder = new ExtensionBuilder();
  builder.build().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}

export default ExtensionBuilder;