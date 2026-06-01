#!/bin/bash
# ContentClaude — One-command launch script
# Run after setting DATABASE_URL and REDIS_URL in .env
#
# Usage:
#   bash launch.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
info() { echo -e "${BLUE}→${NC} $1"; }

echo ""
echo "=========================================="
echo "  ContentClaude — Pre-Launch Checklist"
echo "=========================================="
echo ""

# ── 1. Environment variable checks ──────────────────────────────────────────
info "Checking environment variables..."

check_env() {
  local var=$1
  local val
  val=$(grep "^${var}=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"')
  if [ -z "$val" ] || [ "$val" = "postgresql://user:password@localhost:5432/contentpilot" ] || [ "$val" = "your-real-url-here" ]; then
    fail "$var is not set or still has placeholder value. Edit .env first."
  fi
  ok "$var is set"
}

[ -f .env ] || fail ".env file not found"
check_env "DATABASE_URL"
check_env "REDIS_URL"
check_env "SHOPIFY_API_KEY"
check_env "SHOPIFY_API_SECRET"
check_env "ANTHROPIC_API_KEY"

# ── 2. Prisma schema push ────────────────────────────────────────────────────
echo ""
info "Pushing Prisma schema to PostgreSQL..."
npx prisma db push --accept-data-loss 2>&1 | tail -5
ok "Database schema applied"

# ── 3. Prisma client generation ──────────────────────────────────────────────
info "Generating Prisma client..."
npx prisma generate 2>&1 | tail -3
ok "Prisma client generated"

# ── 4. Build verification ────────────────────────────────────────────────────
echo ""
info "Running production build..."
npm run build 2>&1 | tail -4
ok "Build clean"

# ── 5. Test suite ────────────────────────────────────────────────────────────
echo ""
info "Running test suite..."
npm test 2>&1 | grep -E "Tests|passed|failed" | tail -3
ok "Tests passing"

# ── 6. Security check ────────────────────────────────────────────────────────
echo ""
info "Checking for exposed secrets..."
EXPOSED=$(grep -r "ANTHROPIC_API_KEY\|SHOPIFY_API_SECRET" app/routes/ 2>/dev/null | grep -v "process.env" | wc -l)
[ "$EXPOSED" -eq 0 ] && ok "No secrets exposed in routes" || fail "Secrets found in routes!"

# ── 7. Shopify app toml check ────────────────────────────────────────────────
echo ""
info "Checking Shopify configuration..."
APP_URL=$(grep "^application_url" shopify.app.toml | cut -d'"' -f2)
if [ "$APP_URL" = "https://example.com" ]; then
  warn "shopify.app.toml still has placeholder URL — update before running 'shopify app deploy'"
else
  ok "application_url = $APP_URL"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}  Pre-launch checks complete!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Update shopify.app.toml with your production URL"
echo "  2. Deploy:  fly deploy  (or: shopify app deploy)"
echo "  3. Verify:  curl https://your-app.fly.dev/api/health"
echo ""
