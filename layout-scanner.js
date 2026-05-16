const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.cwd();
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'jarvis-layout.json');

function readFile(filePath) {
  const fullPath = path.join(PROJECT_ROOT, filePath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, 'utf8');
}

function extractViews(htmlContent) {
  const views = [];
  const viewRegex = /class=["']([^"']*\bview-([a-zA-Z0-9_]+)\b[^"']*)["']/g;
  let match;
  while ((match = viewRegex.exec(htmlContent)) !== null) {
    views.push({
      className: match[1],
      name: match[2],
      fullMatch: match[0]
    });
  }
  return [...new Map(views.map(v => [v.name, v])).values()];
}

function extractNavStructure(htmlContent) {
  const nav = [];
  const navRegex = /<nav[^>]*>(.*?)<\/nav>/is;
  const navMatch = navRegex.exec(htmlContent);
  if (navMatch) {
    const linkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/g;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(navMatch[1])) !== null) {
      nav.push({
        href: linkMatch[1],
        text: linkMatch[2].replace(/<[^>]+>/g, '').trim()
      });
    }
  }
  return nav;
}

function extractModals(htmlContent) {
  const modals = [];
  const modalRegex = /class=["']([^"']*\bmodal\b[^"']*)["']/g;
  let match;
  while ((match = modalRegex.exec(htmlContent)) !== null) {
    modals.push(match[1]);
  }
  return [...new Set(modals)];
}

function extractCSSRules(cssContent, selectorPrefix) {
  const rules = [];
  const ruleRegex = new RegExp(`([^{]+${selectorPrefix}[^{]*)\\{([^}]+)\\}`, 'g');
  let match;
  while ((match = ruleRegex.exec(cssContent)) !== null) {
    const selector = match[1].trim();
    const declarations = match[2].trim().split(';').filter(d => d.trim()).map(d => {
      const [prop, ...vals] = d.split(':');
      return { property: prop.trim(), value: vals.join(':').trim() };
    });
    rules.push({ selector, declarations });
  }
  return rules;
}

function extractComponentPatterns(cssContent) {
  const patterns = {
    cards: [],
    buttons: [],
    inputs: [],
    animations: [],
    glows: [],
    glass: []
  };

  // Card patterns
  const cardRegex = /(\.[a-zA-Z0-9_-]+card[a-zA-Z0-9_-]*)\s*\{([^}]+)\}/g;
  let match;
  while ((match = cardRegex.exec(cssContent)) !== null) {
    patterns.cards.push({
      selector: match[1],
      styles: match[2].substring(0, 200)
    });
  }

  // Button patterns
  const btnRegex = /(\.[a-zA-Z0-9_-]*btn[a-zA-Z0-9_-]*)\s*\{([^}]+)\}/g;
  while ((match = btnRegex.exec(cssContent)) !== null) {
    patterns.buttons.push({
      selector: match[1],
      styles: match[2].substring(0, 200)
    });
  }

  // Animation keyframes
  const keyframeRegex = /@keyframes\s+([a-zA-Z0-9_-]+)\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g;
  while ((match = keyframeRegex.exec(cssContent)) !== null) {
    patterns.animations.push({
      name: match[1],
      body: match[2].substring(0, 300).replace(/\s+/g, ' ')
    });
  }

  // Glow patterns (radial-gradient, box-shadow glows)
  const glowRegex = /(radial-gradient[^;]+|box-shadow[^;]*(?:0\s+0\s+\d+px[^;]*))/g;
  while ((match = glowRegex.exec(cssContent)) !== null) {
    patterns.glows.push(match[1].substring(0, 150));
  }

  // Glassmorphism patterns
  const glassRegex = /(backdrop-filter[^;]+|background:\s*rgba?\([^)]+\)[^;]*)/g;
  while ((match = glassRegex.exec(cssContent)) !== null) {
    if (match[1].includes('blur') || match[1].includes('rgba')) {
      patterns.glass.push(match[1].substring(0, 150));
    }
  }

  return patterns;
}

