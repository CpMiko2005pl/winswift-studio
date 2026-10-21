<p align="center"><img src="build/icon.png" width="128" alt="WinSwift Studio"></p>

<h1 align="center">WinSwift Studio</h1>

<p align="center"><b>Pisz aplikacje w Swift i SwiftUI na Windows 10 i 11.</b><br>
Write Swift and SwiftUI apps on Windows — with an iPhone-style simulator, live previews and a debugger.</p>

<p align="center">
  <a href="https://github.com/CpMiko2005pl/winswift-studio/releases/latest"><img src="https://img.shields.io/github/v/release/CpMiko2005pl/winswift-studio?label=Pobierz%20%2F%20Download&style=for-the-badge&color=0a84ff" alt="Download"></a>
  <img src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078D6?style=for-the-badge&logo=windows" alt="Windows 10 | 11">
  <img src="https://img.shields.io/badge/Swift-6-F05138?style=for-the-badge&logo=swift&logoColor=white" alt="Swift 6">
  <img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="MIT">
</p>

<p align="center"><a href="https://prozlecenie.pl/"><img src="src/img/prozlecenie.png" width="44" alt="ProZlecenie"></a><br>
Sponsor: <a href="https://prozlecenie.pl/"><b>ProZlecenie.pl</b></a> — zlecenia budowlane, fachowcy z Twojej okolicy sami zgłoszą się z ceną.<br>
Bezpieczeństwo aplikacji: <a href="https://cyberscope.pl/"><b>cyberscope.pl</b></a>.</p>

<p align="center"><img src="docs/screenshots/canvas.png" width="860" alt="Edytor SwiftUI z podglądem Canvas"></p>

## Pobierz i uruchom

