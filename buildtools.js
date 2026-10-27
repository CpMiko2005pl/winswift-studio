'use strict';
// Source rewriting and resource checks shared by the build (main.js) and SwiftCode's tests.

// Apple-only spellings that have to change to build on Windows (line numbers are kept).
const APPLE_IMPORTS = /^([ \t]*(?:@preconcurrency\s+|@_exported\s+)?import\s+)(UIKit|Combine|CoreLocation|CoreLocationUI|MapKit|AVFoundation|PhotosUI)\b/gm;

// @objc / @objc(name) / @objcMembers: Swift on Windows has no Objective-C runtime and rejects them
const OBJC_ATTR = /@objc(?:Members)?\b(?:[ \t]*\([^)\n]*\))?/g;

function rewriteForWindows(src, state) {
  let out = src.replace(APPLE_IMPORTS, '$1SwiftUI');
  // no Objective-C runtime: #selector(Foo.bar) becomes a plain Selector value
  out = out.replace(/#selector\(\s*([^()]*(?:\([^()]*\))?[^()]*)\)/g, (_m, s) => `Selector("${s.replace(/"/g, '')}")`);
  // …and the attributes go, replaced by spaces so lines and columns of the issues stay where they were
  out = replaceInCode(out, OBJC_ATTR, m => ' '.repeat(m.length));
  // Swift can only override in an extension through Objective-C. `extension UIWindow { override func motionEnded… }`
  // (the shake recipe) therefore becomes a UIWindow subclass that SwiftCode installs as the app's window.
  const re = /\bextension\s+(UIWindow|UIResponder)\b[^{]*\{/g;
  let m;
  while ((m = re.exec(out))) {
    const open = m.index + m[0].length - 1;
    const close = matchingBrace(out, open);
    if (close < 0) break;
    const body = out.slice(open + 1, close);
    if (!/\boverride\b/.test(body)) { re.lastIndex = close; continue; }
    const name = `__SwiftCodeWindow${state.windowClasses.length + 1}`;
    const parent = state.windowClasses[state.windowClasses.length - 1] || 'UIWindow';
    state.windowClasses.push(name);
    const header = `open class ${name}: ${parent} {`;
    out = out.slice(0, m.index) + header + out.slice(open + 1);
    re.lastIndex = m.index + header.length;
  }
  return out;
}

/** End (exclusive) of the one-line string literal starting at `start`, stepping over \(interpolations("with strings")). */
function stringEnd(src, start) {
  let j = start + 1;
  while (j < src.length && src[j] !== '"' && src[j] !== '\n') {
    if (src[j] === '\\' && src[j + 1] === '(') {
      let depth = 0;
      for (j += 1; j < src.length && src[j] !== '\n'; j++) {
        if (src[j] === '"') { j = stringEnd(src, j) - 1; continue; }
        if (src[j] === '(') depth++;
        else if (src[j] === ')' && --depth === 0) break;
      }
      j++;
      continue;
    }
    if (src[j] === '\\') j++;
    j++;
  }
  return Math.min(j + 1, src.length);
}

/** Runs a regex replacement only on code — string literals ("…", """…""") and comments are left as they are. */
function replaceInCode(src, re, fn) {
  let out = '', code = '', i = 0;
  const flush = () => { out += code.replace(re, fn); code = ''; };
  while (i < src.length) {
    const c = src[i];
    let end = -1;
    if (src.startsWith('"""', i)) { const e = src.indexOf('"""', i + 3); end = e < 0 ? src.length : e + 3; }
    else if (c === '"') end = stringEnd(src, i);
    else if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); end = e < 0 ? src.length : e; }
    else if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); end = e < 0 ? src.length : e + 2; }
    if (end < 0) { code += c; i++; continue; }
    flush();
    out += src.slice(i, end);
    i = end;
  }
  flush();
  return out;
}

function matchingBrace(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"') { i++; while (i < src.length && src[i] !== '"') { if (src[i] === '\\') i++; i++; } continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 1; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}


/** Parses an old-style .strings file; throws { line, message } like plutil would complain. */
function parseStrings(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let i = 0;
  const out = {};
  const lineAt = k => text.slice(0, k).split('\n').length;
  const fail = msg => { const e = new Error(msg); e.line = lineAt(i); throw e; };
  const skip = () => {
    for (;;) {
      while (i < text.length && /\s/.test(text[i])) i++;
      if (text.startsWith('//', i)) { while (i < text.length && text[i] !== '\n') i++; continue; }
      if (text.startsWith('/*', i)) { const e = text.indexOf('*/', i + 2); if (e < 0) fail('Unterminated comment'); i = e + 2; continue; }
      break;
    }
  };
  const str = () => {
    if (text[i] === '"') {
      i++;
      let s = '';
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\n' && false) break;
        if (text[i] === '\\') { i++; const c = text[i]; s += c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '\r' : c; i++; continue; }
        s += text[i++];
      }
      if (i >= text.length) fail('Unterminated string (missing closing ")');
      i++;
      return s;
    }
    const m = /^[A-Za-z0-9_.$:\/-]+/.exec(text.slice(i));
    if (!m) fail(`Unexpected character '${text[i] === '“' || text[i] === '”' ? text[i] + "' (typographic quote — use straight quotes \")" : text[i] + "'"}`);
    i += m[0].length;
    return m[0];
  };
  skip();
  while (i < text.length) {
    const key = str();
    skip();
    if (text[i] === ';') { out[key] = key; i++; skip(); continue; }
    if (text[i] !== '=') fail(`Expected '=' after key "${key}"`);
    i++; skip();
    const value = str();
    const at = i;
    skip();
    if (text[i] !== ';') { i = at; fail(`Missing ';' after "${key}" = "${value}"`); }
    i++;
    out[key] = value;
    skip();
  }
  return out;
}


module.exports = { rewriteForWindows, matchingBrace, replaceInCode, parseStrings };
