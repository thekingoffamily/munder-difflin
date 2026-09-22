'use strict';

// The Russian locale. Mirrors the structural half of the Arabic suite: coverage,
// shape and registration — never whether the Russian reads well. The strings
// were written by an agent, not reviewed by a native speaker.
//
// The invariants that matter: Russian is registered in every place a language
// has to be, it is LEFT-TO-RIGHT (so it must not arm any RTL branch), it carries
// exactly the same key tree as English, and it does not silently ship English
// strings under a Russian label.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const locale = (code) =>
  JSON.parse(read(`src/renderer/src/i18n/locales/${code}.json`));

/** Every leaf path in a locale tree, arrays included by index. */
function leaves(node, prefix = '') {
  if (Array.isArray(node)) return node.flatMap((v, i) => leaves(v, `${prefix}.${i}`));
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
  }
  return [[prefix, node]];
}
const pathsOf = (o) => new Map(leaves(o));

const en = locale('en');
const ru = locale('ru');

test('ru is registered everywhere a language has to be', () => {
  const src = read('src/renderer/src/i18n/index.ts');
  assert.match(src, /ru: \{ translation: ru \}/, 'ru is missing from resources');
  assert.match(src, /supportedLngs: \[[^\]]*'ru'[^\]]*\]/, 'ru is missing from supportedLngs');
  assert.match(src, /code: 'ru'[^}]*dir: 'ltr'/, 'ru must be marked left-to-right');
  assert.match(src, /import ru from '\.\/locales\/ru\.json'/, 'ru is not imported');
});

test('ru is left-to-right, so it arms no RTL branch', () => {
  const src = read('src/renderer/src/i18n/index.ts');
  // The RTL set is derived from LANGUAGES; 'ru' carries dir:'ltr', so it can
  // never appear in it. This pins the direction that the inertness argument
  // depends on.
  assert.doesNotMatch(src, /'ru'[^\n]*'rtl'/);
  const langs = read('src/renderer/src/i18n/index.ts');
  assert.match(langs, /LANGUAGES\.filter\(\(l\) => l\.dir === 'rtl'\)/);
});

test('every ru leaf path matches en exactly', () => {
  const e = pathsOf(en), r = pathsOf(ru);
  const missing = [...e.keys()].filter((k) => !r.has(k));
  const extra = [...r.keys()].filter((k) => !e.has(k));
  assert.deepEqual(missing, [], 'ru is missing keys — they would silently fall back');
  assert.deepEqual(extra, [], 'ru has keys en does not — dead strings');
  // Arrays must keep their length, or an indexed read runs out of range.
  const count = (o, p) => p.split('.').reduce((n, s) => n?.[s], o);
  for (const p of ['office.errand.smoke', 'office.suckUp', 'office.gossip', 'office.cheer']) {
    assert.equal(count(ru, p).length, count(en, p).length, `${p} changed length`);
  }
});

test('every interpolation variable survives translation', () => {
  const e = pathsOf(en), r = pathsOf(ru);
  const vars = (s) => [...String(s).matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]).sort().join(',');
  const bad = [];
  for (const [k, v] of e) {
    if (vars(v) !== vars(r.get(k))) bad.push(`${k}: [${vars(v)}] -> [${vars(r.get(k))}]`);
  }
  assert.deepEqual(bad, []);
});

test('inline markup is preserved', () => {
  const e = pathsOf(en), r = pathsOf(ru);
  const tags = (s) => [...String(s).matchAll(/<\/?([a-z]+)>/g)].map((m) => m[1]).sort().join(',');
  for (const [k, v] of e) {
    assert.equal(tags(r.get(k)), tags(v), `markup changed in ${k}`);
  }
});

test('no Russian string is left as its English source', () => {
  // Same rationale as the Arabic suite: a copied English string looks
  // translated and is not, which is worse than a deliberate fallback.
  // IDENTICAL ON PURPOSE: product names, filesystem paths, a literal slash
  // command, and pure interpolation templates.
  const SAME_ON_PURPOSE = new Set([
    'commandBar.skill',                    // "/skill" — a typed command
    'settings.connections.slack',          // product name
    'commandCenter.logMessage',            // "{{from}} → {{to}}: {{subject}}" — pure interpolation
    'commandCenter.openIssue',             // "GitHub Issue #{{num}}: {{title}}" — product label + interpolation
    'addAgent.projectPlaceholder',         // /path/to/your/project — a filesystem path
    'onboarding.providerBlurb.claude',     // "Claude Code — Anthropic": two product names
    'onboarding.providerBlurb.codex',
    'onboarding.providerBlurb.antigravity',
    'onboarding.providerBlurb.gemini',
    'onboarding.home.placeholder',         // /path/to/HarnessAgents — same
    'mcpDefaults.toggleNote',              // "{{id}}: {{state}}" — pure interpolation
    'webhooksSection.summary'              // "{{count}} · {{state}}" — same
  ]);
  const untranslated = [];
  for (const [k, v] of pathsOf(en)) {
    if (typeof v !== 'string' || !/[A-Za-z]{4}/.test(v)) continue;
    if (ru && pathsOf(ru).get(k) === v && !SAME_ON_PURPOSE.has(k)) untranslated.push(k);
  }
  assert.deepEqual(untranslated, [], `${untranslated.length} Russian strings are still English`);
  const r = pathsOf(ru), e = pathsOf(en);
  const stale = [...SAME_ON_PURPOSE].filter((k) => r.get(k) !== e.get(k));
  assert.deepEqual(stale, [], 'allowlisted keys that ARE translated — drop them from the list');
});

test('the translation actually contains Russian', () => {
  // A smoke test that the file is a translation and not an English copy with a
  // few edits: a healthy share of string values must carry Cyrillic.
  const values = [...pathsOf(ru).values()].filter((v) => typeof v === 'string' && v.trim());
  const cyr = values.filter((v) => /[\u0400-\u04FF]/.test(v));
  assert.ok(cyr.length / values.length > 0.8,
    `only ${cyr.length}/${values.length} ru strings contain Cyrillic`);
});
