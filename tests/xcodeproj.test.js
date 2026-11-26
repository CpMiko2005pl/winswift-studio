'use strict';
// Xcode project support: generated projects parse and keep their settings; edits to classic (Xcode 15 style) projects
// add, rename and remove files the way Xcode does, keep CRLF files CRLF, and never touch unrelated lines.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const x = require('../xcodeproj');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'xcodeproj test Ż '));
const lines = s => s.split(/\r?\n/);
const diffCount = (a, b) => { const A = new Set(lines(a)); return lines(b).filter(l => !A.has(l)).length; };

// the Xcode 15 iOS App template, trimmed, plus a unit test target
const CLASSIC = `// !$*UTF8*$!
{
	archiveVersion = 1;
	classes = {
	};
	objectVersion = 56;
	objects = {

/* Begin PBXBuildFile section */
		AA0000000000000000000001 /* DemoApp.swift in Sources */ = {isa = PBXBuildFile; fileRef = AA0000000000000000000011 /* DemoApp.swift */; };
		AA0000000000000000000002 /* ContentView.swift in Sources */ = {isa = PBXBuildFile; fileRef = AA0000000000000000000012 /* ContentView.swift */; };
		AA0000000000000000000003 /* Assets.xcassets in Resources */ = {isa = PBXBuildFile; fileRef = AA0000000000000000000013 /* Assets.xcassets */; };
		AA0000000000000000000004 /* DemoTests.swift in Sources */ = {isa = PBXBuildFile; fileRef = AA0000000000000000000014 /* DemoTests.swift */; };
/* End PBXBuildFile section */

/* Begin PBXFileReference section */
		AA0000000000000000000010 /* Demo.app */ = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = Demo.app; sourceTree = BUILT_PRODUCTS_DIR; };
		AA0000000000000000000011 /* DemoApp.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = DemoApp.swift; sourceTree = "<group>"; };
		AA0000000000000000000012 /* ContentView.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ContentView.swift; sourceTree = "<group>"; };
		AA0000000000000000000013 /* Assets.xcassets */ = {isa = PBXFileReference; lastKnownFileType = folder.assetcatalog; path = Assets.xcassets; sourceTree = "<group>"; };
		AA0000000000000000000014 /* DemoTests.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = DemoTests.swift; sourceTree = "<group>"; };
		AA0000000000000000000015 /* DemoTests.xctest */ = {isa = PBXFileReference; explicitFileType = wrapper.cfbundle; includeInIndex = 0; path = DemoTests.xctest; sourceTree = BUILT_PRODUCTS_DIR; };
/* End PBXFileReference section */

/* Begin PBXGroup section */
		AA0000000000000000000020 = {
			isa = PBXGroup;
			children = (
				AA0000000000000000000021 /* Demo */,
				AA0000000000000000000023 /* DemoTests */,
				AA0000000000000000000022 /* Products */,
			);
			sourceTree = "<group>";
		};
		AA0000000000000000000021 /* Demo */ = {
			isa = PBXGroup;
			children = (
				AA0000000000000000000011 /* DemoApp.swift */,
				AA0000000000000000000012 /* ContentView.swift */,
				AA0000000000000000000013 /* Assets.xcassets */,
			);
			path = Demo;
			sourceTree = "<group>";
		};
		AA0000000000000000000022 /* Products */ = {
			isa = PBXGroup;
			children = (
				AA0000000000000000000010 /* Demo.app */,
				AA0000000000000000000015 /* DemoTests.xctest */,
			);
			name = Products;
			sourceTree = "<group>";
		};
		AA0000000000000000000023 /* DemoTests */ = {
			isa = PBXGroup;
			children = (
				AA0000000000000000000014 /* DemoTests.swift */,
			);
			path = DemoTests;
			sourceTree = "<group>";
		};
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
		AA0000000000000000000030 /* Demo */ = {
			isa = PBXNativeTarget;
			buildConfigurationList = AA0000000000000000000050 /* Build configuration list for PBXNativeTarget "Demo" */;
			buildPhases = (
				AA0000000000000000000040 /* Sources */,
				AA0000000000000000000042 /* Resources */,
			);
			buildRules = (
			);
			dependencies = (
			);
			name = Demo;
			productName = Demo;
			productReference = AA0000000000000000000010 /* Demo.app */;
			productType = "com.apple.product-type.application";
		};
		AA0000000000000000000031 /* DemoTests */ = {
			isa = PBXNativeTarget;
			buildConfigurationList = AA0000000000000000000051 /* Build configuration list for PBXNativeTarget "DemoTests" */;
			buildPhases = (
				AA0000000000000000000041 /* Sources */,
			);
			buildRules = (
			);
			dependencies = (
			);
			name = DemoTests;
			productName = DemoTests;
			productReference = AA0000000000000000000015 /* DemoTests.xctest */;
			productType = "com.apple.product-type.bundle.unit-test";
		};
/* End PBXNativeTarget section */

/* Begin PBXProject section */
		AA0000000000000000000060 /* Project object */ = {
			isa = PBXProject;
			buildConfigurationList = AA0000000000000000000052 /* Build configuration list for PBXProject "Demo" */;
			compatibilityVersion = "Xcode 14.0";
			developmentRegion = en;
			hasScannedForEncodings = 0;
			knownRegions = (
				en,
				Base,
			);
			mainGroup = AA0000000000000000000020;
			productRefGroup = AA0000000000000000000022 /* Products */;
			projectDirPath = "";
			projectRoot = "";
			targets = (
				AA0000000000000000000030 /* Demo */,
				AA0000000000000000000031 /* DemoTests */,
			);
		};
/* End PBXProject section */

/* Begin PBXResourcesBuildPhase section */
		AA0000000000000000000042 /* Resources */ = {
			isa = PBXResourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
				AA0000000000000000000003 /* Assets.xcassets in Resources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End PBXResourcesBuildPhase section */

/* Begin PBXSourcesBuildPhase section */
		AA0000000000000000000040 /* Sources */ = {
			isa = PBXSourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
				AA0000000000000000000002 /* ContentView.swift in Sources */,
				AA0000000000000000000001 /* DemoApp.swift in Sources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
		AA0000000000000000000041 /* Sources */ = {
			isa = PBXSourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
				AA0000000000000000000004 /* DemoTests.swift in Sources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End PBXSourcesBuildPhase section */

/* Begin XCBuildConfiguration section */
		AA0000000000000000000070 /* Debug */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				CODE_SIGN_STYLE = Automatic;
				CURRENT_PROJECT_VERSION = 1;
				GENERATE_INFOPLIST_FILE = YES;
				INFOPLIST_KEY_UILaunchScreen_Generation = YES;
				MARKETING_VERSION = 1.0;
				PRODUCT_BUNDLE_IDENTIFIER = pl.test.Demo;
				PRODUCT_NAME = "$(TARGET_NAME)";
				SWIFT_VERSION = 5.0;
			};
			name = Debug;
		};
		AA0000000000000000000071 /* Release */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				CODE_SIGN_STYLE = Automatic;
				CURRENT_PROJECT_VERSION = 1;
				GENERATE_INFOPLIST_FILE = YES;
				INFOPLIST_KEY_UILaunchScreen_Generation = YES;
				MARKETING_VERSION = 1.0;
				PRODUCT_BUNDLE_IDENTIFIER = pl.test.Demo;
				PRODUCT_NAME = "$(TARGET_NAME)";
				SWIFT_VERSION = 5.0;
			};
			name = Release;
		};
		AA0000000000000000000072 /* Debug */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				IPHONEOS_DEPLOYMENT_TARGET = 17.0;
				SDKROOT = iphoneos;
			};
			name = Debug;
		};
		AA0000000000000000000073 /* Debug */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				PRODUCT_NAME = "$(TARGET_NAME)";
			};
			name = Debug;
		};
/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
		AA0000000000000000000050 /* Build configuration list for PBXNativeTarget "Demo" */ = {
			isa = XCConfigurationList;
			buildConfigurations = (
				AA0000000000000000000070 /* Debug */,
				AA0000000000000000000071 /* Release */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Release;
		};
		AA0000000000000000000051 /* Build configuration list for PBXNativeTarget "DemoTests" */ = {
			isa = XCConfigurationList;
			buildConfigurations = (
				AA0000000000000000000073 /* Debug */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Debug;
		};
		AA0000000000000000000052 /* Build configuration list for PBXProject "Demo" */ = {
			isa = XCConfigurationList;
			buildConfigurations = (
				AA0000000000000000000072 /* Debug */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Debug;
		};
/* End XCConfigurationList section */
	};
	rootObject = AA0000000000000000000060 /* Project object */;
}
`;