1. Pobierz instalator **`WinSwift-Studio-Setup-...-x64.exe`** z sekcji [Releases](https://github.com/CpMiko2005pl/winswift-studio/releases/latest) i uruchom kreator. Instaluje on program dla bieżącego użytkownika, pozwala wybrać folder i tworzy skróty w menu Start oraz na pulpicie — bez uprawnień administratora.
2. Aby kompilować i uruchamiać kod Swift, osobno zainstaluj wymagane narzędzia deweloperskie: **Swift dla Windows** oraz **Visual Studio Build Tools z C++**. W paczce ZIP jest pomocniczy skrypt `Zainstaluj-Swift-i-narzedzia.bat`; instalator IDE nie instaluje kompilatora ani Visual Studio.
3. Wybierz *Create New Project… → iOS → App* i naciśnij **Ctrl+R**, aby uruchomić aplikację w symulatorze WinSwift Studio.

Wersja portable pozostaje dostępna jako **[ZIP](https://github.com/CpMiko2005pl/winswift-studio/releases/latest)**. Po rozpakowaniu można uruchomić `WinSwift Studio.exe` lub opcjonalnie `Zainstaluj.bat`.

Pełna instrukcja jest w paczce (`INSTRUKCJA.txt`, po angielsku `README-EN.txt`).

> Windows pokazuje „System Windows ochronił ten komputer”? Kliknij **Więcej informacji → Uruchom mimo to** — program jest darmowy i nie ma płatnego podpisu cyfrowego.

## Co potrafi

| | |
|---|---|
| <img src="docs/screenshots/simulator.png" width="260" alt="Symulator iPhone'a"> | **Symulator iPhone'a** — 6 modeli (iPhone 16 Pro, 16 Pro Max, 16, 16 Plus, 16e, SE), jasny/ciemny wygląd, języki, lokalizacja GPS, uprawnienia, Shake, zrzuty ekranu.<br><br>**Własna implementacja SwiftUI dla Windows** — `NavigationStack`, `List`, `Form`, `TabView`, `@State`, `@Observable`, `@AppStorage`, alerty, arkusze, gesty, `Localizable` / String Catalog, Asset Catalog i wiele więcej. |
| **Debugger LLDB** — breakpointy na marginesie, *Continue / Step Over / Into / Out* (F6/F7/F8), zmienne, stos wywołań, konsola `(lldb)` z `po` i `p`, podgląd wartości po najechaniu. | <img src="docs/screenshots/debugger.png" width="480" alt="Debugger"> |
| <img src="docs/screenshots/library.png" width="480" alt="Library"> | **Narzędzia IDE** — Canvas z `#Preview`, podpowiedzi i błędy na żywo (SourceKit-LSP), Quick Help, Rename, Code Actions, Open Quickly, Find &amp; Replace w projekcie, Library (Views, Modifiers, Snippets, SF Symbols, Colors, Images), konfiguracja projektu, nawigatory, motyw jasny i ciemny, własne skróty klawiszowe. |

Działają też **programy konsolowe** i **Swift Package** (`swift build`).

## Zakres i ograniczenia — uczciwie

- To nie jest Xcode ani prawdziwy iOS. Aplikacje uruchamiają się na Windows w symulatorze WinSwift Studio, który renderuje własną, niepełną implementację wybranych API SwiftUI.
- Symulator nie zapewnia natywnego UIKit, Storyboard, prawdziwego urządzenia iOS ani dostępu do sprzętu iPhone'a. Sama ikona lub element interfejsu (np. aparatu) nie oznacza obsługi sprzętu.
- Aplikacja systemowa Camera w symulatorze jest tylko ikoną demonstracyjną. Obraz z kamery laptopa nie jest przekazywany do uruchomionych aplikacji.
- Nie buduje plików `.ipa` ani nie publikuje do App Store. Do kompilowania i dystrybucji prawdziwej aplikacji iOS potrzebny jest Mac z Xcode.
- Zadania CRUD można zaimplementować na dostępnych widokach, takich jak `List`, `Form`, `NavigationStack`, pola tekstowe i alerty. WinSwift Studio nie zawiera jednak gotowej aplikacji zarządzania osobami; walidacja i zachowanie danych należą do kodu tworzonej aplikacji. Opcjonalną datę trzeba obsłużyć w aplikacji osobno, bo runtime `DatePicker` wymaga `Binding<Date>`, a nie `Binding<Date?>`.
- **Windows 7 i 8 nie są obsługiwane** — kompilator Swift dla Windows i Electron wymagają Windows 10 lub 11 (64-bit).

## Ze źródeł (dla programistów)

```bat
git clone https://github.com/CpMiko2005pl/winswift-studio.git
cd winswift-studio
npm install
npm start           & rem uruchomienie
npm run dist        & rem instalator NSIS w dist\
npm run package     & rem portable ZIP w dist\
npm run dist:dir    & rem rozpakowany build w dist\
```

Wymagania: Node.js 18+, Swift dla Windows, Visual Studio Build Tools z C++.
Budowa: Electron + Monaco Editor, SourceKit-LSP, lldb-dap, symulator i SwiftUI w `runtime/SwiftUI`.

## Licencja

Kod: MIT — zobacz [LICENSE](LICENSE). Biblioteki: Electron, Monaco Editor (MIT), Lucide (ISC), Inter (SIL OFL).
Logo i marka **ProZlecenie** należą do ich właściciela i nie są objęte licencją MIT.

## Znaki towarowe

Projekt nie jest powiązany z Apple Inc. ani przez nią wspierany. Xcode, Swift, SwiftUI, iPhone i iOS są znakami towarowymi Apple Inc., użytymi tu wyłącznie do opisu zgodności.

---

### English

**WinSwift Studio** is a Swift editor and Windows simulator for a subset of SwiftUI, with live previews, an LLDB debugger and SourceKit code completion. Download the **per-user NSIS installer** from *Releases* for a guided setup and Start/Desktop shortcuts; the portable ZIP remains available. Swift and Visual Studio Build Tools are separate prerequisites.
This is not Xcode or a real iOS device. It does not build `.ipa` files or publish to the App Store; real iOS builds require a Mac with Xcode. Not affiliated with Apple Inc.

<sub>Keywords: swift on windows, swiftui on windows, xcode for windows alternative, ios development on windows, iphone app development windows, ios simulator for windows, learn swift windows, programowanie iOS na Windows, aplikacje na iPhone'a na Windows, Swift na Windows</sub>
