#!/bin/sh
# Instant zero-cold-start trigger for LaunchPad on Linux (.deb & AppImage).
# If LaunchPad is already running, send SIGUSR2 (<5ms, 0 MB RAM, no Electron boot).
# Otherwise exec the real Electron binary directly (passing --ozone-platform=x11 on KDE Wayland).

RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp}"
PID_FILE="${RUNTIME_DIR}/launchpad-$(id -u).pid"

if [ -r "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE" 2>/dev/null)"
  if [ -n "$PID" ] && [ -r "/proc/$PID/cmdline" ] && grep -qa "launchpad-link-aggregator" "/proc/$PID/cmdline" 2>/dev/null; then
    if kill -USR2 "$PID" 2>/dev/null; then
      exit 0
    fi
  fi
fi

SELF="$0"
if command -v readlink >/dev/null 2>&1; then
  RESOLVED="$(readlink -f "$SELF" 2>/dev/null)"
  [ -n "$RESOLVED" ] && SELF="$RESOLVED"
fi
DIR="$(CDPATH= cd -- "$(dirname -- "$SELF")" && pwd)"
REAL_BIN="$DIR/launchpad-link-aggregator.bin"

case "${XDG_CURRENT_DESKTOP:-}" in
  *KDE*|*kde*)
    if [ "${XDG_SESSION_TYPE:-}" = "wayland" ] && [ -n "${DISPLAY:-}" ]; then
      export ELECTRON_OZONE_PLATFORM_HINT=x11
      export LAUNCHPAD_X11_RELAUNCHED=1
      exec "$REAL_BIN" --ozone-platform=x11 "$@"
    fi
    ;;
esac

exec "$REAL_BIN" "$@"