function classicProject(eol = '\n') {
  const root = path.join(tmp(), 'Demo');
  for (const d of ['Demo.xcodeproj', 'Demo/Assets.xcassets', 'DemoTests']) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, 'Demo.xcodeproj', 'project.pbxproj'), CLASSIC.replace(/\n/g, eol));
  for (const f of ['Demo/DemoApp.swift', 'Demo/ContentView.swift', 'DemoTests/DemoTests.swift']) fs.writeFileSync(path.join(root, f), '// x\n');
  return root;
}
const pbxOf = root => fs.readFileSync(path.join(root, 'Demo.xcodeproj', 'project.pbxproj'), 'utf8');
const names = list => list.map(f => path.basename(f)).sort();

test('generated project: Xcode 16 synchronized folder, settings round trip', () => {
  const root = path.join(tmp(), 'Moja Apka');
  fs.mkdirSync(path.join(root, 'Moja Apka', 'Preview Content'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Moja Apka', 'ContentView.swift'), '// x\n');
  const proj = x.createProject(root, 'Moja Apka', { bundleId: 'pl.test.moja', version: '1.2', build: '7', displayName: 'Moja Łódź', deploymentTarget: '17.0', info: { NSCameraUsageDescription: 'Aparat do zdjęć' } });
  assert.ok(proj.endsWith('Moja Apka.xcodeproj'));
  const text = fs.readFileSync(path.join(proj, 'project.pbxproj'), 'utf8');
  x.parse(text);
  assert.match(text, /objectVersion = 77;/);
  assert.match(text, /DEVELOPMENT_ASSET_PATHS = "\\"Moja Apka\/Preview Content\\"";/);
  assert.ok(fs.existsSync(path.join(proj, 'project.xcworkspace', 'contents.xcworkspacedata')));
  assert.match(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), /^\.build\/$/m);
  assert.equal(fs.readFileSync(path.join(root, '.build', '.gitignore'), 'utf8').trim().split('\n').pop(), '*');
  const s = x.readSettings(root);
  assert.deepEqual([s.bundleId, s.version, s.build, s.displayName, s.deploymentTarget, s.info.NSCameraUsageDescription], ['pl.test.moja', '1.2', '7', 'Moja Łódź', '17.0', 'Aparat do zdjęć']);
  const src = x.appSources(root);
  assert.deepEqual(src.dirs.map(d => path.basename(d)), ['Moja Apka']);
  assert.equal(x.addPath(path.join(root, 'Moja Apka', 'Nowy.swift')), 'synced');
  assert.equal(x.createProject(root, 'Moja Apka'), null, 'never overwrites');
  x.writeSettings(root, { version: '2.0', info: {} });
  const after = fs.readFileSync(path.join(proj, 'project.pbxproj'), 'utf8');
  assert.equal(x.readSettings(root).version, '2.0');
  assert.equal(x.readSettings(root).info.NSCameraUsageDescription, undefined);
  assert.equal(diffCount(text, after), 2, 'only MARKETING_VERSION in Debug and Release changed');
});

test('classic project: tests target excluded, add / rename / remove like Xcode', () => {
  const root = classicProject();
  assert.deepEqual(names(x.appSources(root).files), ['ContentView.swift', 'DemoApp.swift']);
  const before = pbxOf(root);
  fs.mkdirSync(path.join(root, 'Demo', 'Views'));
  const foo = path.join(root, 'Demo', 'Views', 'Foo.swift');
  fs.writeFileSync(foo, '// x\n');
  assert.equal(x.addPath(foo), 'added');
  assert.equal(x.addPath(foo), 'exists');
  let text = pbxOf(root);
  x.parse(text);
  assert.ok(diffCount(before, text) <= 12, 'small diff');
  assert.match(text, /\/\* Views \*\/ = \{\n\t\t\tisa = PBXGroup;/);
  assert.match(text, /\/\* Foo\.swift in Sources \*\/ = \{isa = PBXBuildFile; fileRef = [0-9A-F]{24} \/\* Foo\.swift \*\/; \};/);
  assert.deepEqual(names(x.appSources(root).files), ['ContentView.swift', 'DemoApp.swift', 'Foo.swift']);
  const img = path.join(root, 'Demo', 'logo.png');
  fs.writeFileSync(img, 'png');
  x.addPath(img);
  assert.match(pbxOf(root), /logo\.png in Resources/);

  const bar = path.join(root, 'Demo', 'Views', 'Bar.swift');
  fs.renameSync(foo, bar);
  assert.equal(x.renamePath(foo, bar), 'renamed');
  text = pbxOf(root);
  assert.doesNotMatch(text, /Foo\.swift/);
  assert.deepEqual(names(x.appSources(root).files), ['Bar.swift', 'ContentView.swift', 'DemoApp.swift']);

  fs.rmSync(bar);
  assert.equal(x.removePath(bar), 'removed');
  text = pbxOf(root);
  x.parse(text);
  assert.doesNotMatch(text, /Bar\.swift/);
  assert.deepEqual(names(x.appSources(root).files), ['ContentView.swift', 'DemoApp.swift']);

  fs.rmSync(path.join(root, 'Demo', 'Views'), { recursive: true });
  x.removePath(path.join(root, 'Demo', 'Views'));
  assert.doesNotMatch(pbxOf(root), /\/\* Views \*\//);
  x.writeSettings(root, { bundleId: 'pl.nowy.Demo', displayName: 'Demo PL' });
  const s = x.readSettings(root);
  assert.equal(s.bundleId, 'pl.nowy.Demo');
  assert.equal(s.displayName, 'Demo PL');
  assert.equal(s.deploymentTarget, '17.0', 'falls back to the project-level setting');
  assert.ok(fs.readdirSync(path.join(root, '.build', 'swiftcode', 'xcodeproj-backup')).length === 1, 'original kept once');
  // a file an older WinSwift added without touching project.pbxproj; tests are never offered
  const old = path.join(root, 'Demo', 'Old.swift'), t2 = path.join(root, 'DemoTests', 'More.swift');
  fs.writeFileSync(old, '// x\n'); fs.writeFileSync(t2, '// x\n');
  const all = [old, t2, path.join(root, 'Demo', 'ContentView.swift'), path.join(root, 'DemoTests', 'DemoTests.swift')];
  assert.deepEqual(x.unreferencedSources(root, all), [old]);
  x.addPath(old);
  assert.deepEqual(x.unreferencedSources(root, all), []);
});

test('CRLF checkouts stay CRLF', () => {
  const root = classicProject('\r\n');
  const f = path.join(root, 'Demo', 'Extra.swift');
  fs.writeFileSync(f, '// x\n');
  x.addPath(f);
  x.writeSettings(root, { version: '3.0', info: { NSCameraUsageDescription: 'Kamera' } });
  const text = pbxOf(root);
  assert.doesNotMatch(text, /[^\r]\n/);
  assert.equal(x.readSettings(root).info.NSCameraUsageDescription, 'Kamera');
  assert.deepEqual(names(x.appSources(root).files), ['ContentView.swift', 'DemoApp.swift', 'Extra.swift']);
});

test('quoting like Xcode', () => {
  assert.equal(x.q('1.0'), '1.0');
  assert.equal(x.q('com.example.App'), 'com.example.App');
  assert.equal(x.q('$(TARGET_NAME)'), '"$(TARGET_NAME)"');
  assert.equal(x.q('Moja Apka'), '"Moja Apka"');
  assert.equal(x.q('Łódź'), '"Łódź"');
  assert.equal(x.q('a"b'), '"a\\"b"');
});
