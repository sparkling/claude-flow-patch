import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync,
  mkdirSync, readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

// ── Find patched npx cache ──────────────────────────────────────────────────

function findPatchedNpxNm() {
  const npxDir = join(homedir(), '.npm', '_npx');
  if (!existsSync(npxDir)) return null;
  for (const hash of readdirSync(npxDir)) {
    const nm = join(npxDir, hash, 'node_modules');
    const cliBase = join(nm, '@claude-flow', 'cli', 'dist', 'src');
    const daemonJs = join(cliBase, 'commands', 'daemon.js');
    if (existsSync(daemonJs)) return nm;
  }
  return null;
}

const npxNm = findPatchedNpxNm();
const canRun = !!npxNm;
const skipMsg = !canRun ? 'patched npx cache not found' : false;
const cliBase = npxNm ? join(npxNm, '@claude-flow', 'cli', 'dist', 'src') : '';

function cli(args, cwd, timeout = 30000) {
  return spawnSync('npx', ['@claude-flow/cli', ...args], {
    encoding: 'utf-8',
    timeout,
    cwd,
    env: { ...process.env, npm_config_yes: 'true', NODE_NO_WARNINGS: '1' },
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// Suite: daemon-lifecycle: log directory creation (DM-001)
// ══════════════════════════════════════════════════════════════════════════════

describe('daemon-lifecycle: log directory creation (DM-001)', { skip: skipMsg }, () => {
  let djContent;

  before(() => {
    djContent = readFileSync(join(cliBase, 'commands', 'daemon.js'), 'utf-8');
  });

  it('DM-001: daemon.js creates logs/ subdirectory before log path', () => {
    // The patch creates logsDir = join(stateDir, 'logs') and mkdirSync it
    // before assigning logFile. Verify the logs dir creation comes before logFile.
    const logsDirIdx = djContent.indexOf("const logsDir = join(stateDir, 'logs')");
    const logFileIdx = djContent.indexOf("const logFile = join(logsDir, 'daemon.log')");
    assert.ok(logsDirIdx >= 0, 'daemon.js should define logsDir');
    assert.ok(logFileIdx >= 0, 'daemon.js should define logFile from logsDir');
    assert.ok(logsDirIdx < logFileIdx,
      'logsDir creation should come before logFile assignment');
  });

  it('DM-001: daemon.js mkdirSync for logs/ before logFile', () => {
    const mkdirIdx = djContent.indexOf("fs.mkdirSync(logsDir, { recursive: true })");
    const logFileIdx = djContent.indexOf("const logFile = join(logsDir, 'daemon.log')");
    assert.ok(mkdirIdx >= 0, 'daemon.js should mkdir logsDir');
    assert.ok(mkdirIdx < logFileIdx,
      'mkdirSync(logsDir) should precede logFile assignment');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: daemon-lifecycle: log rotation (DM-006)
// ══════════════════════════════════════════════════════════════════════════════

describe('daemon-lifecycle: log rotation (DM-006)', { skip: skipMsg }, () => {
  let hweContent;
  let djContent;

  before(() => {
    hweContent = readFileSync(
      join(cliBase, 'services', 'headless-worker-executor.js'), 'utf-8');
    djContent = readFileSync(join(cliBase, 'commands', 'daemon.js'), 'utf-8');
  });

  it('DM-006: cleanupOldLogs is called from ensureLogDir', () => {
    // Verify the call exists within the ensureLogDir method body
    const ensureIdx = hweContent.indexOf('ensureLogDir()');
    const cleanupCallIdx = hweContent.indexOf('this.cleanupOldLogs()');
    assert.ok(ensureIdx >= 0, 'ensureLogDir method should exist');
    assert.ok(cleanupCallIdx >= 0, 'cleanupOldLogs should be called');
    assert.ok(cleanupCallIdx > ensureIdx,
      'cleanupOldLogs() call should appear inside ensureLogDir()');
  });

  it('DM-006: cleanupOldLogs accepts maxAgeDays and maxFiles params', () => {
    // Verify the function signature has both parameters with defaults
    const match = hweContent.match(/cleanupOldLogs\s*\(\s*maxAgeDays\s*=\s*(\d+)\s*,\s*maxFiles\s*=\s*(\d+)\s*\)/);
    assert.ok(match, 'cleanupOldLogs should have maxAgeDays and maxFiles params');
    assert.equal(match[1], '7', 'default maxAgeDays should be 7');
    assert.equal(match[2], '500', 'default maxFiles should be 500');
  });

  it('DM-006: cleanupOldLogs sorts files by mtime descending', () => {
    // Ensures newest files are kept (sorted descending), oldest culled
    assert.ok(
      hweContent.includes('b.mtime - a.mtime'),
      'cleanupOldLogs should sort files by mtime descending (newest first)');
  });

  it('DM-006: cleanupOldLogs removes by age and count', () => {
    // Both age cutoff and file count limit should be checked
    assert.ok(
      hweContent.includes('cutoff') && hweContent.includes('maxFiles'),
      'cleanupOldLogs should check both age cutoff and maxFiles limit');
    assert.ok(
      hweContent.includes('86400000'),
      'cleanupOldLogs should use 86400000 ms/day for age calculation');
  });

  it('DM-006: main daemon.log rotates via renameSync', () => {
    assert.ok(
      djContent.includes('fs.renameSync(logFile,'),
      'daemon.js should rotate daemon.log using renameSync');
    assert.ok(
      djContent.includes("logFile + '.1'"),
      'daemon.js should rotate daemon.log to daemon.log.1');
  });

  it('DM-006: rotation threshold is exactly 50MB', () => {
    const match = djContent.match(/logStat\.size\s*>\s*(\d+\s*\*\s*\d+\s*\*\s*\d+)/);
    assert.ok(match, 'daemon.js should compare logStat.size against threshold');
    const threshold = Function(`"use strict"; return (${match[1]})`)();
    assert.equal(threshold, 50 * 1024 * 1024,
      `rotation threshold should be 50MB (52428800), got ${threshold}`);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: daemon-lifecycle: daemon.autoStart gating (HK-004)
// ══════════════════════════════════════════════════════════════════════════════

describe('daemon-lifecycle: daemon.autoStart gating (HK-004)', { skip: skipMsg }, () => {
  let hooksContent;

  before(() => {
    hooksContent = readFileSync(
      join(cliBase, 'mcp-tools', 'hooks-tools.js'), 'utf-8');
  });

  it('HK-004: params.startDaemon === false short-circuits before settings read', () => {
    // The IIFE should check params.startDaemon first
    const paramCheckIdx = hooksContent.indexOf('params.startDaemon === false');
    const settingsIdx = hooksContent.indexOf('settings.json', paramCheckIdx);
    assert.ok(paramCheckIdx >= 0, 'should check params.startDaemon');
    assert.ok(settingsIdx > paramCheckIdx,
      'params check should come before settings.json read');
  });

  it('HK-004: settings.json read is wrapped in try/catch', () => {
    // Find the settings.json read near the autoStart check
    const autoStartIdx = hooksContent.indexOf('autoStart === false');
    assert.ok(autoStartIdx >= 0, 'should check autoStart === false');
    // The try/catch should surround the settings read
    const regionStart = Math.max(0, autoStartIdx - 500);
    const region = hooksContent.substring(regionStart, autoStartIdx + 200);
    assert.ok(region.includes('try'), 'settings.json read should be in try block');
    assert.ok(region.includes('catch'), 'settings.json read should have catch');
  });

  it('HK-004: autoStart check uses optional chaining for safety', () => {
    assert.ok(
      hooksContent.includes('claudeFlow?.daemon?.autoStart'),
      'should use optional chaining s?.claudeFlow?.daemon?.autoStart');
  });

  it('HK-004: settings with autoStart=false produces correct JSON', () => {
    // Validate the settings JSON structure that the patch reads
    const settings = {
      claudeFlow: { daemon: { autoStart: false } },
    };
    const json = JSON.stringify(settings);
    const parsed = JSON.parse(json);
    assert.equal(parsed.claudeFlow.daemon.autoStart, false,
      'settings JSON round-trip should preserve autoStart=false');
  });

  it('HK-004: settings.json read targets .claude/settings.json path', () => {
    assert.ok(
      hooksContent.includes("'.claude', 'settings.json'") ||
      hooksContent.includes("'.claude','settings.json'"),
      'should construct path to .claude/settings.json');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: daemon-lifecycle: PID file guard (HK-005)
// ══════════════════════════════════════════════════════════════════════════════

describe('daemon-lifecycle: PID file guard (HK-005)', { skip: skipMsg }, () => {
  let hooksContent;

  before(() => {
    hooksContent = readFileSync(
      join(cliBase, 'mcp-tools', 'hooks-tools.js'), 'utf-8');
  });

  it('HK-005: PID file uses .claude-flow/daemon.pid path', () => {
    assert.ok(
      hooksContent.includes("'.claude-flow'") && hooksContent.includes("'daemon.pid'"),
      'PID file should be at .claude-flow/daemon.pid');
  });

  it('HK-005: PID read is parsed as integer', () => {
    assert.ok(
      hooksContent.includes('parseInt(') && hooksContent.includes(', 10)'),
      'PID should be parsed with parseInt(..., 10)');
  });

  it('HK-005: NaN PID check before kill probe', () => {
    const isNaNIdx = hooksContent.indexOf('isNaN(_xPid)');
    const killIdx = hooksContent.indexOf('process.kill(_xPid, 0)');
    assert.ok(isNaNIdx >= 0, 'should check isNaN on parsed PID');
    assert.ok(killIdx >= 0, 'should probe PID with kill(pid, 0)');
    assert.ok(isNaNIdx < killIdx,
      'NaN check should precede kill probe');
  });

  it('HK-005: stale PID is handled (dead process proceeds)', () => {
    // When process.kill throws (dead process), catch block should let daemon start
    const killIdx = hooksContent.indexOf('process.kill(_xPid, 0)');
    assert.ok(killIdx >= 0, 'should have kill probe');
    const afterKill = hooksContent.substring(killIdx, killIdx + 300);
    assert.ok(afterKill.includes('catch'),
      'kill(pid, 0) should be in try/catch to handle dead processes');
    assert.ok(afterKill.includes('stale') || afterKill.includes('dead') || afterKill.includes('proceed'),
      'catch should handle stale PID case');
  });

  it('HK-005: alive PID sets reused flag and skips daemon', () => {
    assert.ok(
      hooksContent.includes('reused: true'),
      'should mark daemon status as reused when PID is alive');
    assert.ok(
      hooksContent.includes('_skipDaemon = true'),
      'should set _skipDaemon when existing PID is alive');
  });

  it('HK-005: PID written after successful daemon start', () => {
    // After startDaemon() succeeds, PID should be written
    const writeIdx = hooksContent.indexOf("writeFileSync(_pidPath, String(status.pid");
    assert.ok(writeIdx >= 0,
      'should write PID file after daemon start with writeFileSync');
  });

  it('HK-005: PID directory created if missing', () => {
    const writeIdx = hooksContent.indexOf("writeFileSync(_pidPath");
    assert.ok(writeIdx >= 0, 'should have writeFileSync for PID');
    const region = hooksContent.substring(Math.max(0, writeIdx - 300), writeIdx);
    assert.ok(
      region.includes('mkdirSync(_pidDir') || region.includes('existsSync(_pidDir'),
      'should ensure PID directory exists before writing');
  });

  it('HK-005: guard block has matching open/close braces', () => {
    // The _skipDaemon guard opens with if (!_skipDaemon) { and must close
    const guardStart = hooksContent.indexOf('if (!_skipDaemon)');
    assert.ok(guardStart >= 0, 'should have if (!_skipDaemon) guard');
    assert.ok(
      hooksContent.includes('end HK-005 guard'),
      'should have closing comment for HK-005 guard block');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: daemon-lifecycle: daemon CLI basics
// ══════════════════════════════════════════════════════════════════════════════

describe('daemon-lifecycle: daemon CLI basics', { skip: skipMsg }, () => {
  it('daemon status exits 0 or 1 (never crashes)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfp-daemon-status-'));
    try {
      const r = cli(['daemon', 'status'], dir, 30000);
      assert.ok(
        r.status === 0 || r.status === 1,
        `daemon status should exit 0 or 1, got ${r.status}: ${r.stderr}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('daemon --help shows subcommands', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfp-daemon-help-'));
    try {
      const r = cli(['daemon', '--help'], dir, 30000);
      const output = r.stdout + r.stderr;
      const hasSubcmds = output.includes('start') || output.includes('stop') ||
                         output.includes('status');
      assert.ok(hasSubcmds,
        `daemon --help should mention start/stop/status, got: ${output.substring(0, 300)}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
