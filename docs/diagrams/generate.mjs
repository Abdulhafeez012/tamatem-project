#!/usr/bin/env node
/**
 * Diagram generator for the tamatem-project READMEs.
 *
 * Every diagram is declared as data at the bottom of this file. For each one we
 * emit two artefacts side by side:
 *
 *   <name>.excalidraw  an Excalidraw scene you can open and reshape by hand
 *   <name>.svg         a rendering of that same scene, embedded in the README
 *
 * The README always points at the .svg, so it renders straight after a clone.
 * If you want the hand-drawn look, open the .excalidraw (drag it onto
 * excalidraw.com, or open this repo as an Obsidian vault), polish it, and export
 * over the .svg — same filename, so no README edit is needed.
 *
 * Coordinates are written out longhand in the specs rather than solved by a
 * layout engine: these are five hand-designed pictures, not arbitrary graphs,
 * and explicit numbers are far easier to nudge than layout constraints.
 *
 * Run:  node docs/diagrams/generate.mjs
 * Zero dependencies. Deterministic — reruns produce byte-identical files, so a
 * regeneration only shows up in git when a spec actually changed.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/* ------------------------------------------------------------------ *
 * Determinism
 * ------------------------------------------------------------------ */

// Excalidraw wants `seed`, `versionNonce` and `updated` on every element. Real
// values would change on each run and churn the diff, so they come from a
// seeded LCG and one frozen timestamp instead.
const FROZEN_TIMESTAMP = 1755730800000; // 2025-08-21T00:00:00Z, arbitrary but fixed

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state;
  };
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function makeIdFactory(rand) {
  // Excalidraw's own ids are 21-char nanoids. Text elements are the exception:
  // the Obsidian plugin rewrites any text id longer than 8 chars when it saves,
  // so those get short ids and survive a round-trip unchanged.
  const seen = new Set();
  return (length) => {
    for (;;) {
      let id = '';
      for (let i = 0; i < length; i += 1) {
        id += ID_ALPHABET[rand() % ID_ALPHABET.length];
      }
      if (!seen.has(id)) {
        seen.add(id);
        return id;
      }
    }
  };
}

/* ------------------------------------------------------------------ *
 * Palette
 * ------------------------------------------------------------------ */

// The SVG is painted on an explicit light background rather than inheriting the
// page's. GitHub serves the same file to light- and dark-theme readers, and an
// inherited background would leave dark-theme readers with dark-on-dark text.
const INK = '#1e1e1e';
const MUTED = '#5c5f66';
const PAPER = '#ffffff';

const TONES = {
  client: { fill: '#d0ebff', stroke: '#1971c2' },
  server: { fill: '#b2f2bb', stroke: '#2f9e44' },
  data: { fill: '#ffec99', stroke: '#f08c00' },
  alert: { fill: '#ffc9c9', stroke: '#e03131' },
  neutral: { fill: '#f1f3f5', stroke: '#868e96' },
  accent: { fill: '#e5dbff', stroke: '#6741d9' },
  plain: { fill: 'transparent', stroke: '#868e96' },
};

const tone = (name) => TONES[name] ?? TONES.neutral;

/* ------------------------------------------------------------------ *
 * Text metrics
 * ------------------------------------------------------------------ */

const FONT_STACK =
  "'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif";
const MONO_STACK = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const LINE_HEIGHT = 1.25; // matches Excalifont's metric, so both renderings agree
const CHAR_W = 0.545; // average advance width as a fraction of font size
const MONO_CHAR_W = 0.6;

const textWidth = (text, size, mono = false) =>
  text.length * size * (mono ? MONO_CHAR_W : CHAR_W);

/** Greedy word wrap to a pixel budget. Long unbreakable tokens overflow rather
 *  than being cut, which is the lesser evil for identifiers like `useApi()`. */
