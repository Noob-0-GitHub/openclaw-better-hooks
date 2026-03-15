#!/bin/bash

# BETTER HOOKS - INDUSTRIAL SMOKE TEST
# Author: Claw (Agent) & Anthony
# Logic: Dynamic path resolution + Dual logging + Robust guard rails

LOG_FILE="test.out.log"
CMD="openclaw bhooks"
EVIDENCE="/tmp/bh_smoke_result"

# Clear previous log
echo "--- TEST SESSION START: $(date) ---" > "$LOG_FILE"

# Dual output helper
log() {
    echo -e "$1" | tee -a "$LOG_FILE"
}

log " [1/5] Running Doctor & Resolving Paths..."
DOCTOR_OUT=$($CMD doctor 2>&1)
CONFIG_FILE=$(echo "$DOCTOR_OUT" | grep "Config path:" | awk '{print $NF}')

if [ -z "$CONFIG_FILE" ]; then
    log " [ERROR] Could not extract config path from doctor output."
    log " Output was: $DOCTOR_OUT"
    exit 1
fi

if [ ! -f "$CONFIG_FILE" ]; then
    log " [ERROR] Config file does not exist at: $CONFIG_FILE"
    exit 1
fi

log " [SUCCESS] Target Config: $CONFIG_FILE"

# Backup for safety during test
cp "$CONFIG_FILE" "$CONFIG_FILE.test_bak"

log "
 [2/5] Cleaning Test Environment..."
# Start with a clean slate for smoke test
rm -f "$CONFIG_FILE"
$CMD doctor >> "$LOG_FILE" 2>&1

log "
 [3/5] Testing Resource Lifecycle (Add/List/Update)..."
$CMD event add smoke:test "SMOKE_SIGNAL" "Automated test event" >> "$LOG_FILE" 2>&1
$CMD add command smoke:test "echo 'SUCCESS' > $EVIDENCE" --cooldown 1000 >> "$LOG_FILE" 2>&1
$CMD add webhook smoke:test "http://localhost:9999/dummy" --enabled false >> "$LOG_FILE" 2>&1

# Verify list contains items
LIST_OUT=$($CMD list)
if echo "$LIST_OUT" | grep -q "smoke:test"; then
    log " [SUCCESS] Resources registered correctly."
else
    log " [ERROR] Resources missing from list."
    exit 1
fi

# Update command
$CMD update command 0 --cmd "echo 'UPDATED' > $EVIDENCE" --cooldown 5000 >> "$LOG_FILE" 2>&1

log "
 [4/5] Testing Manual Trigger (The Real Test)..."
rm -f "$EVIDENCE"
$CMD trigger smoke:test >> "$LOG_FILE" 2>&1

# Wait for async execution
sleep 2

if [ -f "$EVIDENCE" ]; then
    CONTENT=$(cat "$EVIDENCE")
    if [ "$CONTENT" == "UPDATED" ]; then
        log " [SUCCESS] Trigger fired and executed correctly (Found: $CONTENT)."
    else
        log " [ERROR] Evidence found but content mismatch (Found: $CONTENT)."
    fi
else
    log " [ERROR] Evidence file not found. Trigger failed."
fi

log "
 [5/5] Final Audit & Restore..."
$CMD list >> "$LOG_FILE" 2>&1

# Restore original config
mv "$CONFIG_FILE.test_bak" "$CONFIG_FILE"
log " [SUCCESS] Original configuration restored."
log "
--- TEST SESSION COMPLETE ---"
log "Full details saved to: $LOG_FILE"
