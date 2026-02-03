#!/usr/bin/env bash
set -euo pipefail

# Test Statistics Script
# Runs tests and outputs formatted statistics

echo "═══════════════════════════════════════"
echo "RUNNING TEST SUITE"
echo "═══════════════════════════════════════"
echo ""

# Create temporary file
TEMP_OUTPUT=$(mktemp)
trap 'rm -f "$TEMP_OUTPUT"' EXIT

# Run tests and capture output
npm run test:run 2>&1 | tee "$TEMP_OUTPUT"

# Extract test results (portable grep without -P)
TOTAL_TESTS=$(grep -E "Tests\s+" "$TEMP_OUTPUT" | tail -1 | sed -E 's/.*Tests[[:space:]]+([0-9]+)[[:space:]]+passed.*/\1/' || echo "0")
TOTAL_FILES=$(grep -E "Test Files\s+" "$TEMP_OUTPUT" | tail -1 | sed -E 's/.*Test Files[[:space:]]+([0-9]+).*/\1/' || echo "0")
DURATION=$(grep -E "Duration\s+" "$TEMP_OUTPUT" | tail -1 | sed -E 's/.*Duration[[:space:]]+([0-9.]+s).*/\1/' || echo "unknown")

echo ""
echo "═══════════════════════════════════════"
echo "TEST SUMMARY"
echo "═══════════════════════════════════════"
echo ""

if [ -n "$TOTAL_TESTS" ] && [ "$TOTAL_TESTS" != "0" ]; then
  echo "Total Tests:     $TOTAL_TESTS"
  echo "Test Files:      $TOTAL_FILES"
  echo "Duration:        $DURATION"
  echo ""

  # Check if all tests passed
  if grep -q "FAIL" "$TEMP_OUTPUT"; then
    echo "❌ Some tests failed!"
    echo ""
    echo "Run 'npm run test:run' to see detailed output"
    exit 1
  else
    echo "✅ All tests passed!"
    exit 0
  fi
else
  echo "Error: Could not parse test results"
  echo "Run 'npm run test:run' to see details"
  exit 1
fi