function wrap(text, size, maxWidth, mono = false) {
  const paragraphs = String(text).split('\n');
  const lines = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = words[0];
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`;
      if (textWidth(candidate, size, mono) <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ */

const anchor = (node, side) => {
  const { x, y, w, h } = node;
  switch (side) {
    case 'l': return [x, y + h / 2];
    case 'r': return [x + w, y + h / 2];
    case 't': return [x + w / 2, y];
    case 'b': return [x + w / 2, y + h];
    case 'tl': return [x + w * 0.25, y];
    case 'tr': return [x + w * 0.75, y];
    case 'bl': return [x + w * 0.25, y + h];
    case 'br': return [x + w * 0.75, y + h];
    default: throw new Error(`unknown anchor side: ${side}`);
  }
};

/** Normalised [0..1] position of an anchor inside its element — Excalidraw's
 *  `fixedPoint` binding format. */
const fixedPoint = (node, side) => {
  const [px, py] = anchor(node, side);
  return [round((px - node.x) / node.w), round((py - node.y) / node.h)];
};

const round = (n) => Math.round(n * 1000) / 1000;

/**
 * Route an edge as a polyline. With no waypoints we draw a straight segment;
 * `via: 'h'` / `via: 'v'` inserts the orthogonal dog-leg through the midpoint,
 * and an explicit array of points is passed through untouched.
 */
function route(from, to, via) {
  if (Array.isArray(via)) return [from, ...via, to];
  if (via === 'h') {
    const midX = (from[0] + to[0]) / 2;
    return [from, [midX, from[1]], [midX, to[1]], to];
  }
  if (via === 'v') {
    const midY = (from[1] + to[1]) / 2;
    return [from, [from[0], midY], [to[0], midY], to];
  }
  return [from, to];
}

/* ------------------------------------------------------------------ *
 * Node sizing
 * ------------------------------------------------------------------ */

const BOX_PAD_X = 14;
const TABLE_HEADER_H = 34;
const TABLE_ROW_H = 22;
const TABLE_PAD_Y = 8;

const TITLE_SIZE = 20;
const LABEL_SIZE = 16;
const SMALL_SIZE = 13;
const FIELD_SIZE = 13;

/** Fill in derived geometry (wrapped lines, computed height) for every node. */
function measureNodes(nodes) {
  const byId = new Map();
  for (const node of nodes) {
    if (node.kind === 'table') {
      node.h = TABLE_HEADER_H + node.fields.length * TABLE_ROW_H + TABLE_PAD_Y;
    } else {
      const inner = node.w - BOX_PAD_X * 2;
      node.lines = wrap(node.label, LABEL_SIZE, inner, node.mono);
      node.subLines = node.sub ? wrap(node.sub, SMALL_SIZE, inner, true) : [];
      const textH =
        node.lines.length * LABEL_SIZE * LINE_HEIGHT +
        (node.subLines.length ? 4 + node.subLines.length * SMALL_SIZE * LINE_HEIGHT : 0);
      node.h = node.h ?? Math.max(56, Math.round(textH + 22));
    }
    byId.set(node.id, node);
  }
  return byId;
}

/* ------------------------------------------------------------------ *
 * Excalidraw element factories
 * ------------------------------------------------------------------ */

function makeScene(spec, nodes, byId) {
  const rand = makeRandom(1337);
  const nextId = makeIdFactory(rand);
  const elements = [];

  // Excalidraw ignores `index` when it is null and regenerates the fractional
  // indices on open, which is exactly what we want — array order is the truth.
  const base = (overrides) => ({
    angle: 0,
    strokeColor: INK,
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: null,
    roundness: null,
    seed: rand(),
    version: 100,
    versionNonce: rand(),
    isDeleted: false,
    boundElements: [],
    updated: FROZEN_TIMESTAMP,
    link: null,
    locked: false,
    ...overrides,
  });

  const freeText = (opts) =>
    base({
      id: nextId(8),
      type: 'text',
      width: opts.width ?? 100,
      height: opts.lines.length * opts.fontSize * LINE_HEIGHT,
      strokeColor: opts.color ?? INK,
      strokeWidth: 1,
      fontSize: opts.fontSize,
      fontFamily: opts.mono ? 3 : 5, // 3 = Cascadia (mono), 5 = Excalifont
      text: opts.lines.join('\n'),
      originalText: opts.lines.join('\n'),
      textAlign: opts.align ?? 'left',
      verticalAlign: 'top',
      containerId: null,
      autoResize: true,
      lineHeight: LINE_HEIGHT,
      x: opts.x,
      y: opts.y,
    });

  /* -- group frames ------------------------------------------------ */
  for (const group of spec.groups ?? []) {
    const t = tone(group.tone ?? 'plain');
    elements.push(
      base({
        id: nextId(21),
        type: 'rectangle',
        x: group.x,
        y: group.y,
        width: group.w,
        height: group.h,
        strokeColor: t.stroke,
        backgroundColor: group.fill ?? 'transparent',
        strokeStyle: 'dashed',
        strokeWidth: 1,
        roundness: { type: 3 },
      }),
    );
    elements.push(
      freeText({
        lines: [group.label],
        fontSize: SMALL_SIZE,
        color: t.stroke,
        x: group.x + 12,
        y: group.y + 10,
        width: textWidth(group.label, SMALL_SIZE),
        mono: true,
      }),
    );
  }

  /* -- nodes ------------------------------------------------------- */
  for (const node of nodes) {
    const t = tone(node.tone);
    const rectId = nextId(21);
    node._id = rectId;
    const bound = [];

    if (node.kind === 'table') {
      elements.push(
        base({
          id: rectId,
          type: 'rectangle',
          x: node.x,
          y: node.y,
          width: node.w,
          height: node.h,
          strokeColor: t.stroke,
          backgroundColor: PAPER,
          roundness: { type: 3 },
          boundElements: bound,
        }),
      );
      // Header band, with the table name bound inside it so dragging keeps them
      // together.
      const headerId = nextId(21);
      const headerBound = [];
      elements.push(
        base({
          id: headerId,
          type: 'rectangle',
          x: node.x,
          y: node.y,
          width: node.w,
          height: TABLE_HEADER_H,
          strokeColor: t.stroke,
          backgroundColor: t.fill,
          strokeWidth: 1,
          boundElements: headerBound,
        }),
      );
      const titleText = base({
        id: nextId(8),
        type: 'text',
        x: node.x + 5,
        y: node.y + 7,
        width: node.w - 10,
        height: LABEL_SIZE * LINE_HEIGHT,
        strokeColor: INK,
        strokeWidth: 1,
        fontSize: LABEL_SIZE,
        fontFamily: 3,
        text: node.label,
        originalText: node.label,
        textAlign: 'center',
        verticalAlign: 'middle',
        containerId: headerId,
        autoResize: false,
        lineHeight: LINE_HEIGHT,
      });
      headerBound.push({ type: 'text', id: titleText.id });
      elements.push(titleText);

      // Field names and types as two left-aligned columns. One text element per
      // column rather than per row keeps the scene light and still editable.
      const rowsTop = node.y + TABLE_HEADER_H + TABLE_PAD_Y / 2;
      elements.push(
        freeText({
          lines: node.fields.map(([name]) => name),
          fontSize: FIELD_SIZE,
          mono: true,
          x: node.x + 12,
          y: rowsTop + (TABLE_ROW_H - FIELD_SIZE * LINE_HEIGHT) / 2,
          width: node.w * 0.55,
        }),
      );
      elements.push(
        freeText({
          lines: node.fields.map(([, type]) => type ?? ''),
          fontSize: FIELD_SIZE,
          mono: true,
          color: MUTED,
          align: 'right',
          x: node.x + node.w * 0.55,
          y: rowsTop + (TABLE_ROW_H - FIELD_SIZE * LINE_HEIGHT) / 2,
          width: node.w * 0.45 - 12,
        }),
      );
      continue;
    }

    elements.push(
      base({
        id: rectId,
        type: node.kind === 'db' ? 'ellipse' : 'rectangle',
        x: node.x,
        y: node.y,
        width: node.w,
        height: node.h,
        strokeColor: t.stroke,
        backgroundColor: t.fill,
        roundness: node.kind === 'db' ? null : { type: 3 },
        boundElements: bound,
      }),
    );

    const labelH = node.lines.length * LABEL_SIZE * LINE_HEIGHT;
    const subH = node.subLines.length
      ? node.subLines.length * SMALL_SIZE * LINE_HEIGHT + 4
      : 0;

    if (node.subLines.length === 0) {
      // No secondary line: bind the label to the box so they move as one.
      const labelText = base({
        id: nextId(8),
        type: 'text',
        x: node.x + 5,
        y: node.y + (node.h - labelH) / 2,
        width: node.w - 10,
        height: labelH,
        strokeColor: INK,
        strokeWidth: 1,
        fontSize: LABEL_SIZE,
        fontFamily: node.mono ? 3 : 5,
        text: node.lines.join('\n'),
        originalText: node.lines.join('\n'),
        textAlign: 'center',
        verticalAlign: 'middle',
        containerId: rectId,
        autoResize: false,
        lineHeight: LINE_HEIGHT,
      });
      bound.push({ type: 'text', id: labelText.id });
      elements.push(labelText);
    } else {
      // A bound label can only hold one style, so the caption becomes its own
      // free text element sitting under the title.
      const top = node.y + (node.h - (labelH + subH)) / 2;
      elements.push(
        freeText({
          lines: node.lines,
          fontSize: LABEL_SIZE,
          align: 'center',
          mono: node.mono,
          x: node.x + BOX_PAD_X,
          y: top,
          width: node.w - BOX_PAD_X * 2,
        }),
      );
      elements.push(
        freeText({
          lines: node.subLines,
          fontSize: SMALL_SIZE,
          align: 'center',
          color: MUTED,
          mono: true,
          x: node.x + BOX_PAD_X,
          y: top + labelH + 4,
          width: node.w - BOX_PAD_X * 2,
        }),
      );
    }
  }

  /* -- edges ------------------------------------------------------- */
  for (const edge of spec.edges ?? []) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) throw new Error(`edge references unknown node: ${edge.from} -> ${edge.to}`);

    const [fromSide, toSide] = edge.sides ?? ['r', 'l'];
    const points = route(anchor(from, fromSide), anchor(to, toSide), edge.via);
    const [ox, oy] = points[0];
    const t = tone(edge.tone ?? 'neutral');

    const arrowId = nextId(21);
    const arrow = base({
      id: arrowId,
      type: 'arrow',
      x: ox,
      y: oy,
      width: Math.abs(points.at(-1)[0] - ox),
      height: Math.abs(points.at(-1)[1] - oy),
      strokeColor: edge.tone ? t.stroke : INK,
      strokeStyle: edge.dashed ? 'dashed' : 'solid',
      // `points` are element-local and must start at the origin, otherwise
      // Excalidraw renormalises x/y on open and the arrow jumps.
      points: points.map(([px, py]) => [round(px - ox), round(py - oy)]),
      lastCommittedPoint: null,
      // Binding schema v2. The legacy {focus, gap} form is only accepted through
      // a geometric migration, so we write the deterministic shape directly.
      startBinding: {
        elementId: from._id,
        mode: 'orbit',
        fixedPoint: fixedPoint(from, fromSide),
      },
      endBinding: {
        elementId: to._id,
        mode: 'orbit',
        fixedPoint: fixedPoint(to, toSide),
      },
      startArrowhead: null,
      endArrowhead: 'arrow',
      elbowed: false,
    });
    elements.push(arrow);

    // Excalidraw drops a binding whose counterpart does not list the arrow.
    for (const node of [from, to]) {
      const el = elements.find((e) => e.id === node._id);
      if (el) el.boundElements.push({ type: 'arrow', id: arrowId });
    }

    if (edge.label) {
      const mid = edgeLabelAnchor(points, edge);
      const lines = wrap(edge.label, SMALL_SIZE, edge.labelWidth ?? 190, true);
      elements.push(
        freeText({
          lines,
          fontSize: SMALL_SIZE,
          mono: true,
          color: edge.tone ? t.stroke : MUTED,
          align: edge.labelAlign ?? 'left',
          x: mid[0] + (edge.labelDx ?? 8),
          y: mid[1] + (edge.labelDy ?? -8) - (lines.length * SMALL_SIZE * LINE_HEIGHT) / 2,
          width: edge.labelWidth ?? 190,
        }),
      );
    }
  }

  /* -- free-standing notes ----------------------------------------- */
  for (const note of spec.notes ?? []) {
    const lines = wrap(note.text, note.size ?? SMALL_SIZE, note.w ?? 260, note.mono ?? true);
    elements.push(
      freeText({
        lines,
        fontSize: note.size ?? SMALL_SIZE,
        mono: note.mono ?? true,
        color: note.color ?? MUTED,
        align: note.align ?? 'left',
        x: note.x,
        y: note.y,
        width: note.w ?? 260,
      }),
    );
  }

  return elements;
}

/** Where to hang an edge label: the midpoint of the longest segment. */
function edgeLabelAnchor(points, edge) {
  if (edge.labelAt) return edge.labelAt;
  let best = null;
  let bestLen = -1;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    if (len > bestLen) {
      bestLen = len;
      best = [(ax + bx) / 2, (ay + by) / 2];
    }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Writers
 * ------------------------------------------------------------------ */

function toExcalidraw(elements) {
  return `${JSON.stringify(
    {
      type: 'excalidraw',
      version: 2,
      source: 'tamatem-project/docs/diagrams/generate.mjs',
      elements,
      appState: {
        gridSize: 20,
        gridStep: 5,
        gridModeEnabled: false,
        viewBackgroundColor: PAPER,
      },
      files: {},
    },
    null,
    2,
  )}\n`;
}

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

function toSvg(spec, nodes, byId) {
  const pad = 28;
  const titleH = spec.title ? 44 : 0;

  // Bounding box over everything that can be drawn, so nothing clips.
  const xs = [];
  const ys = [];
  const consider = (x, y) => { xs.push(x); ys.push(y); };
  for (const n of nodes) { consider(n.x, n.y); consider(n.x + n.w, n.y + n.h); }
  for (const g of spec.groups ?? []) { consider(g.x, g.y); consider(g.x + g.w, g.y + g.h); }
  for (const note of spec.notes ?? []) {
    const lines = wrap(note.text, note.size ?? SMALL_SIZE, note.w ?? 260, note.mono ?? true);
    consider(note.x, note.y);
    consider(note.x + (note.w ?? 260), note.y + lines.length * (note.size ?? SMALL_SIZE) * LINE_HEIGHT);
  }

  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad - titleH;
  const width = Math.max(...xs) + pad - minX;
  const height = Math.max(...ys) + pad - minY;

  const out = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${round(minX)} ${round(minY)} ${round(width)} ${round(height)}" width="${Math.round(width)}" height="${Math.round(height)}" role="img" aria-label="${esc(spec.alt ?? spec.title ?? spec.name)}">`,
  );
  out.push(`<title>${esc(spec.alt ?? spec.title ?? spec.name)}</title>`);
  out.push(
    `<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9 z" fill="context-stroke"/></marker></defs>`,
  );
  // Opaque background: the same file is served to light- and dark-theme readers.
  out.push(
    `<rect x="${round(minX)}" y="${round(minY)}" width="${round(width)}" height="${round(height)}" fill="${PAPER}"/>`,
  );

  if (spec.title) {
    out.push(
      `<text x="${round(minX + pad)}" y="${round(minY + pad + 12)}" font-family="${FONT_STACK}" font-size="${TITLE_SIZE}" font-weight="600" fill="${INK}">${esc(spec.title)}</text>`,
    );
  }

  for (const g of spec.groups ?? []) {
    const t = tone(g.tone ?? 'plain');
    out.push(
      `<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="10" fill="${g.fill ?? 'none'}" stroke="${t.stroke}" stroke-width="1" stroke-dasharray="6 5"/>`,
    );
    out.push(
      `<text x="${g.x + 12}" y="${g.y + 20}" font-family="${MONO_STACK}" font-size="${SMALL_SIZE}" fill="${t.stroke}">${esc(g.label)}</text>`,
    );
  }

  for (const node of nodes) {
    const t = tone(node.tone);
    if (node.kind === 'table') {
      out.push(
        `<rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="8" fill="${PAPER}" stroke="${t.stroke}" stroke-width="2"/>`,
      );
      out.push(
        `<path d="M ${node.x} ${node.y + TABLE_HEADER_H} h ${node.w}" stroke="${t.stroke}" stroke-width="1"/>`,
      );
      out.push(
        `<path d="M ${node.x + 1} ${node.y + 8} q 0 -7 7 -7 h ${node.w - 16} q 7 0 7 7 v ${TABLE_HEADER_H - 8} h -${node.w - 2} z" fill="${t.fill}"/>`,
      );
      out.push(
        `<text x="${node.x + node.w / 2}" y="${node.y + TABLE_HEADER_H / 2 + 5}" text-anchor="middle" font-family="${MONO_STACK}" font-size="${LABEL_SIZE}" font-weight="600" fill="${INK}">${esc(node.label)}</text>`,
      );
      node.fields.forEach(([name, type], i) => {
        const rowY = node.y + TABLE_HEADER_H + TABLE_PAD_Y / 2 + i * TABLE_ROW_H + TABLE_ROW_H / 2 + 4;
        out.push(
          `<text x="${node.x + 12}" y="${round(rowY)}" font-family="${MONO_STACK}" font-size="${FIELD_SIZE}" fill="${INK}">${esc(name)}</text>`,
        );
        if (type) {
          out.push(
            `<text x="${node.x + node.w - 12}" y="${round(rowY)}" text-anchor="end" font-family="${MONO_STACK}" font-size="${FIELD_SIZE}" fill="${MUTED}">${esc(type)}</text>`,
          );
        }
      });
      continue;
    }

    if (node.kind === 'db') {
      out.push(
        `<ellipse cx="${node.x + node.w / 2}" cy="${node.y + node.h / 2}" rx="${node.w / 2}" ry="${node.h / 2}" fill="${t.fill}" stroke="${t.stroke}" stroke-width="2"/>`,
      );
    } else {
      out.push(
        `<rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="8" fill="${t.fill}" stroke="${t.stroke}" stroke-width="2"/>`,
      );
    }

    const labelH = node.lines.length * LABEL_SIZE * LINE_HEIGHT;
    const subH = node.subLines.length
      ? node.subLines.length * SMALL_SIZE * LINE_HEIGHT + 4
      : 0;
    let cursor = node.y + (node.h - (labelH + subH)) / 2 + LABEL_SIZE;
    const cx = node.x + node.w / 2;
    for (const line of node.lines) {
      out.push(
        `<text x="${cx}" y="${round(cursor)}" text-anchor="middle" font-family="${node.mono ? MONO_STACK : FONT_STACK}" font-size="${LABEL_SIZE}" font-weight="600" fill="${INK}">${esc(line)}</text>`,
      );
      cursor += LABEL_SIZE * LINE_HEIGHT;
    }
    cursor += node.subLines.length ? 4 : 0;
    for (const line of node.subLines) {
      out.push(
        `<text x="${cx}" y="${round(cursor)}" text-anchor="middle" font-family="${MONO_STACK}" font-size="${SMALL_SIZE}" fill="${MUTED}">${esc(line)}</text>`,
      );
      cursor += SMALL_SIZE * LINE_HEIGHT;
    }
  }

  for (const edge of spec.edges ?? []) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    const [fromSide, toSide] = edge.sides ?? ['r', 'l'];
    const points = route(anchor(from, fromSide), anchor(to, toSide), edge.via);
    const t = tone(edge.tone ?? 'neutral');
    const stroke = edge.tone ? t.stroke : INK;
    const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${round(x)} ${round(y)}`).join(' ');
    out.push(
      `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="2"${edge.dashed ? ' stroke-dasharray="7 5"' : ''} marker-end="url(#ah)"/>`,
    );

    if (edge.label) {
      const mid = edgeLabelAnchor(points, edge);
      const lines = wrap(edge.label, SMALL_SIZE, edge.labelWidth ?? 190, true);
      const align = edge.labelAlign ?? 'left';
      const anchorAttr = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
      const lx = mid[0] + (edge.labelDx ?? 8);
      let ly =
        mid[1] + (edge.labelDy ?? -8) - (lines.length * SMALL_SIZE * LINE_HEIGHT) / 2 + SMALL_SIZE;
      for (const line of lines) {
        const lw = textWidth(line, SMALL_SIZE, true);
        const rx = align === 'center' ? lx - lw / 2 : align === 'right' ? lx - lw : lx;
        // A slab of paper behind the label so it stays legible where it crosses
        // its own arrow.
        out.push(
          `<rect x="${round(rx - 3)}" y="${round(ly - SMALL_SIZE + 1)}" width="${round(lw + 6)}" height="${round(SMALL_SIZE * LINE_HEIGHT)}" fill="${PAPER}"/>`,
        );
        out.push(
          `<text x="${round(lx)}" y="${round(ly)}" text-anchor="${anchorAttr}" font-family="${MONO_STACK}" font-size="${SMALL_SIZE}" fill="${edge.tone ? t.stroke : MUTED}">${esc(line)}</text>`,
        );
        ly += SMALL_SIZE * LINE_HEIGHT;
      }
    }
  }

  for (const note of spec.notes ?? []) {
    const size = note.size ?? SMALL_SIZE;
    const lines = wrap(note.text, size, note.w ?? 260, note.mono ?? true);
    let ly = note.y + size;
    for (const line of lines) {
      out.push(
        `<text x="${note.x}" y="${round(ly)}" font-family="${note.mono === false ? FONT_STACK : MONO_STACK}" font-size="${size}" fill="${note.color ?? MUTED}">${esc(line)}</text>`,
      );
      ly += size * LINE_HEIGHT;
    }
  }

  out.push('</svg>');
  return `${out.join('\n')}\n`;
}

/* ------------------------------------------------------------------ *
 * Integrity check
 * ------------------------------------------------------------------ */

/**
 * Excalidraw silently discards a binding whose target is missing from
 * `elements`, and a bound label whose container has vanished. Both failures are
 * invisible until you open the file, so assert the graph is closed here.
 */
function assertSceneIntegrity(name, elements) {
  const ids = new Set(elements.map((e) => e.id));
  const problems = [];
  for (const el of elements) {
    for (const key of ['startBinding', 'endBinding']) {
      const binding = el[key];
      if (binding && !ids.has(binding.elementId)) {
        problems.push(`${el.type} ${el.id}: ${key} -> missing ${binding.elementId}`);
      }
    }
    if (el.containerId && !ids.has(el.containerId)) {
      problems.push(`text ${el.id}: containerId -> missing ${el.containerId}`);
    }
    for (const bound of el.boundElements ?? []) {
      if (!ids.has(bound.id)) {
        problems.push(`${el.type} ${el.id}: boundElements -> missing ${bound.id}`);
      }
    }
    if (el.type === 'arrow') {
      const [first] = el.points;
      if (first[0] !== 0 || first[1] !== 0) {
        problems.push(`arrow ${el.id}: points[0] must be [0,0], got [${first}]`);
      }
      if (el.points.length < 2) problems.push(`arrow ${el.id}: needs >= 2 points`);
    }
    if (!(el.version > 0)) problems.push(`${el.type} ${el.id}: version must be > 0`);
  }
  if (problems.length) {
    throw new Error(`${name}: scene integrity failed\n  - ${problems.join('\n  - ')}`);
  }
}

/* ------------------------------------------------------------------ *
 * Layout check
 * ------------------------------------------------------------------ */

const overlaps = (a, b, slack = 0) =>
  a.x < b.x + b.w - slack &&
  b.x < a.x + a.w - slack &&
  a.y < b.y + b.h - slack &&
  b.y < a.y + a.h - slack;

const noteBox = (note) => {
  const size = note.size ?? SMALL_SIZE;
  const lines = wrap(note.text, size, note.w ?? 260, note.mono ?? true);
  return {
    x: note.x,
    y: note.y,
    w: Math.max(...lines.map((l) => textWidth(l, size, note.mono !== false))),
    h: lines.length * size * LINE_HEIGHT,
    label: `note "${lines[0].slice(0, 28)}…"`,
  };
};

/**
 * Everything a rendered diagram can get wrong that JSON validity will not
 * catch: text spilling out of its box, two boxes on top of each other, a label
 * printed over a node. Rasterising to look at it is not available here, so the
 * geometry is asserted instead — and these run on every generation, so a spec
 * edit that collides is a build failure rather than a silently ugly picture.
 */
function checkLayout(spec, nodes, byId) {
  const problems = [];

  for (const node of nodes) {
    if (node.kind === 'table') {
      const worst = Math.max(
        ...node.fields.map(
          ([name, type]) => textWidth(name, FIELD_SIZE, true) + textWidth(type ?? '', FIELD_SIZE, true),
        ),
      );
      // 12px padding each side, plus an 8px gutter between the two columns.
      if (worst + 32 > node.w) {
        problems.push(`table ${node.id}: widest row needs ${Math.ceil(worst + 32)}px, box is ${node.w}px`);
      }
      const titleW = textWidth(node.label, LABEL_SIZE, true);
      if (titleW + 20 > node.w) {
        problems.push(`table ${node.id}: title needs ${Math.ceil(titleW + 20)}px, box is ${node.w}px`);
      }
      continue;
    }
    const inner = node.w - BOX_PAD_X * 2;
    for (const line of node.lines) {
      if (textWidth(line, LABEL_SIZE, node.mono) > inner + 1) {
        problems.push(`node ${node.id}: label line "${line}" overflows the box`);
      }
    }
    for (const line of node.subLines) {
      if (textWidth(line, SMALL_SIZE, true) > inner + 1) {
        problems.push(`node ${node.id}: caption line "${line}" overflows the box`);
      }
    }
  }

  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      if (overlaps(nodes[i], nodes[j])) {
        problems.push(`nodes ${nodes[i].id} and ${nodes[j].id} overlap`);
      }
    }
  }

  const notes = (spec.notes ?? []).map(noteBox);
  for (const note of notes) {
    for (const node of nodes) {
      if (overlaps(note, node, 2)) problems.push(`${note.label} overlaps node ${node.id}`);
    }
  }
  for (let i = 0; i < notes.length; i += 1) {
    for (let j = i + 1; j < notes.length; j += 1) {
      if (overlaps(notes[i], notes[j], 2)) {
        problems.push(`${notes[i].label} overlaps ${notes[j].label}`);
      }
    }
  }

  for (const edge of spec.edges ?? []) {
    if (!edge.label) continue;
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    const points = route(anchor(from, (edge.sides ?? ['r', 'l'])[0]), anchor(to, (edge.sides ?? ['r', 'l'])[1]), edge.via);
    const mid = edgeLabelAnchor(points, edge);
    const lines = wrap(edge.label, SMALL_SIZE, edge.labelWidth ?? 190, true);
    const widest = Math.max(...lines.map((l) => textWidth(l, SMALL_SIZE, true)));
    const align = edge.labelAlign ?? 'left';
    const lx = mid[0] + (edge.labelDx ?? 8);
    const box = {
      x: align === 'center' ? lx - widest / 2 : align === 'right' ? lx - widest : lx,
      y: mid[1] + (edge.labelDy ?? -8) - (lines.length * SMALL_SIZE * LINE_HEIGHT) / 2,
      w: widest,
      h: lines.length * SMALL_SIZE * LINE_HEIGHT,
    };
    for (const node of nodes) {
      if (overlaps(box, node, 2)) {
        problems.push(`edge label "${lines[0]}" (${edge.from}->${edge.to}) overlaps node ${node.id}`);
      }
    }
    for (const note of notes) {
      if (overlaps(box, note, 2)) {
        problems.push(`edge label "${lines[0]}" (${edge.from}->${edge.to}) overlaps ${note.label}`);
      }
    }
  }

  // A group frame is a visual container: a node must be wholly in or wholly out,
  // never straddling the border.
  const groups = spec.groups ?? [];
  for (const group of groups) {
    for (const node of nodes) {
      const inside =
        node.x >= group.x && node.y >= group.y &&
        node.x + node.w <= group.x + group.w && node.y + node.h <= group.y + group.h;
      if (!inside && overlaps(node, group)) {
        problems.push(`node ${node.id} straddles the border of group "${group.label}"`);
      }
    }
  }

  // Two frames crossing each other reads as one broken box. Nesting is fine —
  // that is a deliberate hierarchy — so only partial overlap is a problem.
  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      const [a, b] = [groups[i], groups[j]];
      if (!overlaps(a, b)) continue;
      const nested =
        (a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h) ||
        (b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h);
      if (!nested) {
        problems.push(`group frames "${a.label}" and "${b.label}" cross each other`);
      }
    }
  }

  if (problems.length) {
    throw new Error(`${spec.name}: layout check failed\n  - ${problems.join('\n  - ')}`);
  }
}

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */

/**
 * A group declared with `members` is fitted around those nodes once their real
 * heights are known. Hand-written frame coordinates drift out of date the moment
 * a caption wraps to another line, which is how you end up with a box clipping
 * through the node it is meant to contain.
 */
function fitGroups(spec, byId) {
  const GROUP_PAD = 22;
  const GROUP_LABEL_H = 26;
  for (const group of spec.groups ?? []) {
    if (!group.members) continue;
    const members = group.members.map((id) => {
      const node = byId.get(id);
      if (!node) throw new Error(`${spec.name}: group "${group.label}" names unknown node ${id}`);
      return node;
    });
    group.x = Math.min(...members.map((n) => n.x)) - GROUP_PAD;
    group.y = Math.min(...members.map((n) => n.y)) - GROUP_PAD - GROUP_LABEL_H;
    group.w = Math.max(...members.map((n) => n.x + n.w)) + GROUP_PAD - group.x;
    group.h = Math.max(...members.map((n) => n.y + n.h)) + GROUP_PAD - group.y;
  }
}

function build(spec) {
  const nodes = spec.nodes.map((n) => ({ w: 220, tone: 'neutral', ...n }));
  const byId = measureNodes(nodes);
  fitGroups(spec, byId);
  checkLayout(spec, nodes, byId);
  const elements = makeScene(spec, nodes, byId);
  assertSceneIntegrity(spec.name, elements);

  const dir = join(REPO_ROOT, spec.dir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${spec.name}.excalidraw`), toExcalidraw(elements));
  writeFileSync(join(dir, `${spec.name}.svg`), toSvg(spec, nodes, byId));
  return { path: `${spec.dir}/${spec.name}`, elements: elements.length };
}

