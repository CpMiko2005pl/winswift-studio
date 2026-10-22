; WinSwift Studio — installer additions (electron-builder nsis.include)
; • a welcome page (sidebar bitmap with the sponsors)
; • a "Sponsors" page after choosing the folder: two clickable sponsor cards
; • a sponsor link on the finish page

!include nsDialogs.nsh
!include LogicLib.nsh

!define WSS_PZ_URL "https://prozlecenie.pl/?utm_source=winswift-studio&utm_medium=installer"
!define WSS_CS_URL "https://cyberscope.pl/?utm_source=winswift-studio&utm_medium=installer"

; finish page (and the uninstaller's): a link to the main sponsor
!define MUI_FINISHPAGE_LINK "$(wssFinishLink)"
!define MUI_FINISHPAGE_LINK_LOCATION "${WSS_PZ_URL}"
!define MUI_FINISHPAGE_LINK_COLOR "0A64D6"

!macro customHeader
  LangString wssWelcomeTitle ${LANG_POLISH} "Witaj w instalatorze WinSwift Studio"
  LangString wssWelcomeTitle ${LANG_ENGLISH} "Welcome to WinSwift Studio Setup"
  LangString wssWelcomeText ${LANG_POLISH} "WinSwift Studio to IDE w stylu Xcode: aplikacje na iPhone'a w Swift i SwiftUI, symulator iPhone'a, podgląd na żywo i debugger — na Windows 10 i 11.$\r$\n$\r$\nInstalacja nie wymaga uprawnień administratora. Po pierwszym uruchomieniu wklej klucz licencyjny albo wypróbuj program za darmo przez 15 minut (xdecode.cyberscope.pl), potem kliknij Install Swift…, aby dodać kompilator.$\r$\n$\r$\nProjekt wspierają sponsorzy: ProZlecenie.pl i CyberScope.pl. Dziękujemy!$\r$\n$\r$\nKliknij Dalej, aby kontynuować."
  LangString wssWelcomeText ${LANG_ENGLISH} "WinSwift Studio is an Xcode-style IDE: iPhone apps in Swift and SwiftUI, an iPhone simulator, live previews and a debugger — on Windows 10 and 11.$\r$\n$\r$\nNo administrator rights needed. On first launch paste your license key or try it free for 15 minutes (xdecode.cyberscope.pl), then click Install Swift… to add the compiler.$\r$\n$\r$\nThe project is supported by its sponsors: ProZlecenie.pl and CyberScope.pl. Thank you!$\r$\n$\r$\nClick Next to continue."
  LangString wssSponsorsTitle ${LANG_POLISH} "Sponsorzy projektu"
  LangString wssSponsorsTitle ${LANG_ENGLISH} "Project sponsors"
  LangString wssSponsorsSub ${LANG_POLISH} "WinSwift Studio jest darmowy dzięki naszym sponsorom."
  LangString wssSponsorsSub ${LANG_ENGLISH} "WinSwift Studio is free thanks to our sponsors."
  LangString wssSponsorsText ${LANG_POLISH} "Kliknij kartę, aby otworzyć stronę sponsora w przeglądarce. Instalacja nie zostanie przerwana."
  LangString wssSponsorsText ${LANG_ENGLISH} "Click a card to open the sponsor's website in your browser. Setup will keep running."
  LangString wssFinishLink ${LANG_POLISH} "Sponsor: ProZlecenie.pl — fachowcy z Twojej okolicy"
  LangString wssFinishLink ${LANG_ENGLISH} "Sponsor: ProZlecenie.pl — local contractors (Poland)"
  !ifndef BUILD_UNINSTALLER
    Var wssImgPZ
    Var wssImgCS
    !insertmacro wssSponsorFunctions
  !endif
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "$(wssWelcomeTitle)"
  !define MUI_WELCOMEPAGE_TEXT "$(wssWelcomeText)"
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customPageAfterChangeDir
  Page custom wssSponsorsShow wssSponsorsLeave
!macroend

; functions use MUI macros, so they are emitted from customHeader (after MUI2 is loaded)
!macro wssSponsorFunctions
  Function wssSponsorsShow
    !insertmacro MUI_HEADER_TEXT "$(wssSponsorsTitle)" "$(wssSponsorsSub)"
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    InitPluginsDir
    File "/oname=$PLUGINSDIR\wss-pz.bmp" "${BUILD_RESOURCES_DIR}\sponsor-prozlecenie.bmp"
    File "/oname=$PLUGINSDIR\wss-cs.bmp" "${BUILD_RESOURCES_DIR}\sponsor-cyberscope.bmp"

    ${NSD_CreateLabel} 0 0 100% 20u "$(wssSponsorsText)"
    Pop $0

    ${NSD_CreateBitmap} 0 36 440 80 ""
    Pop $1
    ${NSD_AddStyle} $1 0x00000100   ; SS_NOTIFY: the picture reports clicks
    ${NSD_SetImage} $1 "$PLUGINSDIR\wss-pz.bmp" $wssImgPZ
    ${NSD_OnClick} $1 wssOpenPZ

    ${NSD_CreateBitmap} 0 126 440 80 ""
    Pop $2
    ${NSD_AddStyle} $2 0x00000100
    ${NSD_SetImage} $2 "$PLUGINSDIR\wss-cs.bmp" $wssImgCS
    ${NSD_OnClick} $2 wssOpenCS

    nsDialogs::Show
  FunctionEnd

  Function wssSponsorsLeave
    ${NSD_FreeImage} $wssImgPZ
    ${NSD_FreeImage} $wssImgCS
  FunctionEnd

  Function wssOpenPZ
    Pop $0
    ExecShell "open" "${WSS_PZ_URL}"
  FunctionEnd

  Function wssOpenCS
    Pop $0
    ExecShell "open" "${WSS_CS_URL}"
  FunctionEnd
!macroend
