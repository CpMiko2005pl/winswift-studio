WinSwift Studio — build iPhone apps in Swift & SwiftUI on Windows 10 and 11
=========================================================================

1. Recommended: download and run "WinSwift-Studio-Setup-...-x64.exe" from
   Releases. The wizard installs for the current user, lets you choose an
   installation folder, creates Start/Desktop shortcuts and needs no admin.
   Portable alternative: extract the ZIP and run "WinSwift Studio.exe";
   "Zainstaluj.bat" remains an optional portable copy-and-shortcut helper.
   If SmartScreen appears: "More info" -> "Run anyway" (the app isn't signed).

2. The IDE installer does not include Swift or Visual Studio. To compile and
   run Swift code, install these separately (the ZIP includes a helper script):
     winget install --id Swift.Toolchain -e --scope user
     Visual Studio Build Tools 2022 with "Desktop development with C++"
   ("Zainstaluj-Swift-i-narzedzia.bat" does both via winget.)
   Missing Windows SDK? In the app: Product -> Install Windows SDK (no admin).

3. Create New Project -> iOS -> App, then Ctrl+R. The first run builds the
   SwiftUI library (1–2 min). Ctrl+Alt+Enter opens the live Canvas; click a
   line number for a breakpoint; F6/F7/F8 step.

Apps run in a built-in iPhone simulator on Windows (an open reimplementation
of SwiftUI). Building .ipa files / App Store still needs a Mac with Xcode.
Windows 7/8 are not supported (Swift and Electron need Windows 10+).

Sponsor: ProZlecenie.pl — https://prozlecenie.pl/
Application security: cyberscope.pl — https://cyberscope.pl/
License: MIT. Not affiliated with Apple Inc.; Xcode, Swift, SwiftUI, iPhone and
iOS are trademarks of Apple Inc.
