#!/bin/bash

# Test Statistics Script
# Runs tests and outputs formatted statistics

echo "═══════════════════════════════════════"
echo "RUNNING TEST SUITE"
echo "═══════════════════════════════════════"
echo ""

# Run tests and capture output
npm run test:run 2>&1 | tee /tmp/test-output.txt

# Extract test results
TOTAL_TESTS=$(grep -oP '(?<=\s)\d+(?=\s*passed \(all\))' /tmp/test-output.txt | tail -1 || echo "0")
TOTAL_FILES=$(grep -oP '(?<=Test Files\s+)\d+' /tmp/test-output.txt | tail -1 || echo "0")
DURATION=$(grep -oP '(?<=Duration\s+)[0-9.]+s' /tmp/test-output.txt | tail -1 || echo "unknown")

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
  if grep -q "FAIL" /tmp/test-output.txt; then
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
