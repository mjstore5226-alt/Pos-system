; Build with makensis -DPAYLOAD=/absolute/prepared/payload -DOUTPUT=/absolute/setup.exe windows.nsi
Unicode true
!include "MUI2.nsh"
!include "x64.nsh"
!include "WinVer.nsh"
!ifndef PAYLOAD
  !error "Supply PAYLOAD containing the prepared offline app and runtime/node.exe"
!endif
!ifndef OUTPUT
  !error "Supply OUTPUT with the destination installer path"
!endif
Name "Grain POS"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\GrainPOS"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 64
ShowInstDetails show
ShowUninstDetails show
VIProductVersion "1.1.0.0"
VIAddVersionKey "ProductName" "Grain POS"
VIAddVersionKey "FileDescription" "Grain POS offline installer for Windows x64"
VIAddVersionKey "FileVersion" "1.1.0"
VIAddVersionKey "LegalCopyright" "See bundled third-party licenses"
AutoCloseWindow true
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "Grain POS requires 64-bit Windows 10 or 11."
    Abort
  ${EndIf}
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP "Grain POS requires Windows 10 or 11."
    Abort
  ${EndIf}
  SetShellVarContext current
  IfFileExists "$INSTDIR\runtime\node.exe" 0 ready
    MessageBox MB_OKCANCEL "Close the POS terminal before updating. Your existing data will be kept." IDOK ready
    Abort
  ready:
FunctionEnd

Section "Grain POS" Main
  SetOutPath "$INSTDIR"
  File /r "${PAYLOAD}/*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\Grain POS"
  CreateShortcut "$DESKTOP\Grain POS.lnk" "$INSTDIR\Start POS.cmd"
  CreateShortcut "$SMPROGRAMS\Grain POS\Start POS.lnk" "$INSTDIR\Start POS.cmd"
  CreateShortcut "$SMPROGRAMS\Grain POS\Setup instructions.lnk" "$INSTDIR\START-HERE.txt"
  CreateShortcut "$SMPROGRAMS\Grain POS\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  WriteINIStr "$INSTDIR\Open POS.url" "InternetShortcut" "URL" "http://localhost:3000"
  CreateShortcut "$SMPROGRAMS\Grain POS\Open POS in browser.lnk" "$INSTDIR\Open POS.url"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GrainPOS" "DisplayName" "Grain POS"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GrainPOS" "DisplayVersion" "1.1.0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GrainPOS" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GrainPOS" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GrainPOS" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GrainPOS" "NoRepair" 1
SectionEnd

Function .onInstSuccess
  IfSilent done
  Call LaunchPOS
  done:
FunctionEnd

Function LaunchPOS
  SetOutPath "$INSTDIR"
  ExecShell "open" "$INSTDIR\Start POS.cmd"
FunctionEnd

Section "Uninstall"
  SetShellVarContext current
  MessageBox MB_OKCANCEL "Close the POS terminal before continuing. Your data folder and certificates will be kept in $INSTDIR." IDOK +2
  Abort
  ; Remove only application-owned files. Never remove data, certs or the parent recursively.
  RMDir /r "$INSTDIR\dist"
  RMDir /r "$INSTDIR\server"
  RMDir /r "$INSTDIR\scripts"
  RMDir /r "$INSTDIR\node_modules"
  RMDir /r "$INSTDIR\runtime"
  RMDir /r "$INSTDIR\licenses"
  Delete "$INSTDIR\package.json"
  Delete "$INSTDIR\package-lock.json"
  Delete "$INSTDIR\Start POS.cmd"
  Delete "$INSTDIR\start-pos.sh"
  Delete "$INSTDIR\LOCAL-SETUP.md"
  Delete "$INSTDIR\START-HERE.txt"
  Delete "$INSTDIR\Open POS.url"
  Delete "$INSTDIR\Uninstall.exe"
  Delete "$DESKTOP\Grain POS.lnk"
  RMDir /r "$SMPROGRAMS\Grain POS"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GrainPOS"
  RMDir "$INSTDIR"
SectionEnd
