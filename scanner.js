const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.cwd();
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'jarvis-manifest.json');

function extractIIFEInfo(content, filePath) {
  const info = {
    moduleName: null,
    routeName: null,
    constants: {},
    functions: [],
    freedomApis: [],
    selectors: [],
    events: [],
    dependencies: [],
    hasRouter: false,
    hasState: false,
    hasAnimations: false,
    hasCanvas: false
  };

  // Extract FreedomOS.registerModule() name
  const registerMatch = content.match(/registerModule\s*\(\s*['"]([^'"]+)['"]/);
  if (registerMatch) info.moduleName = registerMatch[1];

  // Extract ROUTE_NAME
  const routeMatch = content.match(/ROUTE_NAME\s*=\s*['"]([^'"]+)['"]/);
  if (routeMatch) info.routeName = routeMatch[1];

  // Extract MODULE_NAME
  const moduleMatch = content.match(/MODULE_NAME\s*=\s*['"]([^'"]+)['"]/);
  if (moduleMatch && !info.moduleName) info.moduleName = moduleMatch[1];

  // Extract key constants (TARGET_DATE, HABIT_CATEGORIES, etc.)
  const constPatterns = [
    /(?:const|let|var)\s+([A-Z][A-Z0-9_$]*)\s*=\s*([^;\n]+)/g,
    /(?:const|let|var)\s+([a-z][a-zA-Z0-9_$]*)\s*=\s*\[([^\]]+)\]/g
  ];

  let match;
  const keyConstRegex = /(?:const|let|var)\s+([A-Z][A-Z0-9_$]*)\s*=\s*['"]([^'"]+)['"]/g;
  while ((match = keyConstRegex.exec(content)) !== null) {
    info.constants[match[1]] = match[2].substring(0, 100);
  }

  // Extract array constants like HABIT_CATEGORIES, PROJECT_MODELS
  const arrayConstRegex = /(?:const|let|var)\s+([A-Z][A-Z0-9_$]*)\s*=\s*\[([^\]]{0,200})\]/g;
  while ((match = arrayConstRegex.exec(content)) !== null) {
    const items = match[2].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
    info.constants[match[1]] = items.slice(0, 8);
  }

  // Extract function names
  const funcRegex = /(?:function\s+([A-Za-z0-9_$]+)|(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?function|(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)/g;
  while ((match = funcRegex.exec(content)) !== null) {
    const name = match[1] || match[2] || match[3];
    if (name && !name.startsWith('_') && name.length > 2) {
      info.functions.push(name);
    }
  }

  // Extract FreedomOS.* API calls
  const apiRegex = /FreedomOS\.([a-zA-Z0-9_$]+)/g;
  const apiSet = new Set();
  while ((match = apiRegex.exec(content)) !== null) {
    apiSet.add(match[1]);
  }
  info.freedomApis = [...apiSet];

  // Detect capabilities from APIs
  if (apiSet.has('navigate') || content.includes('router')) info.hasRouter = true;
  if (apiSet.has('mutate') || apiSet.has('get') || apiSet.has('set')) info.hasState = true;
  if (content.includes('requestAnimationFrame') || content.includes('transition') || content.includes('animation')) info.hasAnimations = true;
  if (content.includes('getContext(\'2d\')') || content.includes('getContext("2d")')) info.hasCanvas = true;

  // Extract DOM selectors
  const selectorPatterns = [
    /querySelector\s*\(\s*['"]([^'"]+)['"]/g,
    /querySelectorAll\s*\(\s*['"]([^'"]+)['"]/g,
    /getElementById\s*\(\s*['"]([^'"]+)['"]/g
  ];
  const selectorSet = new Set();
  selectorPatterns.forEach(regex => {
    let m;
    while ((m = regex.exec(content)) !== null) {
      selectorSet.add(m[1]);
    }
  });
  info.selectors = [...selectorSet].slice(0, 15);

  // Extract event listeners
  const eventRegex = /addEventListener\s*\(\s*['"]([^'"]+)['"]/g;
  const eventSet = new Set();
  while ((match = eventRegex.exec(content)) !== null) {
    eventSet.add(match[1]);
  }
  info.events = [...eventSet];

  // Extract dependencies from comments
  const dependsMatch = content.match(/Depends:\s*([^\n]+)/);
  if (dependsMatch) {
    const depList = dependsMatch[1].split(/,|and/).map(s => s.trim().replace(/\.js/g, '.js'));
    info.dependencies = depList.filter(d => d.includes('/') || d.includes('.js'));
  }

  // Infer dependencies from FreedomOS API usage
  if (apiSet.has('toast') || apiSet.has('modal') || apiSet.has('confirm') || apiSet.has('prompt')) {
    if (!info.dependencies.includes('js/kernel/ui.js')) info.dependencies.push('js/kernel/ui.js');
  }
  if (apiSet.has('mutate') || apiSet.has('get') || apiSet.has('set') || apiSet.has('registerModule')) {
    if (!info.dependencies.includes('js/kernel/core.js')) info.dependencies.push('js/kernel/core.js');
  }
  if (apiSet.has('on') || apiSet.has('off') || apiSet.has('emit')) {
    if (!info.dependencies.includes('js/kernel/events.js')) info.dependencies.push('js/kernel/events.js');
  }
  if (apiSet.has('navigate')) {
    if (!info.dependencies.includes('js/kernel/router.js')) info.dependencies.push('js/kernel/router.js');
  }

  return info;
}

function getFileType(filePath) {
  const ext = path.extname(filePath);
  const dir = path.dirname(filePath);

  if (ext === '.css') return 'stylesheet';
  if (ext === '.html') return 'template';
  if (dir.includes('kernel')) return 'core';
  if (dir.includes('modules')) return 'feature-module';
  if (dir.includes('system')) return 'system-tool';
  return 'script';
}

function scanProject() {
  const files = [];
  const fileMap = {};

  function scanDir(dir) {
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const relPath = path.relative(PROJECT_ROOT, fullPath).replace(/\\/g, '/');
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        if (item === 'node_modules' || item === '.git' || item === 'jarvis-ui') continue;
        scanDir(fullPath);
      } else if (
        (item.endsWith('.js') || item.endsWith('.css') || item.endsWith('.html')) &&
        !item.includes('jarvis') &&
        item !== 'server.js' &&
        item !== 'scanner.js' &&
        item !== 'layout-scanner.js'
      ) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');

        const fileInfo = {
          path: relPath,
          type: getFileType(relPath),
          size: content.length,
          lines: lines.length,
          preview: content.substring(0, 800).replace(/\s+/g, ' ').trim(),
          firstLine: lines[0]?.trim() || ''
        };

        // Rich extraction for JS files
        if (item.endsWith('.js')) {
          const iife = extractIIFEInfo(content, relPath);
          Object.assign(fileInfo, {
            moduleName: iife.moduleName,
            routeName: iife.routeName,
            constants: iife.constants,
            functions: iife.functions.slice(0, 20),
            freedomApis: iife.freedomApis,
            selectors: iife.selectors,
            events: iife.events,
            dependencies: iife.dependencies,
            hasRouter: iife.hasRouter,
            hasState: iife.hasState,
            hasAnimations: iife.hasAnimations,
            hasCanvas: iife.hasCanvas
          });
        } else {
          fileInfo.dependencies = [];
        }

        files.push(fileInfo);
        fileMap[fileInfo.path] = fileInfo;
      }
    }
  }

  scanDir(PROJECT_ROOT);

  // Build dependency graph
  const dependencies = {};
  files.forEach(file => {
    dependencies[file.path] = (file.dependencies || []).map(dep => {
      // Try to resolve relative paths
      if (dep.startsWith('.')) {
        const resolved = path.join(path.dirname(file.path), dep).replace(/\\/g, '/');
        if (fileMap[resolved]) return resolved;
        const withJs = resolved + '.js';
        if (fileMap[withJs]) return withJs;
      }
      // Try direct match
      if (fileMap[dep]) return dep;
      // Try with js/ prefix
      const withPrefix = 'js/' + dep;
      if (fileMap[withPrefix]) return withPrefix;
      return dep;
    }).filter(p => fileMap[p] || p.includes('/'));
  });

  const manifest = {
    generated: new Date().toISOString(),
    projectRoot: PROJECT_ROOT,
    summary: {
      totalFiles: files.length,
      coreFiles: files.filter(f => f.type === 'core').length,
      featureModules: files.filter(f => f.type === 'feature-module').length,
      systemTools: files.filter(f => f.type === 'system-tool').length,
      stylesheets: files.filter(f => f.type === 'stylesheet').length,
      templates: files.filter(f => f.type === 'template').length,
      scripts: files.filter(f => f.type === 'script').length
    },
    files,
    dependencies,
    fileMap
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));
  console.log(`✅ JARVIS manifest generated: ${OUTPUT_FILE}`);
  console.log(`📊 Found ${files.length} files`);
  console.log(`   Core: ${manifest.summary.coreFiles}`);
  console.log(`   Modules: ${manifest.summary.featureModules}`);
  console.log(`   System: ${manifest.summary.systemTools}`);
  console.log(`   CSS: ${manifest.summary.stylesheets}`);
  console.log(`   HTML: ${manifest.summary.templates}`);

  // Show a sample extraction
  const sample = files.find(f => f.moduleName);
  if (sample) {
    console.log(`\n🔍 Sample extraction (${sample.path}):`);
    console.log(`   Module: ${sample.moduleName}`);
    console.log(`   Route: ${sample.routeName || 'none'}`);
    console.log(`   APIs: ${sample.freedomApis?.slice(0, 6).join(', ')}${(sample.freedomApis?.length > 6) ? '...' : ''}`);
    console.log(`   Functions: ${sample.functions?.slice(0, 4).join(', ')}${(sample.functions?.length > 4) ? '...' : ''}`);
    console.log(`   Constants: ${Object.keys(sample.constants || {}).slice(0, 3).join(', ')}`);
    console.log(`   Deps: ${sample.dependencies?.slice(0, 3).join(', ') || 'none'}`);
  }
}

scanProject();