import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { root } from '../scripts/validate.mjs';

const source = fs.readFileSync(path.join(root, 'analytics.js'), 'utf8');
function run(hostname) {
  const scripts = [];
  const context = vm.createContext({ window: { location: { hostname } }, document: {
    createElement: (tag) => ({ tagName: tag }),
    head: { appendChild: (node) => scripts.push(node) },
  } });
  vm.runInContext(source, context);
  return { context, scripts };
}

test('the original GA4 tag is configured once per live document without manual duplicate pageviews', () => {
  for (const hostname of ['paperonboard.in', 'www.paperonboard.in']) {
    const { context, scripts } = run(hostname);
    vm.runInContext(source, context);
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0].async, true);
    assert.equal(scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-F7Y6W97FD0');
    const commands = Array.from(context.window.dataLayer, (command) => Array.from(command));
    assert.equal(commands.length, 2);
    assert.equal(commands[0][0], 'js');
    assert.deepEqual(commands[1], ['config', 'G-F7Y6W97FD0']);
    assert.ok(!commands.some((command) => command[0] === 'event'));
  }
});

test('local and preview hosts never load Google Analytics or queue tracking', () => {
  for (const hostname of ['localhost', '127.0.0.1', 'preview.example', 'paperonboard.in.example', 'other.paperonboard.in']) {
    const { context, scripts } = run(hostname);
    assert.equal(scripts.length, 0);
    assert.equal(context.window.dataLayer, undefined);
  }
});

test('every sitemap content page includes the versioned Analytics bootstrap exactly once', () => {
  const directory = path.join(root, 'dist');
  assert.equal(fs.readFileSync(path.join(directory, 'analytics.js'), 'utf8'), source);
  const sitemap = fs.readFileSync(path.join(directory, 'sitemap.xml'), 'utf8');
  for (const match of sitemap.matchAll(/<loc>(.*?)<\/loc>/g)) {
    const filename = new URL(match[1]).pathname.slice(1) || 'index.html';
    const html = fs.readFileSync(path.join(directory, filename), 'utf8');
    assert.equal([...html.matchAll(/<script defer src="analytics\.js\?v=[a-f0-9]{12}"><\/script>/g)].length, 1, filename);
    assert.ok(!html.includes("gtag('event', 'page_view'"));
  }
});
