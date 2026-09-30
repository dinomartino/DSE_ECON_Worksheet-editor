; Econ Worksheet -> Econ Studio (0.6.0).
;
; The NSIS template names the uninstall key, the install folder and the shortcuts after
; productName, so the renamed build installs beside an "Econ Worksheet" copy instead of
; over it. Once the new files are in place, this removes the old copy with its own
; uninstaller, run silently: a silent run never shows the "Delete app data" box, so
; worksheets, settings and keys stay (they live under the identifier, which is unchanged).
; An update (/UPDATE) never creates shortcuts, so this also gives Econ Studio the
; Start-menu shortcut, and a desktop one where the old copy had one.
; No "Econ Worksheet" uninstall key (a fresh machine, any later update): does nothing.
; Every released build was installMode currentUser, publisher "Tino Ho": HKCU only.

!define ES_OLD_NAME "Econ Worksheet"
!define ES_OLD_UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Econ Worksheet"
!define ES_OLD_MANUKEY "Software\Tino Ho\Econ Worksheet"

!macro NSIS_HOOK_POSTINSTALL
  !if "${STARTMENUFOLDER}" != ""
    !error "hooks.nsh expects the Start-menu shortcut directly in $SMPROGRAMS"
  !endif
  !if "${INSTALLMODE}" != "currentUser"
    !error "hooks.nsh looks for the old copy in HKCU only; revisit before changing installMode"
  !endif

  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $R6
  Push $R7
  Push $R8
  Push $R9

  ReadRegStr $R9 HKCU "${ES_OLD_UNINSTKEY}" "UninstallString"
  ${If} $R9 != ""
    ; The old folder: the installer's own record, else InstallLocation without its quotes.
    ReadRegStr $R8 HKCU "${ES_OLD_MANUKEY}" ""
    ${If} $R8 == ""
      ReadRegStr $R8 HKCU "${ES_OLD_UNINSTKEY}" "InstallLocation"
      StrCpy $0 $R8 1
      ${If} $0 == '"'
        StrCpy $R8 $R8 "" 1
        StrCpy $R8 $R8 -1
      ${EndIf}
    ${EndIf}
    ReadRegStr $R7 HKCU "${ES_OLD_UNINSTKEY}" "MainBinaryName"
    ${If} $R7 == ""
      StrCpy $R7 "${MAINBINARYNAME}.exe"
    ${EndIf}
    StrCpy $R6 0
    ${If} ${FileExists} "$DESKTOP\${ES_OLD_NAME}.lnk"
      StrCpy $R6 1
    ${EndIf}

    ${If} $R8 == $INSTDIR
      ; Installed into the old folder: its files are already replaced, only the entry is left.
      ; Running the old uninstaller here would delete the new app.
      DeleteRegKey HKCU "${ES_OLD_UNINSTKEY}"
    ${ElseIf} ${FileExists} "$R8\uninstall.exe"
      DetailPrint "Removing ${ES_OLD_NAME}; your worksheets and settings are kept"
      ClearErrors
      ; _?= runs it in place so ExecWait waits; it then cannot delete itself.
      ExecWait '"$R8\uninstall.exe" /S _?=$R8' $0
      ${If} ${Errors}
        StrCpy $0 2
      ${EndIf}
      ${If} $0 = 0
        Delete "$R8\uninstall.exe"
        RMDir "$R8"
      ${Else}
        DetailPrint "Could not remove ${ES_OLD_NAME} (exit code $0)"
      ${EndIf}
    ${ElseIfNot} ${FileExists} "$R8\$R7"
      ; The folder is already gone: a stale entry.
      DeleteRegKey HKCU "${ES_OLD_UNINSTKEY}"
    ${EndIf}

    ReadRegStr $R9 HKCU "${ES_OLD_UNINSTKEY}" "UninstallString"
    ${If} $R9 == ""
      ; The old copy is gone. Its uninstaller keeps this key (install folder and installer
      ; language, no app data) unless asked to delete app data.
      DeleteRegKey HKCU "${ES_OLD_MANUKEY}"
      ; Shortcuts the old uninstaller did not remove (the two cases above that skip it).
      !insertmacro IsShortcutTarget "$SMPROGRAMS\${ES_OLD_NAME}.lnk" "$R8\$R7"
      Pop $0
      ${If} $0 = 1
        !insertmacro UnpinShortcut "$SMPROGRAMS\${ES_OLD_NAME}.lnk"
        Delete "$SMPROGRAMS\${ES_OLD_NAME}.lnk"
      ${EndIf}
      !insertmacro IsShortcutTarget "$DESKTOP\${ES_OLD_NAME}.lnk" "$R8\$R7"
      Pop $0
      ${If} $0 = 1
        !insertmacro UnpinShortcut "$DESKTOP\${ES_OLD_NAME}.lnk"
        Delete "$DESKTOP\${ES_OLD_NAME}.lnk"
      ${EndIf}
    ${EndIf}

    ${If} $NoShortcutMode <> 1
      ${IfNot} ${FileExists} "$SMPROGRAMS\${PRODUCTNAME}.lnk"
        CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
        !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${PRODUCTNAME}.lnk"
      ${EndIf}
      ${If} $R6 = 1
      ${AndIfNot} ${FileExists} "$DESKTOP\${PRODUCTNAME}.lnk"
        CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
        !insertmacro SetLnkAppUserModelId "$DESKTOP\${PRODUCTNAME}.lnk"
      ${EndIf}
    ${EndIf}
  ${EndIf}

  Pop $R9
  Pop $R8
  Pop $R7
  Pop $R6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend
