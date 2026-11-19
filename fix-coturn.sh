#!/bin/bash
# WafaTalk coturn TURN fix — run as root on 31.70.139.221

echo "=== 1. Check coturn status ==="
systemctl status coturn --no-pager 2>/dev/null || systemctl status turnserver --no-pager 2>/dev/null || echo "service not found in systemctl"

echo ""
echo "=== 2. Find the SQLite DB ==="
DB_PATH=""
for f in /var/lib/turn/sqlite3.db /var/lib/coturn/turndb /var/db/turndb /etc/coturn/turndb /var/lib/turn/turndb; do
  if [ -f "$f" ]; then
    DB_PATH="$f"
    echo "Found DB: $DB_PATH"
    break
  fi
done
if [ -z "$DB_PATH" ]; then
  echo "No existing DB file found. Creating /var/lib/turn/sqlite3.db"
  mkdir -p /var/lib/turn
  DB_PATH="/var/lib/turn/sqlite3.db"
fi

echo ""
echo "=== 3. Add wafatalk user to DB ==="
REALM="api.wafatalk.com"
PASS="WafaTalkGlobalTurn2026!"

# Compute hex SHA1 of 'password-realm'
HEX_HASH=$(python3 -c "import hashlib; print(hashlib.sha1(('WafaTalkGlobalTurn2026!-' + 'api.wafatalk.com').encode()).hexdigest())" 2>/dev/null)

if [ -n "$HEX_HASH" ] && [ -f "$DB_PATH" ]; then
  echo "Hash: $HEX_HASH"
  sqlite3 "$DB_PATH" "CREATE TABLE IF NOT EXISTS turn_user (username TEXT PRIMARY KEY, password TEXT);"
  sqlite3 "$DB_PATH" "INSERT OR REPLACE INTO turn_user (username, password) VALUES ('wafatalk', '$HEX_HASH');"
  echo "Verifying:"
  sqlite3 "$DB_PATH" "SELECT * FROM turn_user WHERE username='wafatalk';"
elif [ -n "$HEX_HASH" ]; then
  echo "DB file missing but hash computed: $HEX_HASH"
  echo "Run manually: sqlite3 $DB_PATH \"INSERT OR REPLACE INTO turn_user (username, password) VALUES ('wafatalk', '$HEX_HASH');\""
fi

echo ""
echo "=== 4. Restart coturn ==="
systemctl restart coturn 2>/dev/null || systemctl restart turnserver 2>/dev/null || echo "restart failed — check service name"
sleep 2
systemctl status coturn --no-pager 2>/dev/null || systemctl status turnserver --no-pager 2>/dev/null

echo ""
echo "=== 5. Verify TURN allocation ==="
turnadmin -a -u wafatalk -r "$REALM" -p "$PASS" -b "$DB_PATH" -v 2>&1
echo ""
echo "=== DONE ==="
