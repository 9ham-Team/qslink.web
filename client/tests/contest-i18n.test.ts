// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import catalog from '../src/locales/en.js';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('all statically translated contest copy exists in the existing English dictionary — vue3', () => {
  const missing: string[] = [];
  function visit(dir: string) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) visit(file);
      else if (/\.(?:vue|ts)$/.test(file)) {
        const content = fs.readFileSync(file, 'utf8');
        for (const match of content.matchAll(/\bt\(\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/g)) {
          const parsed = ts.createSourceFile('literal.ts', match[1], ts.ScriptTarget.Latest);
          const expression = (parsed.statements[0] as ts.ExpressionStatement).expression;
          if (ts.isStringLiteral(expression) && !Object.hasOwn(catalog, expression.text)) missing.push(file + ': ' + expression.text);
        }
      }
    }
  }
  visit('client/src/contest');
  expect(missing).toEqual([]);
});