/* ================================================================== *
 * Diagram specifications
 *
 * Every label below is taken from the code it describes. If you rename a file
 * or change a status code, change it here too.
 * ================================================================== */

const FE_DIR = 'frontend-core/docs/diagrams';
const BE_DIR = 'backend-core/docs/diagrams';
const ROOT_DIR = 'docs/diagrams';

/* ---- 1. Frontend request / response flow ------------------------- */

const feRequestFlow = (() => {
  const X = 60;
  const W = 330;
  const BX = 500;
  const BW = 340;
  const H = 62; // every box here is one label line plus one caption line
  const row = (i) => 60 + i * 116;
  const mid = (i) => row(i) + H / 2;

  return {
    name: 'request-flow',
    dir: FE_DIR,
    title: 'frontend-core — request / response flow',
    alt: 'A request travelling from the browser through AuthGuard, the page component, useApi, AuthProvider.request and apiRequest to the Django API, with the 401 refresh-and-replay branch alongside.',
    groups: [
      { label: 'happy path', tone: 'plain', members: ['browser', 'guard', 'page', 'useapi', 'request', 'apireq', 'api', 'grid'] },
      { label: '401 handling — lib/auth.tsx', tone: 'alert', members: ['refresh', 'refreshep', 'replay', 'expired', 'login'] },
    ],
    nodes: [
      { id: 'browser', x: X, y: row(0), w: W, tone: 'client', label: 'Browser', sub: 'opens /products?page=2' },
      { id: 'guard', x: X, y: row(1), w: W, tone: 'client', label: 'AuthGuard', sub: 'app/(protected)/layout.tsx' },
      { id: 'page', x: X, y: row(2), w: W, tone: 'client', label: 'products-view.tsx', sub: 'reads ?page= and ?location=' },
      { id: 'useapi', x: X, y: row(3), w: W, tone: 'accent', label: 'useApi(fetcher, deps)', sub: 'lib/use-api.ts — aborts on unmount' },
      { id: 'request', x: X, y: row(4), w: W, tone: 'accent', label: 'AuthProvider.request()', sub: 'lib/auth.tsx — adds the Bearer header' },
      { id: 'apireq', x: X, y: row(5), w: W, tone: 'accent', label: 'apiRequest()', sub: 'lib/api.ts — + /api/v1, parses body' },
      { id: 'api', x: X, y: row(6), w: W, tone: 'server', label: 'Django API', sub: 'GET /api/v1/products/' },
      { id: 'grid', x: X, y: row(7), w: W, tone: 'client', label: 'ProductGrid renders', sub: '12 cards + PaginationControls' },

      { id: 'refresh', x: BX, y: row(3), w: BW, tone: 'alert', label: 'doRefresh()', sub: 'single-flight across concurrent 401s' },
      { id: 'refreshep', x: BX, y: row(4), w: BW, tone: 'server', label: 'POST /auth/login/refresh/', sub: 'returns access + rotated refresh' },
      { id: 'replay', x: BX, y: row(5), w: BW, tone: 'client', label: 'save(), then replay once', sub: 'same request, new access token' },
      { id: 'expired', x: BX, y: row(6), w: BW, tone: 'alert', label: "save(null) → 'anonymous'", sub: 'the refresh was rejected' },
      { id: 'login', x: BX, y: row(7), w: BW, tone: 'client', label: '/login?next=…', sub: 'AuthGuard redirects' },
    ],
    edges: [
      { from: 'browser', to: 'guard', sides: ['b', 't'], label: 'status must be\n"authenticated"', labelDx: 14, labelDy: 0 },
      { from: 'guard', to: 'page', sides: ['b', 't'], label: 'children mount only\nonce a token exists', labelDx: 14, labelDy: 0 },
      { from: 'page', to: 'useapi', sides: ['b', 't'] },
      { from: 'useapi', to: 'request', sides: ['b', 't'], label: 'page, page_size=12,\nlocation', labelDx: 14, labelDy: 0 },
      { from: 'request', to: 'apireq', sides: ['b', 't'] },
      { from: 'apireq', to: 'api', sides: ['b', 't'], label: 'Authorization:\nBearer <access>', labelDx: 14, labelDy: 0 },
      { from: 'api', to: 'grid', sides: ['b', 't'], tone: 'server', label: '200 →\nPaginated<Product>', labelDx: 14, labelDy: 0 },
      // Out of the spine on a 401, up the gutter, into the refresh branch.
      { from: 'api', to: 'refresh', sides: ['r', 'l'], via: [[X + W + 46, mid(6)], [X + W + 46, mid(3)]], tone: 'alert', label: '401', labelDx: -44, labelDy: -6, labelWidth: 40 },
      { from: 'refresh', to: 'refreshep', sides: ['b', 't'], tone: 'alert' },
      { from: 'refreshep', to: 'replay', sides: ['b', 't'], tone: 'server', label: '200', labelDx: 14, labelDy: 0, labelWidth: 40 },
      { from: 'refreshep', to: 'expired', sides: ['r', 'r'], via: [[BX + BW + 46, mid(4)], [BX + BW + 46, mid(6)]], tone: 'alert', label: '401', labelDx: 8, labelDy: -6, labelWidth: 40 },
      { from: 'expired', to: 'login', sides: ['b', 't'], tone: 'alert' },
      { from: 'replay', to: 'apireq', sides: ['l', 'r'], via: [[X + W + 46, mid(5)], [X + W + 46, mid(5)]], tone: 'client', label: 'retried once', labelDx: -60, labelDy: -22, labelWidth: 120 },
    ],
    notes: [
      {
        x: X,
        y: row(8) + 30,
        w: 800,
        text: 'A 401 is replayed exactly once, never in a loop. Refresh is single-flight because the API sets ROTATE_REFRESH_TOKENS=True: spending the same refresh token twice would invalidate a live session, so concurrent 401s must share one refresh call.',
      },
    ],
  };
})();