function extractJSModules(jsDir) {
  const modules = [];

  function scan(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const relPath = path.relative(PROJECT_ROOT, fullPath).replace(/\\/g, '/');
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        scan(fullPath);
      } else if (item.endsWith('.js')) {
        const content = fs.readFileSync(fullPath, 'utf8');

        // Extract exported functions/classes
        const exports = [];
        const exportRegex = /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let)\s+([a-zA-Z0-9_$]+)/g;
        let match;
        while ((match = exportRegex.exec(content)) !== null) {
          exports.push(match[1]);
        }

        // Extract DOM selectors
        const selectors = [];
        const selectorRegex = /querySelector(?:All)?\(['"]([^'"]+)['"]\)/g;
        while ((match = selectorRegex.exec(content)) !== null) {
          selectors.push(match[1]);
        }

        // Extract event listeners
        const events = [];
        const eventRegex = /addEventListener\(['"]([^'"]+)['"]/g;
        while ((match = eventRegex.exec(content)) !== null) {
          events.push(match[1]);
        }

        modules.push({
          path: relPath,
          exports: [...new Set(exports)],
          selectors: [...new Set(selectors)].slice(0, 10),
          events: [...new Set(events)],
          hasRouter: content.includes('router') || content.includes('hashchange'),
          hasState: content.includes('state') || content.includes('Proxy') || content.includes('Store'),
          hasAnimations: content.includes('requestAnimationFrame') || content.includes('animate') || content.includes('transition'),
          size: content.length
        });
      }
    }
  }

  if (fs.existsSync(jsDir)) scan(jsDir);
  return modules;
}

function scanLayout() {
  console.log('🔍 Scanning Freedom OS layout...');

  const htmlContent = readFile('index.html');
  const timerHtml = readFile('timer.html');

  if (!htmlContent) {
    console.error('❌ index.html not found');
    return;
  }

  // Read all CSS files
  const cssFiles = {};
  const cssDir = path.join(PROJECT_ROOT, 'css');
  if (fs.existsSync(cssDir)) {
    fs.readdirSync(cssDir).forEach(file => {
      if (file.endsWith('.css')) {
        cssFiles[file] = readFile(`css/${file}`);
      }
    });
  }

  // Build layout map
  const layout = {
    generated: new Date().toISOString(),
    project: 'Freedom OS',

    structure: {
      views: extractViews(htmlContent),
      navigation: extractNavStructure(htmlContent),
      modals: extractModals(htmlContent),
      hasTimerPage: !!timerHtml
    },

    css: {
      files: Object.keys(cssFiles),
      componentPatterns: {},
      allGlows: [],
      allAnimations: []
    },

    js: {
      modules: extractJSModules(path.join(PROJECT_ROOT, 'js'))
    },

    visualSystem: {
      colorProperties: [],
      spacingProperties: [],
      borderProperties: [],
      shadowProperties: []
    }
  };

  // Scan CSS for patterns
  Object.entries(cssFiles).forEach(([filename, content]) => {
    if (!content) return;

    const patterns = extractComponentPatterns(content);
    layout.css.componentPatterns[filename] = patterns;

    // Collect all glows
    patterns.glows.forEach(g => layout.css.allGlows.push({ file: filename, value: g }));

    // Collect all animations
    patterns.animations.forEach(a => layout.css.allAnimations.push({ file: filename, name: a.name }));

    // Extract CSS custom properties
    const varRegex = /--([a-zA-Z0-9_-]+):\s*([^;]+)/g;
    let match;
    while ((match = varRegex.exec(content)) !== null) {
      const propName = match[1];
      const value = match[2].trim();

      if (propName.includes('color')) {
        layout.visualSystem.colorProperties.push({ name: propName, value, file: filename });
      } else if (propName.includes('space')) {
        layout.visualSystem.spacingProperties.push({ name: propName, value, file: filename });
      } else if (propName.includes('border') || propName.includes('radius')) {
        layout.visualSystem.borderProperties.push({ name: propName, value, file: filename });
      } else if (propName.includes('shadow')) {
        layout.visualSystem.shadowProperties.push({ name: propName, value, file: filename });
      }
    }
  });

  // Deduplicate
  layout.css.allGlows = [...new Map(layout.css.allGlows.map(g => [g.value, g])).values()];
  layout.css.allAnimations = [...new Map(layout.css.allAnimations.map(a => [a.name, a])).values()];

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(layout, null, 2));

  console.log(`✅ Layout map generated: ${OUTPUT_FILE}`);
  console.log(`   Views: ${layout.structure.views.length}`);
  console.log(`   Nav items: ${layout.structure.navigation.length}`);
  console.log(`   CSS files: ${Object.keys(cssFiles).length}`);
  console.log(`   JS modules: ${layout.js.modules.length}`);
  console.log(`   Glow patterns: ${layout.css.allGlows.length}`);
  console.log(`   Animations: ${layout.css.allAnimations.length}`);
  console.log(`   CSS vars: ${Object.values(layout.visualSystem).flat().length}`);
}

scanLayout();