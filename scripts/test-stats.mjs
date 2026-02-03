#!/usr/bin/env node

/**
 * Test Statistics Script
 *
 * Runs tests and outputs formatted statistics for CI/CD and documentation.
 * This script helps keep documentation up-to-date without manual updates.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

function runTests() {
  const testResultsFile = path.join(os.tmpdir(), `.test-results-${Date.now()}.json`);
  
  try {
    console.log('Running test suite...\n');

    const output = execSync(
      'npm run test:run -- --reporter=json',
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );

    const results = JSON.parse(output);

    // Save results to temp directory
    fs.writeFileSync(testResultsFile, JSON.stringify(results, null, 2));

    printSummary(results);
    printDetailedStats(results);

    // Exit with non-zero code if any tests failed
    if (results.numFailedTests > 0) {
      console.error('\n❌ Tests failed!');
      process.exit(1);
    }

    console.log('\n✅ All tests passed!');
    process.exit(0);

  } catch (error) {
    console.error('Error running tests:', error.message);
    process.exit(1);
  } finally {
    // Clean up temp file
    try {
      if (fs.existsSync(testResultsFile)) {
        fs.unlinkSync(testResultsFile);
      }
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
  }
}

function printSummary(results) {
  console.log('═══════════════════════════════════════');
  console.log('TEST SUMMARY');
  console.log('═══════════════════════════════════════\n');

  console.log(`Total Tests:     ${results.numTotalTests}`);
  console.log(`Passing:        ${results.numPassedTests} (${((results.numPassedTests / results.numTotalTests) * 100).toFixed(1)}%)`);
  console.log(`Failing:        ${results.numFailedTests}`);
  console.log(`Pending:        ${results.numPendingTests}`);
  console.log(`Test Files:     ${results.numTotalTestSuites}`);
  console.log(`Test Suites:    ${results.numPassedTestSuites} passed`);

  if (results.numFailedTestSuites > 0) {
    console.log(`                ${results.numFailedTestSuites} failed`);
  }
}

function printDetailedStats(results) {
  console.log('\n═══════════════════════════════════════');
  console.log('TEST FILES');
  console.log('═══════════════════════════════════════\n');

  // Group by directory
  const byDirectory = {};
  results.testResults.forEach(result => {
    const filePath = result.name;
    const dirMatch = filePath.match(/src\/tests\/(\w+)\/\w+\.test\.ts/);
    const directory = dirMatch ? dirMatch[1] : 'other';

    if (!byDirectory[directory]) {
      byDirectory[directory] = { tests: 0, passed: 0, failed: 0, files: 0 };
    }

    const stats = byDirectory[directory];
    stats.tests += result.assertionResults.length;
    stats.passed += result.assertionResults.filter(r => r.status === 'passed').length;
    stats.failed += result.assertionResults.filter(r => r.status === 'failed').length;
    stats.files += 1;
  });

  // Print by directory
  Object.entries(byDirectory)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([dir, stats]) => {
      const status = stats.failed === 0 ? '✅' : '❌';
      console.log(`${status} ${dir.padEnd(20)} ${stats.tests.toString().padStart(4)} tests (${stats.files} files)`);
    });

  // Print failing tests if any
  if (results.numFailedTests > 0) {
    console.log('\n═══════════════════════════════════════');
    console.log('FAILING TESTS');
    console.log('═══════════════════════════════════════\n');

    results.testResults.forEach(result => {
      const failedTests = result.assertionResults.filter(r => r.status === 'failed');
      if (failedTests.length > 0) {
        const fileName = path.basename(result.name);
        console.log(`❌ ${fileName}`);
        failedTests.forEach(test => {
          console.log(`   ${test.title}`);
          if (test.failureMessages && test.failureMessages.length > 0) {
            console.log(`   Error: ${test.failureMessages[0].split('\n')[0]}`);
          }
        });
        console.log('');
      }
    });
  }
}

// Run the script
runTests();
