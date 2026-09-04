#!/bin/bash
# 호출 이력 축적을 맥에 상주 등록한다 (launchd).
#
#   등록:  ./scripts/usage-cron-install.sh
#   해제:  ./scripts/usage-cron-install.sh uninstall
#   상태:  ./scripts/usage-cron-install.sh status
#
# 매일 한 번 `npm run usage:weekly` 를 돌린다. 맥이 잠들어 있으면 깨어난 뒤
# 한 번 실행한다 (launchd 의 기본 동작). 마감 다음 날부터는 래퍼가 스스로
# 아무것도 하지 않으므로, 해제를 잊어도 외부 API 를 두드리지 않는다.

set -euo pipefail

LABEL="com.safehour.usage"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER="$PROJECT_DIR/scripts/usage-cron.sh"

case "${1:-install}" in
  uninstall)
    launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "해제됐다. 더 이상 자동 실행되지 않는다."
    ;;

  status)
    if launchctl print "gui/$UID/$LABEL" >/dev/null 2>&1; then
      HOUR=$(/usr/libexec/PlistBuddy -c 'Print :StartCalendarInterval:Hour' "$PLIST" 2>/dev/null || echo '?')
      MIN=$(/usr/libexec/PlistBuddy -c 'Print :StartCalendarInterval:Minute' "$PLIST" 2>/dev/null || echo '?')
      printf '등록됨 — 매일 %02d:%02d 실행\n' "$HOUR" "$MIN"
      echo "로그: $PROJECT_DIR/logs/usage-cron/"
    else
      echo "등록되어 있지 않다."
    fi
    ;;

  install)
    [[ -x "$RUNNER" ]] || { echo "실행 파일이 없다: $RUNNER"; exit 1; }
    mkdir -p "$HOME/Library/LaunchAgents"

    # 정각을 피한다 — 전 세계가 같은 순간에 API 를 두드리지 않도록.
    cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$RUNNER</string></array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>11</integer><key>Minute</key><integer>23</integer></dict>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>$PROJECT_DIR/logs/usage-cron/launchd.out</string>
  <key>StandardErrorPath</key><string>$PROJECT_DIR/logs/usage-cron/launchd.err</string>
</dict>
</plist>
PLIST_EOF

    mkdir -p "$PROJECT_DIR/logs/usage-cron"
    launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$UID" "$PLIST"

    echo "등록 완료 — 매일 오전 11:23 에 실행된다."
    echo "  로그:   $PROJECT_DIR/logs/usage-cron/"
    echo "  해제:   ./scripts/usage-cron-install.sh uninstall"
    echo "  마감(2026-09-21) 다음 날부터는 스스로 실행하지 않는다."
    ;;

  *)
    echo "사용법: $0 [install|uninstall|status]"; exit 1
    ;;
esac