/* ---- 2. Frontend client data model ------------------------------- */

const feDataModel = {
  name: 'client-data-model',
  dir: FE_DIR,
  title: 'frontend-core — client-side data model (no database)',
  alt: 'The market_session record held in localStorage and the TypeScript types in lib/api.ts, showing how Order embeds a Product and Paginated wraps a list of them.',
  groups: [
    { label: 'browser storage — localStorage', tone: 'client', members: ['session'] },
    { label: 'types mirroring the DRF serializers — lib/api.ts', tone: 'accent', members: ['user', 'product', 'order', 'paginated'] },
  ],
  nodes: [
    {
      id: 'session', kind: 'table', x: 70, y: 96, w: 260, tone: 'client',
      label: "'market_session'",
      fields: [['access', 'string (JWT)'], ['refresh', 'string (JWT)'], ['user', 'User'], ['— 30 min / 60 min', '']],
    },
    {
      id: 'user', kind: 'table', x: 450, y: 96, w: 260, tone: 'accent',
      label: 'User',
      fields: [['id', 'number'], ['username', 'string'], ['email', 'string']],
    },
    {
      id: 'product', kind: 'table', x: 810, y: 96, w: 280, tone: 'data',
      label: 'Product',
      fields: [['id', 'number'], ['title', 'string'], ['description', 'string'], ['price', 'string'], ['location', "'JO' | 'SA'"]],
    },
    {
      id: 'order', kind: 'table', x: 450, y: 290, w: 280, tone: 'server',
      label: 'Order',
      fields: [['order_number', 'string (uuid)'], ['product', 'Product'], ['quantity', 'number'], ['unit_price', 'string'], ['total_price', 'string'], ['status', 'string'], ['created_at', 'string (iso)']],
    },
    {
      id: 'paginated', kind: 'table', x: 810, y: 320, w: 280, tone: 'neutral',
      label: 'Paginated<T>',
      fields: [['count', 'number'], ['next', 'string | null'], ['previous', 'string | null'], ['results', 'T[]']],
    },
  ],
  edges: [
    { from: 'session', to: 'user', sides: ['r', 'l'], label: 'holds', labelDx: 10, labelDy: -6, labelWidth: 60 },
    // Round the corner underneath Product rather than across it.
    { from: 'order', to: 'product', sides: ['r', 'bl'], via: [[770, 330], [770, 282], [880, 282]], tone: 'data', label: 'embeds Product', labelDx: -60, labelDy: -18, labelWidth: 150 },
    { from: 'paginated', to: 'product', sides: ['t', 'b'], tone: 'data', label: 'results: Product[]', labelDx: 12, labelDy: 0, labelWidth: 160 },
  ],
  notes: [
    {
      x: 40,
      y: 580,
      w: 1080,
      text: 'The frontend owns no database — this is its type and storage model. Prices stay strings all the way to the screen because that is how DRF serialises DecimalField, and parsing them into floats would introduce rounding the server never had. The API exposes no currency field, so amounts render as plain numbers.',
    },
    {
      x: 60,
      y: 300,
      w: 290,
      text: 'Written on sign-in, cleared on sign-out or a failed refresh. The storage event propagates a sign-out to other tabs.',
    },
  ],
};

