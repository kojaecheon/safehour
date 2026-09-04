#!/bin/bash
# 공모전 제출항목 4 — 공공 API 호출 이력을 매일 쌓는다.
#
# 호출은 그날 해야 그날로 기록된다. 소급이 안 되므로 사람이 기억하는 데 기대지 않는다.
# launchd 가 이 스크립트를 매일 부른다. 등록·해제는 scripts/usage-cron-install.sh 참고.
#
# 마감(아래 DEADLINE) 다음 날부터는 아무것도 하지 않고 종료한다 —
# 공모전이 끝난 뒤에도 매일 외부 API 를 두드릴 이유가 없다.

set -uo pipefail

DEADLINE="2026-09-21"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$PROJECT_DIR/logs/usage-cron"
LOG="$LOG_DIR/$(TZ=Asia/Seoul date +%Y-%m).log"

mkdir -p "$LOG_DIR"
say() { echo "[$(TZ=Asia/Seoul date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

TODAY="$(TZ=Asia/Seoul date +%F)"
if [[ "$TODAY" > "$DEADLINE" ]]; then
  say "마감($DEADLINE) 이 지나 실행하지 않는다. 이 작업은 해제해도 된다."
  exit 0
fi

cd "$PROJECT_DIR" || { say "작업 디렉터리를 찾지 못했다: $PROJECT_DIR"; exit 1; }

# launchd 는 로그인 셸 PATH 를 물려받지 않는다 — node 를 직접 찾는다.
for candidate in "$HOME/.nvm/versions/node"/*/bin "/opt/homebrew/bin" "/usr/local/bin"; do
  [[ -x "$candidate/node" ]] && PATH="$candidate:$PATH"
done
export PATH

if ! command -v npm >/dev/null 2>&1; then
  say "npm 을 찾지 못했다. PATH=$PATH"
  exit 1
fi

say "실행 시작"
if npm run usage:weekly >> "$LOG" 2>&1; then
  SUMMARY="$(grep -E '누적 호출' "$PROJECT_DIR/docs/API_USAGE_SNAPSHOT.md" | head -1)"
  say "완료 — $SUMMARY"
else
  say "실패 — 위 로그 확인. 인증키 오류나 한도 초과일 수 있다."
  exit 1
fi
