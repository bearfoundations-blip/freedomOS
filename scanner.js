const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.cwd();
const MANIFEST_PATH = path.join(PROJECT_ROOT, 'jarvis-manifest.json');
const LAYOUT_PATH = path.join(PROJECT_ROOT, 'jarvis-layout.json');

function readFile(relPath) {
  const fullPath = path.join(PROJECT_ROOT, relPath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, 'utf8');
}

function extractJSInfo(content, filePath) {
  const info = {
    moduleName: null, routeName: null, constants: {},
    functions: [], freedomApis: [], selectors: [], events: [],
    dependencies: [], hasRouter: false, hasState: false,
    hasAnimations: false, hasCanvas: false, exports: []
  };

  const registerMatch = content.match(/registerModule\s*\(\s*['"]([^'"]+)['"]/);
  if (registerMatch) info.moduleName = registerMatch[1];

  const routeMatch = content.match(/ROUTE_NAME\s*=\s*['"]([^'"]+)['"]/);
  if (routeMatch) info.routeName = routeMatch[1];

  const moduleMatch = content.match(/MODULE_NAME\s*=\s*['"]([^'"]+)['"]/);
  if (moduleMatch && !info.moduleName) info.moduleName = moduleMatch[1];

  let m;
  const keyConstRegex = /(?:const|let|var)\s+([A-Z][A-Z0-9_$]*)\s*=\s*['"]([^'"]+)['"]/g;
  while ((m = keyConstRegex.exec(content)) !== null) {
    info.constants[m[1]] = m[2].substring(0, 100);
  }

  const arrayConstRegex = /(?:const|let|var)\s+([A-Z][A-Z0-9_$]*)\s*=\s*\[([^\]]{0,200})\]/g;
  while ((m = arrayConstRegex.exec(content)) !== null) {
    const items = m[2].split(',').map(function(s) { return s.trim().replace(/['"]/g, ''); }).filter(Boolean);
    info.constants[m[1]] = items.slice(0, 8);
  }

  const funcRegex = /(?:function\s+([A-Za-z0-9_$]+)|(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?function|(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)/g;
  while ((m = funcRegex.exec(content)) !== null) {
    const name = m[1] || m[2] || m[3];
    if (name && !name.startsWith('_') && name.length > 2) info.functions.push(name);
  }

  const apiRegex = /FreedomOS\.([a-zA-Z0-9_$]+)/g;
  const apiSet = new Set();
  while ((m = apiRegex.exec(content)) !== null) apiSet.add(m[1]);
  info.freedomApis = Array.from(apiSet);

  if (apiSet.has('navigate') || content.includes('router')) info.hasRouter = true;
  if (apiSet.has('mutate') || apiSet.has('get') || apiSet.has('set')) info.hasState = true;
  if (content.includes('requestAnimationFrame') || content.includes('transition')) info.hasAnimations = true;
  if (content.includes('getContext(\'2d\')') || content.includes('getContext("2d")')) info.hasCanvas = true;

  const selectorSet = new Set();
  [ /querySelector\s*\(\s*['"]([^'"]+)['"]/g, /querySelectorAll\s*\(\s*['"]([^'"]+)['"]/g, /getElementById\s*\(\s*['"]([^'"]+)['"]/g ]
    .forEach(function(rx) {
      while ((m = rx.exec(content)) !== null) selectorSet.add(m[1]);
    });
  info.selectors = Array.from(selectorSet).slice(0, 15);

  const eventSet = new Set();
  const eventRegex = /addEventListener\s*\(\s*['"]([^'"]+)['"]/g;
  while ((m = eventRegex.exec(content)) !== null) eventSet.add(m[1]);
  info.events = Array.from(eventSet);

  const exportRegex = /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let)\s+([a-zA-Z0-9_$]+)/g;
  while ((m = exportRegex.exec(content)) !== null) info.exports.push(m[1]);

  if (apiSet.has('toast') || apiSet.has('modal') || apiSet.has('confirm') || apiSet.has('prompt')) {
    info.dependencies.push('js/kernel/ui.js');
  }
  if (apiSet.has('mutate') || apiSet.has('get') || apiSet.has('set') || apiSet.has('registerModule')) {
    info.dependencies.push('js/kernel/core.js');
  }
  if (apiSet.has('on') || apiSet.has('off') || apiSet.has('emit')) {
    info.dependencies.push('js/kernel/events.js');
  }
  if (apiSet.has('navigate')) {
    info.dependencies.push('js/kernel/router.js');
  }

  return info;
}

function extractCSSPatterns(content, filename) {
  const patterns = { cards: [], buttons: [], inputs: [], animations: [], glows: [], glass: [], vars: [] };
  let m;

  const cardRegex = /(\.[a-zA-Z0-9_-]+card[a-zA-Z0-9_-]*)\s*\{([^}]+)\}/g;
  while ((m = cardRegex.exec(content)) !== null) patterns.cards.push({ selector: m[1], file: filename });

  const keyframeRegex = /@keyframes\s+([a-zA-Z0-9_-]+)/g;
  while ((m = keyframeRegex.exec(content)) !== null) patterns.animations.push({ name: m[1], file: filename });

  const glowRegex = /(radial-gradient[^;]+|box-shadow[^;]*(?:0\s+0\s+\d+px[^;]*))/g;
  while ((m = glowRegex.exec(content)) !== null) patterns.glows.push({ value: m[1].substring(0, 150), file: filename });

  const glassRegex = /(backdrop-filter[^;]+|background:\s*rgba?\([^)]+\)[^;]*)/g;
  while ((m = glassRegex.exec(content)) !== null) {
    if (m[1].includes('blur') || m[1].includes('rgba')) patterns.glass.push({ value: m[1].substring(0, 150), file: filename });
  }

  const varRegex = /--([a-zA-Z0-9_-]+):\s*([^;]+)/g;
  while ((m = varRegex.exec(content)) !== null) patterns.vars.push({ name: m[1], value: m[2].trim(), file: filename });

  return patterns;
}

function extractViews(htmlContent) {
  const views = [];
  const viewRegex = /class=["']([^"']*\bview-([a-zA-Z0-9_]+)\b[^"']*)["']/g;
  let m;
  while ((m = viewRegex.exec(htmlContent)) !== null) views.push({ className: m[1], name: m[2] });
  return views.filter(function(v, i, a) { return a.findIndex(function(x) { return x.name === v.name; }) === i; });
}

function extractNav(htmlContent) {
  const nav = [];
  const navMatch = htmlContent.match(/<nav[^>]*>([\s\S]*?)<\/nav>/i);
  if (navMatch) {
    const linkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/g;
    let lm;
    while ((lm = linkRegex.exec(navMatch[1])) !== null) {
      nav.push({ href: lm[1], text: lm[2].replace(/<[^>]+>/g, '').trim() });
    }
  }
  return nav;
}

function auditFile(fileInfo, allFiles, htmlContent) {
  const issues = [];
  const content = fileInfo.preview || '';
  const ext = path.extname(fileInfo.path);

  if (ext === '.js') {
    const hardcodedColors = content.match(/#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|hsl\([^)]+\)/g) || [];
    const brandColors = ['#00d4aa', '#7c3aed', '#08090f', '#0f0f1a', '#e0e0e0', '#8892a0', '#6b7280'];
    hardcodedColors.forEach(function(c) {
      if (!brandColors.includes(c.toLowerCase())) {
        issues.push({ type: 'brand', severity: 'warning', message: 'Hardcoded color ' + c + ' — use CSS var' });
      }
    });

    if ((content.match(/for\s*\(/g) || []).length > 0 && content.includes('querySelector')) {
      issues.push({ type: 'perf', severity: 'warning', message: 'querySelector inside loop — cache DOM refs' });
    }

    const logs = (content.match(/console\.log/g) || []).length;
    if (logs > 3) issues.push({ type: 'quality', severity: 'info', message: logs + ' console.log statements — remove for production' });

    if (fileInfo.lines > 400 && fileInfo.functions.length < 3) {
      issues.push({ type: 'quality', severity: 'warning', message: 'Large file with few functions — consider splitting' });
    }

    if (content.includes('fetch') && !content.includes('catch') && !content.includes('try')) {
      issues.push({ type: 'robustness', severity: 'error', message: 'fetch without error handling' });
    }

    if (content.includes('document.querySelector') && !fileInfo.freedomApis.length && fileInfo.path.startsWith('js/modules/')) {
      issues.push({ type: 'arch', severity: 'warning', message: 'Direct DOM access without FreedomOS kernel APIs' });
    }
  }

  return issues;
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
  let htmlContent = '';

  function scanDir(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const relPath = path.relative(PROJECT_ROOT, fullPath).replace(/\\/g, '/');
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        if (['node_modules', '.git', 'jarvis-ui'].includes(item)) continue;
        scanDir(fullPath);
      } else if (
        (item.endsWith('.js') || item.endsWith('.css') || item.endsWith('.html')) &&
        !item.includes('jarvis') &&
        item !== 'server.js' &&
        item !== 'scanner.js'
      ) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');

        const fileInfo = {
          path: relPath, type: getFileType(relPath),
          size: content.length, lines: lines.length,
          preview: content.substring(0, 800).replace(/\s+/g, ' ').trim(),
          firstLine: lines[0] ? lines[0].trim() : '',
          issues: []
        };

        if (item.endsWith('.js')) {
          const iife = extractJSInfo(content, relPath);
          Object.assign(fileInfo, {
            moduleName: iife.moduleName, routeName: iife.routeName,
            constants: iife.constants, functions: iife.functions.slice(0, 20),
            freedomApis: iife.freedomApis, selectors: iife.selectors,
            events: iife.events, dependencies: iife.dependencies,
            hasRouter: iife.hasRouter, hasState: iife.hasState,
            hasAnimations: iife.hasAnimations, hasCanvas: iife.hasCanvas,
            exports: iife.exports
          });
        }

        if (item === 'index.html') htmlContent = content;

        files.push(fileInfo);
        fileMap[relPath] = fileInfo;
      }
    }
  }

  scanDir(PROJECT_ROOT);

  const dependencies = {};
  files.forEach(function(file) {
    dependencies[file.path] = (file.dependencies || []).map(function(dep) {
      if (dep.startsWith('.')) {
        const resolved = path.join(path.dirname(file.path), dep).replace(/\\/g, '/');
        if (fileMap[resolved]) return resolved;
        if (fileMap[resolved + '.js']) return resolved + '.js';
      }
      if (fileMap[dep]) return dep;
      const withPrefix = 'js/' + dep;
      if (fileMap[withPrefix]) return withPrefix;
      return dep;
    }).filter(function(p) { return fileMap[p] || p.includes('/'); });
  });

  files.forEach(function(f) { f.issues = auditFile(f, files, htmlContent); });

  const cssPatterns = { cards: [], buttons: [], inputs: [], animations: [], glows: [], glass: [], vars: [] };
  files.filter(function(f) { return f.path.endsWith('.css'); }).forEach(function(f) {
    const content = readFile(f.path);
    if (!content) return;
    const p = extractCSSPatterns(content, f.path);
    Object.keys(p).forEach(function(k) { cssPatterns[k].push.apply(cssPatterns[k], p[k]); });
  });

  const layout = {
    generated: new Date().toISOString(), project: 'Freedom OS',
    structure: {
      views: extractViews(htmlContent),
      navigation: extractNav(htmlContent),
      modals: (htmlContent.match(/class=["']([^"']*\bmodal\b[^"']*)["']/g) || []).map(function(m) { return m.replace(/class=["']/, '').replace(/"$/, ''); }),
      hasTimerPage: fs.existsSync(path.join(PROJECT_ROOT, 'timer.html'))
    },
    css: {
      files: files.filter(function(f) { return f.path.endsWith('.css'); }).map(function(f) { return f.path; }),
      componentPatterns: cssPatterns,
      allGlows: cssPatterns.glows.filter(function(g, i, a) { return a.findIndex(function(x) { return x.value === g.value; }) === i; }),
      allAnimations: cssPatterns.animations.filter(function(a, i, arr) { return arr.findIndex(function(x) { return x.name === a.name; }) === i; }),
      allVars: cssPatterns.vars
    },
    js: {
      modules: files.filter(function(f) { return f.moduleName; }).map(function(f) {
        return { name: f.moduleName, path: f.path, route: f.routeName, apis: f.freedomApis, functions: f.functions.slice(0, 10), deps: f.dependencies };
      })
    },
    optimization: {
      totalIssues: files.reduce(function(a, f) { return a + f.issues.length; }, 0),
      filesWithIssues: files.filter(function(f) { return f.issues.length > 0; }).map(function(f) {
        return { path: f.path, count: f.issues.length, issues: f.issues };
      })
    }
  };

  const manifest = {
    generated: new Date().toISOString(), projectRoot: PROJECT_ROOT,
    summary: {
      totalFiles: files.length,
      coreFiles: files.filter(function(f) { return f.type === 'core'; }).length,
      featureModules: files.filter(function(f) { return f.type === 'feature-module'; }).length,
      systemTools: files.filter(function(f) { return f.type === 'system-tool'; }).length,
      stylesheets: files.filter(function(f) { return f.type === 'stylesheet'; }).length,
      templates: files.filter(function(f) { return f.type === 'template'; }).length,
      scripts: files.filter(function(f) { return f.type === 'script'; }).length,
      totalIssues: layout.optimization.totalIssues
    },
    files: files, dependencies: dependencies, fileMap: fileMap
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(LAYOUT_PATH, JSON.stringify(layout, null, 2));

  console.log('✅ Smart manifest: ' + files.length + ' files, ' + layout.optimization.totalIssues + ' issues found');
  console.log('   Core: ' + manifest.summary.coreFiles + ' | Modules: ' + manifest.summary.featureModules + ' | System: ' + manifest.summary.systemTools);
  console.log('   CSS: ' + manifest.summary.stylesheets + ' | HTML: ' + manifest.summary.templates);
  if (layout.optimization.totalIssues > 0) {
    console.log('\n⚠️ Top issues:');
    layout.optimization.filesWithIssues.slice(0, 3).forEach(function(f) {
      console.log('   ' + f.path + ': ' + f.issues.map(function(i) { return i.message; }).join(', '));
    });
  }
}

if (process.argv.includes('--watch')) {
  try {
    const chokidar = require('chokidar');
    chokidar.watch(['js/**/*', 'css/**/*', 'index.html'], {
      ignored: /node_modules|jarvis/,
      persistent: true,
      ignoreInitial: true
    }).on('all', function() {
      console.log('\n🔄 Change detected, rescanning...');
      scanProject();
    });
    console.log('👁️ Watch mode active\n');
  } catch(e) {
    console.log('ℹ️ Install chokidar for watch mode: npm i -D chokidar');
  }
}

scanProject();