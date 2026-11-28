'use strict';
// Swift packages: stored in project.pbxproj the way Xcode stores them, and turned into the wrapper Package.swift.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const xcode = require('../xcodeproj');
const pkgs = require('../packages');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'WinSwift packages '));
fs.mkdirSync(path.join(root, 'Demo'));
fs.writeFileSync(path.join(root, 'Demo', 'DemoApp.swift'), 'import SwiftUI\n');
xcode.createProject(root, 'Demo', {});
const pbx = xcode.projectFile(root);
const original = fs.readFileSync(pbx, 'utf8');

// adding: reference + product dependency + build file in Frameworks, URL quoted (`//` would start a comment)
let list = xcode.addPackage(root, { url: 'https://github.com/onevcat/Kingfisher.git', requirement: { kind: 'upToNextMajorVersion', minimumVersion: '8.0.0' }, products: ['Kingfisher'] });
assert.equal(list.length, 1);
assert.deepEqual(list[0].requirement, { kind: 'upToNextMajorVersion', minimumVersion: '8.0.0' });
assert.deepEqual(list[0].products.map(p => p.name), ['Kingfisher']);
let text = fs.readFileSync(pbx, 'utf8');
assert.match(text, /repositoryURL = "https:\/\/github\.com\/onevcat\/Kingfisher\.git";/);
assert.match(text, /\/\* Kingfisher in Frameworks \*\/ = \{isa = PBXBuildFile; productRef = [0-9A-F]{24} \/\* Kingfisher \*\/; \};/);
assert.match(text, /packageReferences = \(\n\t\t\t\t[0-9A-F]{24} \/\* XCRemoteSwiftPackageReference "Kingfisher" \*\/,\n\t\t\t\);/);

// the same repository written differently links nothing twice
xcode.addPackage(root, { url: 'git@github.com:onevcat/kingfisher', products: ['Kingfisher'] });
assert.equal(fs.readFileSync(pbx, 'utf8'), text);

// a second package with two products goes into the existing sections
list = xcode.addPackage(root, { url: 'https://github.com/apple/swift-collections', requirement: { kind: 'exactVersion', version: '1.1.4' }, products: ['Collections', 'DequeModule'] });
assert.deepEqual(list.map(p => p.products.length), [1, 2]);
assert.equal((fs.readFileSync(pbx, 'utf8').match(/Begin XCSwiftPackageProductDependency section/g) || []).length, 1);

// the wrapper manifest: WinSwift's Kingfisher in place of the UIKit one, Xcode's rules as SwiftPM requirements
const manifest = pkgs.wrapperManifest(list, 'C:\\WinSwift\\runtime\\Packages');
assert.match(manifest, /\.package\(path: "C:\/WinSwift\/runtime\/Packages\/Kingfisher"\)/);
assert.match(manifest, /\.package\(url: "https:\/\/github\.com\/apple\/swift-collections", exact: "1\.1\.4"\)/);
assert.match(manifest, /\.product\(name: "Kingfisher", package: "kingfisher"\)/);
assert.match(manifest, /\.product\(name: "DequeModule", package: "swift-collections"\)/);
assert.equal(pkgs.requirementSwift({ kind: 'upToNextMinorVersion', minimumVersion: '1.2.0' }), '.upToNextMinor(from: "1.2.0")');
assert.equal(pkgs.requirementSwift({ kind: 'versionRange', minimumVersion: '1.0.0', maximumVersion: '2.0.0' }), '"1.0.0"..<"2.0.0"');
assert.equal(pkgs.requirementSwift({ kind: 'branch', branch: 'main' }), 'branch: "main"');
assert.throws(() => pkgs.requirementSwift({ kind: 'branch', branch: 'x"); evil(' }));
assert.equal(pkgs.repoKey('git@github.com:OneVcat/Kingfisher.git'), 'github.com/onevcat/kingfisher');

// removing both leaves the project as it was (apart from the empty list Xcode keeps too)
xcode.removePackage(root, 'https://github.com/apple/swift-collections.git');
xcode.removePackage(root, list[0].id);
assert.deepEqual(xcode.packages(root), []);
assert.equal(fs.readFileSync(pbx, 'utf8').replace(/\t\t\tpackageReferences = \(\n\t\t\t\);\n/, ''), original);

fs.rmSync(root, { recursive: true, force: true });
console.log('Swift package tests passed');
