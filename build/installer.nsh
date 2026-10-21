!include nsDialogs.nsh

!ifndef BUILD_UNINSTALLER
Var CyberscopeWebsiteButton
!endif

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "WinSwift Studio | our sponsors"
  !define MUI_WELCOMEPAGE_TEXT "APPLICATION SECURITY: cyberscope.pl is responsible for this application's security.$\r$\nSPONSOR: ProZlecenie.pl supports WinSwift Studio.$\r$\n$\r$\nInstall WinSwift Studio for your Windows user. No administrator rights required.$\r$\n$\r$\nThis installs the IDE only; Swift and Visual Studio Build Tools are separate prerequisites."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!ifndef BUILD_UNINSTALLER
!macro customPageAfterChangeDir
  Page custom SponsorPage
!macroend

Function SponsorPage
  nsDialogs::Create 1018
  Pop $0

  ${NSD_CreateLabel} 0 0 100% 24u "APPLICATION SECURITY"
  Pop $1
  ${NSD_CreateLabel} 0 22u 100% 28u "cyberscope.pl is responsible for this application's security."
  Pop $1
  ${NSD_CreateButton} 0 54u 150u 24u "Visit cyberscope.pl"
  Pop $CyberscopeWebsiteButton
  ${NSD_OnClick} $CyberscopeWebsiteButton CyberscopeOpenWebsite

  ${NSD_CreateLabel} 0 92u 100% 24u "SPONSOR"
  Pop $1
  ${NSD_CreateLabel} 0 114u 100% 20u "ProZlecenie.pl supports WinSwift Studio."
  Pop $1
  ${NSD_CreateButton} 0 138u 150u 24u "Visit ProZlecenie.pl"
  Pop $1
  ${NSD_OnClick} $1 ProZlecenieOpenWebsite

  nsDialogs::Show
FunctionEnd

Function CyberscopeOpenWebsite
  ExecShell "open" "https://cyberscope.pl"
FunctionEnd

Function ProZlecenieOpenWebsite
  ExecShell "open" "https://prozlecenie.pl"
FunctionEnd
!endif
