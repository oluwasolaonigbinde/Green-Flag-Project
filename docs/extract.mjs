#!/usr/bin/env node

/**
 * ============================================================
 *  FIGMA DESIGN EXTRACTOR
 * ============================================================
 *
 *  Pulls everything from a Figma file that an AI coding agent
 *  needs to produce pixel-perfect frontend code:
 *
 *    1. Design tokens  — exact colors, fonts, spacing, radii
 *    2. Components      — every reusable component the designer defined
 *    3. Screen tree     — full node hierarchy per page/screen with
 *                         all layout & style properties
 *    4. Screenshots     — PNG exports of every top-level frame
 *
 *  ── HOW TO USE ──────────────────────────────────────────────
 *
 *  STEP 1: Get a Figma Personal Access Token
 *    → Go to figma.com → click your avatar (top-left)
 *    → Settings → Security tab → "Generate new token"
 *    → Give it a name, select "File content: Read" scope
 *    → Copy the token (you only see it once)
 *
 *  STEP 2: Get your Figma file key
 *    → Open your Figma file in the browser
 *    → The URL looks like: figma.com/design/ABC123xyz/My-Design
 *    → "ABC123xyz" is your file key
 *
 *  STEP 3: Run the script
 *    → node extract.mjs
 *    → It will prompt you for the token and file key
 *    → OR pass them as environment variables:
 *       FIGMA_TOKEN=xxx FIGMA_FILE_KEY=yyy node extract.mjs
 *
 *  STEP 4: Feed the output to Cursor
 *    → The script creates an "output/" folder with everything
 *    → Open that folder in Cursor and tell the agent:
 *       "Build the frontend using the design data in this folder.
 *        design-tokens.json has exact colors/fonts/spacing.
 *        components.json has the reusable component definitions.
 *        screens/ has the full structure of each screen.
 *        screenshots/ has visual reference PNGs.
 *        Start by building the component library from components.json,
 *        then assemble each screen using those components."
 *
 * ============================================================
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { createInterface } from "readline";

// ─── Configuration ──────────────────────────────────────────

const API_BASE = "https://api.figma.com/v1";
const OUTPUT_DIR = "./output";
const SCREENSHOT_SCALE = 2; // 2x for retina-quality screenshots
const RATE_LIMIT_DELAY_MS = 500; // Delay between API calls to avoid rate limits

// ─── Helpers ────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function prompt(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function figmaGet(endpoint, token) {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    headers: { "X-FIGMA-TOKEN": token },
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("retry-after") || "10", 10);
    console.log(`  ⏳ Rate limited. Waiting ${retryAfter}s...`);
    await sleep(retryAfter * 1000);
    return figmaGet(endpoint, token);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Figma API ${res.status}: ${body}`);
  }

  return res.json();
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function writeJSON(filepath, data) {
  writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`  ✅ Wrote ${filepath}`);
}

// ─── Color Helpers ──────────────────────────────────────────

function rgbaToHex(color) {
  const r = Math.round((color.r || 0) * 255);
  const g = Math.round((color.g || 0) * 255);
  const b = Math.round((color.b || 0) * 255);
  const a = color.a !== undefined ? color.a : 1;
  const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  if (a < 1) {
    return `${hex}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
  }
  return hex;
}

function extractColorFromPaint(paint) {
  if (!paint) return null;
  if (paint.type === "SOLID" && paint.color) {
    return {
      type: "solid",
      hex: rgbaToHex(paint.color),
      opacity: paint.opacity !== undefined ? paint.opacity : 1,
      r: Math.round(paint.color.r * 255),
      g: Math.round(paint.color.g * 255),
      b: Math.round(paint.color.b * 255),
      a: paint.color.a !== undefined ? paint.color.a : 1,
    };
  }
  if (paint.type === "GRADIENT_LINEAR" || paint.type === "GRADIENT_RADIAL") {
    return {
      type: paint.type.toLowerCase(),
      stops: (paint.gradientStops || []).map((s) => ({
        position: s.position,
        hex: rgbaToHex(s.color),
      })),
    };
  }
  return { type: paint.type };
}

// ─── Extract Design Tokens ──────────────────────────────────

function extractDesignTokens(fileData) {
  const tokens = {
    colors: new Map(),
    typography: new Map(),
    spacing: new Set(),
    borderRadii: new Set(),
    effects: [],
  };

  function walkNode(node) {
    // Extract colors from fills
    if (node.fills && Array.isArray(node.fills)) {
      for (const fill of node.fills) {
        if (fill.visible === false) continue;
        const color = extractColorFromPaint(fill);
        if (color && color.hex) {
          tokens.colors.set(color.hex, {
            ...color,
            usedIn: node.name,
          });
        }
      }
    }

    // Extract colors from strokes
    if (node.strokes && Array.isArray(node.strokes)) {
      for (const stroke of node.strokes) {
        if (stroke.visible === false) continue;
        const color = extractColorFromPaint(stroke);
        if (color && color.hex) {
          tokens.colors.set(color.hex, {
            ...color,
            usedIn: `${node.name} (stroke)`,
          });
        }
      }
    }

    // Extract typography
    if (node.type === "TEXT" && node.style) {
      const s = node.style;
      const key = `${s.fontFamily}-${s.fontWeight}-${s.fontSize}`;
      tokens.typography.set(key, {
        fontFamily: s.fontFamily,
        fontWeight: s.fontWeight,
        fontSize: s.fontSize,
        lineHeightPx: s.lineHeightPx,
        lineHeightPercent: s.lineHeightPercent,
        lineHeightUnit: s.lineHeightUnit,
        letterSpacing: s.letterSpacing,
        textAlignHorizontal: s.textAlignHorizontal,
        textAlignVertical: s.textAlignVertical,
        textCase: s.textCase,
        textDecoration: s.textDecoration,
        usedIn: node.name,
      });
    }

    // Extract spacing from auto-layout
    if (node.layoutMode) {
      if (node.itemSpacing !== undefined) tokens.spacing.add(node.itemSpacing);
      if (node.paddingTop !== undefined) tokens.spacing.add(node.paddingTop);
      if (node.paddingRight !== undefined) tokens.spacing.add(node.paddingRight);
      if (node.paddingBottom !== undefined) tokens.spacing.add(node.paddingBottom);
      if (node.paddingLeft !== undefined) tokens.spacing.add(node.paddingLeft);
    }

    // Extract border radii
    if (node.cornerRadius !== undefined && node.cornerRadius > 0) {
      tokens.borderRadii.add(node.cornerRadius);
    }
    if (node.rectangleCornerRadii) {
      for (const r of node.rectangleCornerRadii) {
        if (r > 0) tokens.borderRadii.add(r);
      }
    }

    // Extract effects (shadows, blurs)
    if (node.effects && Array.isArray(node.effects)) {
      for (const effect of node.effects) {
        if (effect.visible === false) continue;
        tokens.effects.push({
          type: effect.type,
          color: effect.color ? rgbaToHex(effect.color) : null,
          offset: effect.offset,
          radius: effect.radius,
          spread: effect.spread,
          usedIn: node.name,
        });
      }
    }

    // Recurse into children
    if (node.children) {
      for (const child of node.children) {
        walkNode(child);
      }
    }
  }

  walkNode(fileData.document);

  return {
    colors: [...tokens.colors.values()].sort((a, b) =>
      (a.hex || "").localeCompare(b.hex || "")
    ),
    typography: [...tokens.typography.values()].sort(
      (a, b) => (a.fontSize || 0) - (b.fontSize || 0)
    ),
    spacing: [...tokens.spacing].sort((a, b) => a - b),
    borderRadii: [...tokens.borderRadii].sort((a, b) => a - b),
    effects: tokens.effects,
  };
}

// ─── Extract Named Styles ───────────────────────────────────

function extractNamedStyles(fileData) {
  const styles = {};

  if (fileData.styles) {
    for (const [id, style] of Object.entries(fileData.styles)) {
      styles[id] = {
        name: style.name,
        type: style.style_type,
        description: style.description || "",
      };
    }
  }

  return styles;
}

// ─── Extract Components ─────────────────────────────────────

function extractComponents(fileData) {
  const components = {};
  const componentSets = {};

  // From the top-level components map
  if (fileData.components) {
    for (const [id, comp] of Object.entries(fileData.components)) {
      components[id] = {
        name: comp.name,
        description: comp.description || "",
        componentSetId: comp.componentSetId || null,
        containingFrame: comp.containing_frame || null,
      };
    }
  }

  // From the top-level componentSets map
  if (fileData.componentSets) {
    for (const [id, set] of Object.entries(fileData.componentSets)) {
      componentSets[id] = {
        name: set.name,
        description: set.description || "",
      };
    }
  }

  // Now walk the tree to find the actual component nodes with full style data
  const componentNodes = {};

  function walkForComponents(node) {
    if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
      componentNodes[node.id] = extractNodeForScreen(node);
    }
    if (node.children) {
      for (const child of node.children) {
        walkForComponents(child);
      }
    }
  }

  walkForComponents(fileData.document);

  return {
    summary: components,
    sets: componentSets,
    nodes: componentNodes,
  };
}

// ─── Extract Node (for screen data) ────────────────────────

function extractNodeForScreen(node, depth = 0, maxDepth = 20) {
  if (depth > maxDepth) return { name: node.name, type: node.type, truncated: true };

  const extracted = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible !== false,
  };

  // Dimensions and position
  if (node.absoluteBoundingBox) {
    extracted.bounds = {
      x: node.absoluteBoundingBox.x,
      y: node.absoluteBoundingBox.y,
      width: node.absoluteBoundingBox.width,
      height: node.absoluteBoundingBox.height,
    };
  }

  if (node.size) {
    extracted.size = node.size;
  }

  // Fills
  if (node.fills && Array.isArray(node.fills)) {
    extracted.fills = node.fills
      .filter((f) => f.visible !== false)
      .map(extractColorFromPaint)
      .filter(Boolean);
  }

  // Strokes
  if (node.strokes && Array.isArray(node.strokes) && node.strokes.length > 0) {
    extracted.strokes = {
      paints: node.strokes.filter((s) => s.visible !== false).map(extractColorFromPaint).filter(Boolean),
      weight: node.strokeWeight,
      align: node.strokeAlign,
    };
    if (node.individualStrokeWeights) {
      extracted.strokes.individualWeights = node.individualStrokeWeights;
    }
  }

  // Corner radius
  if (node.cornerRadius !== undefined && node.cornerRadius > 0) {
    extracted.cornerRadius = node.cornerRadius;
  }
  if (node.rectangleCornerRadii) {
    extracted.cornerRadii = node.rectangleCornerRadii;
  }

  // Effects (shadows, blurs)
  if (node.effects && node.effects.length > 0) {
    extracted.effects = node.effects
      .filter((e) => e.visible !== false)
      .map((e) => ({
        type: e.type,
        color: e.color ? rgbaToHex(e.color) : null,
        offset: e.offset,
        radius: e.radius,
        spread: e.spread,
        blendMode: e.blendMode,
      }));
  }

  // Opacity
  if (node.opacity !== undefined && node.opacity < 1) {
    extracted.opacity = node.opacity;
  }

  // Blend mode
  if (node.blendMode && node.blendMode !== "PASS_THROUGH" && node.blendMode !== "NORMAL") {
    extracted.blendMode = node.blendMode;
  }

  // Auto-layout / Flexbox properties
  if (node.layoutMode) {
    extracted.layout = {
      mode: node.layoutMode, // HORIZONTAL, VERTICAL, or NONE
      primaryAxisSizingMode: node.primaryAxisSizingMode,
      counterAxisSizingMode: node.counterAxisSizingMode,
      primaryAxisAlignItems: node.primaryAxisAlignItems,
      counterAxisAlignItems: node.counterAxisAlignItems,
      itemSpacing: node.itemSpacing,
      counterAxisSpacing: node.counterAxisSpacing,
      padding: {
        top: node.paddingTop || 0,
        right: node.paddingRight || 0,
        bottom: node.paddingBottom || 0,
        left: node.paddingLeft || 0,
      },
      layoutWrap: node.layoutWrap,
    };
  }

  // Layout alignment (for children of auto-layout frames)
  if (node.layoutAlign) {
    extracted.layoutAlign = node.layoutAlign;
  }
  if (node.layoutGrow !== undefined) {
    extracted.layoutGrow = node.layoutGrow;
  }
  if (node.layoutPositioning) {
    extracted.layoutPositioning = node.layoutPositioning;
  }

  // Constraints (for fixed-layout frames)
  if (node.constraints) {
    extracted.constraints = node.constraints;
  }

  // Min/Max sizing
  if (node.minWidth) extracted.minWidth = node.minWidth;
  if (node.maxWidth) extracted.maxWidth = node.maxWidth;
  if (node.minHeight) extracted.minHeight = node.minHeight;
  if (node.maxHeight) extracted.maxHeight = node.maxHeight;

  // Clips content
  if (node.clipsContent !== undefined) {
    extracted.clipsContent = node.clipsContent;
  }

  // TEXT node specifics
  if (node.type === "TEXT") {
    extracted.characters = node.characters;
    if (node.style) {
      extracted.textStyle = {
        fontFamily: node.style.fontFamily,
        fontWeight: node.style.fontWeight,
        fontSize: node.style.fontSize,
        lineHeightPx: node.style.lineHeightPx,
        lineHeightPercent: node.style.lineHeightPercent,
        lineHeightUnit: node.style.lineHeightUnit,
        letterSpacing: node.style.letterSpacing,
        textAlignHorizontal: node.style.textAlignHorizontal,
        textAlignVertical: node.style.textAlignVertical,
        textCase: node.style.textCase,
        textDecoration: node.style.textDecoration,
        fontStyle: node.style.fontStyle,
      };
    }
    if (node.characterStyleOverrides && node.characterStyleOverrides.length > 0) {
      extracted.hasStyleOverrides = true;
      extracted.styleOverrideTable = node.styleOverrideTable;
    }
  }

  // INSTANCE specifics — which component this is an instance of
  if (node.type === "INSTANCE") {
    extracted.componentId = node.componentId;
    if (node.componentProperties) {
      extracted.componentProperties = node.componentProperties;
    }
  }

  // Style references (links to named styles)
  if (node.styles) {
    extracted.styleRefs = node.styles;
  }

  // Image fills — reference to downloadable images
  if (node.fills && Array.isArray(node.fills)) {
    const imageFills = node.fills.filter((f) => f.type === "IMAGE");
    if (imageFills.length > 0) {
      extracted.imageRefs = imageFills.map((f) => f.imageRef).filter(Boolean);
    }
  }

  // Children
  if (node.children && node.children.length > 0) {
    extracted.children = node.children.map((child) =>
      extractNodeForScreen(child, depth + 1, maxDepth)
    );
  }

  return extracted;
}

// ─── Extract Screens ────────────────────────────────────────

function extractScreens(fileData) {
  const screens = {};

  for (const page of fileData.document.children) {
    if (page.type !== "CANVAS") continue;

    const pageScreens = [];

    for (const frame of page.children || []) {
      // Top-level frames on each page are considered "screens"
      if (
        frame.type === "FRAME" ||
        frame.type === "COMPONENT" ||
        frame.type === "COMPONENT_SET" ||
        frame.type === "SECTION"
      ) {
        pageScreens.push({
          id: frame.id,
          name: frame.name,
          type: frame.type,
          bounds: frame.absoluteBoundingBox,
          tree: extractNodeForScreen(frame),
        });
      }
    }

    screens[page.name] = {
      pageId: page.id,
      pageName: page.name,
      screenCount: pageScreens.length,
      screens: pageScreens,
    };
  }

  return screens;
}

// ─── Collect All Frame IDs for Screenshots ──────────────────

function collectFrameIds(fileData) {
  const frameIds = [];

  for (const page of fileData.document.children) {
    if (page.type !== "CANVAS") continue;
    for (const frame of page.children || []) {
      if (
        frame.type === "FRAME" ||
        frame.type === "COMPONENT" ||
        frame.type === "COMPONENT_SET" ||
        frame.type === "SECTION"
      ) {
        frameIds.push({
          id: frame.id,
          name: frame.name,
          pageName: page.name,
        });
      }
    }
  }

  return frameIds;
}

// ─── Export Screenshots ─────────────────────────────────────

async function exportScreenshots(token, fileKey, frameIds, outputDir) {
  const screenshotsDir = join(outputDir, "screenshots");
  ensureDir(screenshotsDir);

  // Figma GET images endpoint accepts up to ~200 IDs at once
  const BATCH_SIZE = 50;
  const batches = [];

  for (let i = 0; i < frameIds.length; i += BATCH_SIZE) {
    batches.push(frameIds.slice(i, i + BATCH_SIZE));
  }

  const urlMap = {}; // id -> image URL

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const ids = batch.map((f) => f.id).join(",");

    console.log(
      `  📸 Requesting screenshots batch ${batchIndex + 1}/${batches.length} (${batch.length} frames)...`
    );

    const data = await figmaGet(
      `/images/${fileKey}?ids=${encodeURIComponent(ids)}&scale=${SCREENSHOT_SCALE}&format=png`,
      token
    );

    if (data.images) {
      for (const [id, url] of Object.entries(data.images)) {
        if (url) urlMap[id] = url;
      }
    }

    await sleep(RATE_LIMIT_DELAY_MS);
  }

  // Download all images
  const manifest = [];

  for (const frame of frameIds) {
    const url = urlMap[frame.id];
    if (!url) {
      console.log(`  ⚠️  No image for "${frame.name}" (${frame.id})`);
      continue;
    }

    // Sanitize filename
    const safeName = `${frame.pageName}--${frame.name}`
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .substring(0, 100);
    const filename = `${safeName}.png`;

    try {
      const imgRes = await fetch(url);
      if (!imgRes.ok) {
        console.log(`  ⚠️  Failed to download "${frame.name}": ${imgRes.status}`);
        continue;
      }
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      writeFileSync(join(screenshotsDir, filename), buffer);
      manifest.push({
        id: frame.id,
        name: frame.name,
        page: frame.pageName,
        file: `screenshots/${filename}`,
      });
    } catch (err) {
      console.log(`  ⚠️  Error downloading "${frame.name}": ${err.message}`);
    }
  }

  return manifest;
}

// ─── Generate Cursor Instructions ───────────────────────────

function generateCursorInstructions(screens, components) {
  const screenList = [];
  for (const [pageName, pageData] of Object.entries(screens)) {
    for (const screen of pageData.screens) {
      screenList.push(`  - [${pageName}] ${screen.name}`);
    }
  }

  const componentList = Object.values(components.summary).map(
    (c) => `  - ${c.name}${c.description ? `: ${c.description}` : ""}`
  );

  return `# Design-to-Code Instructions for Cursor

## What's In This Folder

- **design-tokens.json** — Every color, font, spacing value, border radius,
  and shadow used in the design. USE THESE EXACT VALUES. Do not approximate.

- **components.json** — The reusable components the designer defined.
  Build these first as your component library.

- **named-styles.json** — Named styles from Figma (color styles, text styles, etc.)

- **screens/** — One JSON file per page. Each contains the full node tree for
  every screen on that page, with exact properties for every element.

- **screenshots/** — Visual reference PNGs of every screen at ${SCREENSHOT_SCALE}x resolution.
  Use these to verify your output matches the design visually.

- **screenshot-manifest.json** — Maps screenshot files to screen names and IDs.

## Build Order

### Phase 1: Design Tokens
Read design-tokens.json and create your CSS variables / theme config.
Every color, font size, spacing value, and border radius should come
from this file. Do not invent values.

### Phase 2: Component Library
Read components.json → nodes section. Build each component.
Cross-reference with design-tokens.json for exact values.
Cross-reference with screenshots/ for visual verification.

### Phase 3: Screen Assembly
For each screen in screens/:
1. Read the screen JSON (the "tree" field has the full node hierarchy)
2. Look at the corresponding screenshot for visual reference
3. Build the screen using the components from Phase 2
4. For elements that are INSTANCE type, check componentId to find
   which component to use

## Key Concepts

- **INSTANCE nodes** reference a componentId → look it up in components.json
- **layout.mode = "HORIZONTAL"** → display: flex; flex-direction: row
- **layout.mode = "VERTICAL"** → display: flex; flex-direction: column
- **layout.primaryAxisAlignItems** → justify-content mapping
- **layout.counterAxisAlignItems** → align-items mapping
- **layoutGrow = 1** → flex: 1
- **layoutAlign = "STRETCH"** → align-self: stretch
- **fills** → background colors/gradients
- **strokes** → borders
- **effects** with type "DROP_SHADOW" → box-shadow
- **effects** with type "INNER_SHADOW" → box-shadow inset
- **effects** with type "LAYER_BLUR" → filter: blur()
- **textStyle** → all font properties
- **bounds.width / bounds.height** → element dimensions
- **cornerRadius** → border-radius

## Screens Found

${screenList.join("\n")}

## Components Found

${componentList.join("\n")}

## Important Rules

1. Use EXACT values from design-tokens.json. Never approximate colors or spacing.
2. Build components FIRST, then assemble screens.
3. Every INSTANCE node means "use the component" — don't rebuild it inline.
4. When in doubt, check the screenshot. The JSON gives precision; the image gives intent.
5. Auto-layout frames map directly to CSS flexbox. Use the layout properties.
`;
}

// ─── MAIN ───────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║       FIGMA DESIGN EXTRACTOR             ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();

  // Get credentials
  let token = process.env.FIGMA_TOKEN;
  let fileKey = process.env.FIGMA_FILE_KEY;

  if (!token) {
    console.log("You need a Figma Personal Access Token.");
    console.log("Get one at: Figma → Avatar → Settings → Security → Generate new token");
    console.log('Select scope: "File content: Read"');
    console.log();
    token = await prompt("Paste your Figma token: ");
  }

  if (!fileKey) {
    console.log();
    console.log("You need the file key from your Figma URL.");
    console.log("Example: figma.com/design/ABC123xyz/My-Design → key is ABC123xyz");
    console.log();
    fileKey = await prompt("Paste your Figma file key: ");
  }

  if (!token || !fileKey) {
    console.error("❌ Token and file key are both required.");
    process.exit(1);
  }

  // Create output directory
  ensureDir(OUTPUT_DIR);
  ensureDir(join(OUTPUT_DIR, "screens"));

  // ── Step 1: Fetch the full file ───────────────────────────
  console.log();
  console.log("📂 Fetching Figma file (this can take a moment for large files)...");
  const fileData = await figmaGet(`/files/${fileKey}`, token);
  console.log(`  ✅ Got file: "${fileData.name}"`);
  console.log(
    `  📄 Pages: ${fileData.document.children.length}`
  );

  // ── Step 2: Extract design tokens ─────────────────────────
  console.log();
  console.log("🎨 Extracting design tokens...");
  const tokens = extractDesignTokens(fileData);
  writeJSON(join(OUTPUT_DIR, "design-tokens.json"), tokens);
  console.log(
    `  Found: ${tokens.colors.length} colors, ${tokens.typography.length} type styles, ${tokens.spacing.length} spacing values`
  );

  // ── Step 3: Extract named styles ──────────────────────────
  console.log();
  console.log("🏷️  Extracting named styles...");
  const namedStyles = extractNamedStyles(fileData);
  writeJSON(join(OUTPUT_DIR, "named-styles.json"), namedStyles);
  console.log(`  Found: ${Object.keys(namedStyles).length} named styles`);

  // ── Step 4: Extract components ────────────────────────────
  console.log();
  console.log("🧩 Extracting components...");
  const components = extractComponents(fileData);
  writeJSON(join(OUTPUT_DIR, "components.json"), components);
  console.log(
    `  Found: ${Object.keys(components.summary).length} components, ${Object.keys(components.sets).length} component sets`
  );

  // ── Step 5: Extract screen trees ──────────────────────────
  console.log();
  console.log("📱 Extracting screen trees...");
  const screens = extractScreens(fileData);
  let totalScreens = 0;
  for (const [pageName, pageData] of Object.entries(screens)) {
    const safeName = pageName.replace(/[^a-zA-Z0-9_-]/g, "_");
    writeJSON(join(OUTPUT_DIR, "screens", `${safeName}.json`), pageData);
    totalScreens += pageData.screenCount;
  }
  console.log(`  Found: ${totalScreens} screens across ${Object.keys(screens).length} pages`);

  // ── Step 6: Export screenshots ────────────────────────────
  console.log();
  console.log("📸 Exporting screenshots (this will take a while for many screens)...");
  const frameIds = collectFrameIds(fileData);

  if (frameIds.length === 0) {
    console.log("  ⚠️  No frames found to screenshot.");
  } else {
    console.log(`  🖼️  ${frameIds.length} frames to export...`);
    const manifest = await exportScreenshots(token, fileKey, frameIds, OUTPUT_DIR);
    writeJSON(join(OUTPUT_DIR, "screenshot-manifest.json"), manifest);
    console.log(`  ✅ Exported ${manifest.length} screenshots`);
  }

  // ── Step 7: Generate instructions ─────────────────────────
  console.log();
  console.log("📝 Generating Cursor instructions...");
  const instructions = generateCursorInstructions(screens, components);
  writeFileSync(join(OUTPUT_DIR, "INSTRUCTIONS.md"), instructions);
  console.log(`  ✅ Wrote ${join(OUTPUT_DIR, "INSTRUCTIONS.md")}`);

  // ── Done ──────────────────────────────────────────────────
  console.log();
  console.log("═══════════════════════════════════════════");
  console.log("✅ DONE! Output is in ./output/");
  console.log();
  console.log("NEXT STEPS:");
  console.log("  1. Open the 'output' folder in Cursor");
  console.log("  2. Tell Cursor to read INSTRUCTIONS.md first");
  console.log("  3. Say: 'Build the frontend following the instructions");
  console.log("     in INSTRUCTIONS.md. Start with the component library.'");
  console.log();
  console.log("ALTERNATIVE (recommended if using Cursor):");
  console.log("  The Figma MCP server can also do this live.");
  console.log("  In Cursor, install it via: Settings → MCP → Add server");
  console.log("  URL: https://mcp.figma.com/mcp");
  console.log("  Then you can reference Figma URLs directly in prompts.");
  console.log("═══════════════════════════════════════════");
}

main().catch((err) => {
  console.error();
  console.error("❌ Fatal error:", err.message);
  console.error();
  if (err.message.includes("403")) {
    console.error("This usually means your token is invalid or expired.");
    console.error("Generate a new one at: Figma → Settings → Security → Generate new token");
  } else if (err.message.includes("404")) {
    console.error("This usually means the file key is wrong.");
    console.error("Check your Figma URL: figma.com/design/YOUR_KEY_HERE/...");
  }
  process.exit(1);
});
