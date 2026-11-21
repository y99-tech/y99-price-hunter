#!/bin/bash
# Double-click this once after dragging Y99 Price Hunter into Applications.
# It tells macOS the app is safe to open (the app isn't from the App Store), then opens it.
APP="/Applications/Y99 Price Hunter.app"
if [ ! -d "$APP" ]; then
  osascript -e 'display dialog "First drag Y99 Price Hunter into the Applications folder, then double-click this again." buttons {"OK"} default button 1 with title "Y99 Price Hunter"'
  exit 1
fi
xattr -dr com.apple.quarantine "$APP" 2>/dev/null
open "$APP"
osascript -e 'display notification "All set. Next time just open it from Applications or Launchpad." with title "Y99 Price Hunter"'