/* ---- 3. Backend request / response flow -------------------------- */

const beRequestFlow = (() => {
  const X = 60;
  const W = 340;
  const BX = 500;
  const BW = 330;
  const row = (i) => 60 + i * 140;

  return {
    name: 'request-flow',
    dir: BE_DIR,
    title: 'backend-core — request / response flow',
    alt: 'An HTTP request routed through config.urls, api.urls and api.v1.urls into a DRF generic view, past JWT authentication and the IsAuthenticated permission, through a serializer and the ORM to MySQL.',
    groups: [
      { label: 'routing', tone: 'plain', members: ['cfg', 'apiurls', 'v1'] },
      { label: 'DRF pipeline', tone: 'server', members: ['auth', 'perm', 'view', 'ser'] },
      { label: 'orders/purchase/ — the write path', tone: 'accent', members: ['idem', 'txn', 'lock', 'snap', 'created'] },
    ],
    nodes: [
      { id: 'client', x: X, y: row(0), w: W, tone: 'client', label: 'HTTP request', sub: 'Authorization: Bearer <access>' },
      { id: 'cfg', x: X, y: row(1), w: W, tone: 'neutral', label: 'config/urls.py', sub: '/admin/  /swagger/  /redoc/  /api/' },
      { id: 'apiurls', x: X, y: row(2), w: W, tone: 'neutral', label: 'api/urls.py', sub: "path('v1/', …) — the version seam" },
      { id: 'v1', x: X, y: row(3), w: W, tone: 'neutral', label: 'api/v1/urls.py', sub: 'auth/ | products/ | orders/' },
      { id: 'auth', x: X, y: row(4), w: W, tone: 'alert', label: 'JWTAuthentication', sub: 'simplejwt — decodes the bearer token' },
      { id: 'perm', x: X, y: row(5), w: W, tone: 'alert', label: 'IsAuthenticated', sub: 'DRF default for every endpoint' },
      { id: 'view', x: X, y: row(6), w: W, tone: 'server', label: 'generic view', sub: 'List / Retrieve / Create — one verb each' },
      { id: 'ser', x: X, y: row(7), w: W, tone: 'server', label: 'serializer', sub: 'validate in, shape out' },
      { id: 'orm', x: X, y: row(8), w: W, tone: 'data', label: 'model / ORM', sub: 'products.Product · orders.Order' },
      { id: 'db', x: X + 40, y: row(9) + 6, w: W - 80, h: 76, kind: 'db', tone: 'data', label: 'MySQL 8.4', sub: 'container app-db' },

      { id: 'idem', x: BX, y: row(3), w: BW, tone: 'alert', label: 'Idempotency-Key (required)', sub: 'seen before → 200 + replay' },
      { id: 'txn', x: BX, y: row(4), w: BW, tone: 'accent', label: 'transaction.atomic()', sub: 'api/v1/orders/views.py' },
      { id: 'lock', x: BX, y: row(5), w: BW, tone: 'accent', label: 'select_for_update()', sub: 'row lock on the product' },
      { id: 'snap', x: BX, y: row(6), w: BW, tone: 'accent', label: 'snapshot the price', sub: 'unit_price = total_price = price' },
      { id: 'created', x: BX, y: row(7), w: BW, tone: 'server', label: '201 Created', sub: 'UUID order_number, status COMPLETED' },
    ],
    edges: [
      { from: 'client', to: 'cfg', sides: ['b', 't'] },
      { from: 'cfg', to: 'apiurls', sides: ['b', 't'], label: "include('api.urls')", labelDx: 14, labelDy: 0, labelWidth: 200 },
      { from: 'apiurls', to: 'v1', sides: ['b', 't'] },
      { from: 'v1', to: 'auth', sides: ['b', 't'] },
      { from: 'auth', to: 'perm', sides: ['b', 't'] },
      { from: 'perm', to: 'view', sides: ['b', 't'] },
      { from: 'view', to: 'ser', sides: ['b', 't'] },
      { from: 'ser', to: 'orm', sides: ['b', 't'] },
      { from: 'orm', to: 'db', sides: ['b', 't'], tone: 'data', label: 'SQL', labelDx: 14, labelDy: 0, labelWidth: 60 },
      { from: 'auth', to: 'perm', sides: ['l', 'l'], via: [[X - 46, row(4) + 34], [X - 46, row(5) + 34]], tone: 'alert', dashed: true, label: '401 on a bad\nor missing token', labelDx: -190, labelDy: -4, labelWidth: 180, labelAlign: 'left' },
      { from: 'view', to: 'idem', sides: ['r', 'l'], via: [[X + W + 46, row(6) + 34], [X + W + 46, row(3) + 34]], tone: 'accent', label: 'POST\npurchase', labelDx: -40, labelDy: 0, labelWidth: 80 },
      { from: 'idem', to: 'txn', sides: ['b', 't'], tone: 'accent', label: 'new key', labelDx: 14, labelDy: 0, labelWidth: 80 },
      { from: 'txn', to: 'lock', sides: ['b', 't'], tone: 'accent' },
      { from: 'lock', to: 'snap', sides: ['b', 't'], tone: 'accent' },
      { from: 'snap', to: 'created', sides: ['b', 't'], tone: 'accent' },
    ],
    notes: [
      {
        x: X,
        y: row(10) + 40,
        w: 800,
        text: 'The domain apps hold models only; every serializer, view, route, filter and paginator lives under api/v1/<domain>/. Adding /api/v2/ means a new package beside v1 — no model change.',
      },
      {
        x: BX,
        y: row(8) + 6,
        w: 340,
        text: 'The lock plus the atomic block make two simultaneous purchases of the same product serialise. The Idempotency-Key makes a retry safe: a repeat returns the original order rather than placing a second one, enforced by a unique constraint so even a concurrent retry cannot slip through.',
      },
    ],
  };
})();

/* ---- 4. Backend ERD ---------------------------------------------- */

const beErd = {
  name: 'erd',
  dir: BE_DIR,
  title: 'backend-core — database schema',
  alt: 'Three tables: auth_user, products_product and orders_order, with orders_order holding protected foreign keys to both.',
  nodes: [
    {
      id: 'user', kind: 'table', x: 60, y: 80, w: 300, tone: 'client',
      label: 'auth_user',
      fields: [['id  PK', 'bigint'], ['username  UQ', 'varchar(150)'], ['email', 'varchar(254)'], ['password', 'varchar(128)'], ['is_active', 'bool'], ['…django.contrib.auth', '']],
    },
    {
      id: 'product', kind: 'table', x: 780, y: 80, w: 320, tone: 'data',
      label: 'products_product',
      fields: [['id  PK', 'bigint'], ['title', 'varchar(255)'], ['description', 'longtext'], ['price', 'decimal(10,2)'], ['location  IX', 'varchar(2)'], ['created_at', 'datetime'], ['updated_at', 'datetime']],
    },
    {
      id: 'order', kind: 'table', x: 400, y: 330, w: 340, tone: 'server',
      label: 'orders_order',
      fields: [['id  PK', 'bigint'], ['order_number  UQ IX', 'uuid'], ['user_id  FK', 'bigint'], ['product_id  FK', 'bigint'], ['quantity', 'int unsigned NULL'], ['unit_price', 'decimal(10,2) NULL'], ['total_price', 'decimal(10,2) NULL'], ['status', 'varchar(20)'], ['idempotency_key', 'varchar(255) NULL'], ['created_at', 'datetime'], ['UQ (user_id, idempotency_key)', '']],
    },
  ],
  edges: [
    { from: 'order', to: 'user', sides: ['l', 'b'], via: [[300, 364], [300, 300], [210, 300]], tone: 'client', label: 'user_id → auth_user.id\non_delete=PROTECT\nrelated_name="orders"', labelDx: -220, labelDy: -26, labelWidth: 230 },
    { from: 'order', to: 'product', sides: ['r', 'b'], via: [[840, 364], [840, 300], [940, 300]], tone: 'data', label: 'product_id → products_product.id\non_delete=PROTECT\nrelated_name="orders"', labelDx: 10, labelDy: -26, labelWidth: 300 },
  ],
  notes: [
    {
      x: 60,
      y: 645,
      w: 1040,
      text: 'PROTECT on both keys: an order must never end up without a buyer or an item, so the delete is refused rather than cascaded. unit_price and total_price are copied at purchase time, so editing a product later cannot rewrite what someone was charged. order_number is a UUID, which keeps receipt URLs unguessable — and the receipt queryset is scoped to request.user, so another user gets the same 404 as a stranger.',
    },
    {
      x: 60,
      y: 735,
      w: 1040,
      text: 'The unique constraint on (user_id, idempotency_key) is what makes purchases idempotent: a retry cannot insert a second order under the same key, not even concurrently. The header is required, so nothing new is written without a key; the column stays nullable only because rows created before the change have NULL, and inventing keys for them would put fiction in the database.',
    },
    {
      x: 60,
      y: 825,
      w: 1040,
      text: 'status is one of PENDING | COMPLETED | FAILED. Orders are created COMPLETED (the model default) because a purchase settles synchronously; the other two are there for a future payment step. accounts/ defines no model — AUTH_USER_MODEL is Django\'s built-in User.',
    },
  ],
};

/* ---- 5. Root: how the halves communicate ------------------------- */

const rootComms = {
  name: 'fe-be-communication',
  dir: ROOT_DIR,
  title: 'How frontend-core and backend-core communicate',
  alt: 'The browser runs the Next.js app on port 3000 and calls the Django API on port 8000 directly; Django talks to MySQL inside the Docker network.',
  groups: [
    { label: "the user's browser", tone: 'client', members: ['next', 'store', 'server'] },
    { label: 'docker compose — network app-network', tone: 'server', members: ['django', 'mysql'] },
  ],
  nodes: [
    { id: 'next', x: 70, y: 110, w: 340, tone: 'client', label: 'Next.js app', sub: 'localhost:3000 — client components' },
    { id: 'store', x: 70, y: 230, w: 340, tone: 'accent', label: 'localStorage', sub: "'market_session' — access + refresh" },
    { id: 'server', x: 70, y: 380, w: 340, tone: 'neutral', label: 'Next.js server', sub: 'renders shells only, never the API' },

    { id: 'django', x: 650, y: 150, w: 420, tone: 'server', label: 'Django + DRF', sub: 'app container — localhost:8000' },
    { id: 'mysql', x: 700, y: 330, w: 320, h: 90, kind: 'db', tone: 'data', label: 'MySQL 8.4', sub: 'app-db — host 3307 → 3306' },
  ],
  edges: [
    { from: 'next', to: 'django', sides: ['r', 'l'], via: [[525, 141], [525, 181]], tone: 'server', label: 'fetch /api/v1/… + Bearer\nNEXT_PUBLIC_API_BASE_URL', labelDx: -132, labelDy: -56, labelWidth: 270, labelAlign: 'left' },
    { from: 'django', to: 'next', sides: ['b', 'r'], via: [[860, 290], [525, 290], [525, 161]], tone: 'client', label: 'JSON + CORS headers\nCORS_ALLOWED_ORIGINS', labelDx: -110, labelDy: -46, labelWidth: 260 },
    { from: 'next', to: 'store', sides: ['b', 't'], tone: 'accent', label: 'read / write tokens', labelDx: 12, labelDy: 0, labelWidth: 180 },
    { from: 'django', to: 'mysql', sides: ['b', 't'], tone: 'data', label: 'DATABASE_HOST=app-db', labelDx: 14, labelDy: 0, labelWidth: 240 },
  ],
  notes: [
    {
      x: 40,
      y: 530,
      w: 1070,
      text: 'The token never reaches the Next.js server: it lives in localStorage and is attached in the browser. That keeps the credential off the server, and it is also why every page that touches the API is a client component — server components cannot read localStorage.',
    },
    {
      x: 40,
      y: 645,
      w: 1070,
      text: 'Two independent processes, so both halves of the origin contract have to agree: the browser must call the origin in NEXT_PUBLIC_API_BASE_URL, and that origin must appear in CORS_ALLOWED_ORIGINS on the Django side. MySQL is reachable from the host on 3307 for a GUI client, but the app container reaches it as app-db:3306.',
    },
  ],
};

/* ------------------------------------------------------------------ */

const DIAGRAMS = [feRequestFlow, feDataModel, beRequestFlow, beErd, rootComms];

let failed = false;
for (const spec of DIAGRAMS) {
  try {
    const { path, elements } = build(spec);
    console.log(`  ok  ${path}.{excalidraw,svg}  (${elements} elements)`);
  } catch (error) {
    failed = true;
    console.error(`fail  ${spec.dir}/${spec.name}: ${error.message}`);
  }
}
console.log(failed ? 'generation failed' : `generated ${DIAGRAMS.length} diagrams`);
process.exit(failed ? 1 : 0);
