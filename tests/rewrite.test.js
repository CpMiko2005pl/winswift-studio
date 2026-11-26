'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { rewriteForWindows, stripPreviews } = require('../buildtools');

test('preserves framework imports, selectors and overrides inside literals and comments', () => {
  const source = 'let example = """\nimport UIKit\n#selector(foo)\nextension UIWindow { override func test() {} }\n"""\n/* @Model class Never {} */';
  assert.equal(rewriteForWindows(source, { windowClasses: [] }), source);
});
test('actual model conformance and Apple imports are visible to the compiler', () => {
  const source = 'import SwiftData\n@Model final class Note { var title = "" }';
  const output = rewriteForWindows(source, { windowClasses: [] });
  assert.match(output, /import SwiftUI/);
  assert.match(output, /extension Note: PersistentModel/);
  assert.equal(output.split('\n')[1].indexOf('final'), source.split('\n')[1].indexOf('final'));
});
test('preview stripping preserves UTF-16 offsets and both characters of CRLF', () => {
  const src = '// #Preview { Fake() }\r\n#Preview("🟩") {\r\n Text("}")\r\n}\r\nlet x = 1';
  const result = stripPreviews(src);
  assert.equal(result.code.length, src.length);
  assert.deepEqual(result.code.match(/\r\n/g), src.match(/\r\n/g));
  assert.deepEqual(result.previews.map(p => [p.title, p.line, p.endLine]), [['🟩', 2, 4]]);
  assert.match(result.code, /let x = 1$/);
});
