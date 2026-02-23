# CF-003: Doctor --install native dependency resolution
# GitHub: #1186

# CF-003z: Remove config.yaml/yml from checkConfigFile discovery paths
# After our patches, config.json is canonical — yaml should not be discovered
patch("CF-003z: strip yaml from checkConfigFile",
    DOC,
    """    const configPaths = [
        '.claude-flow/config.json',
        'claude-flow.config.json',
        '.claude-flow.json',
        '.claude-flow/config.yaml',
        '.claude-flow/config.yml'
    ];""",
    """    const configPaths = [
        '.claude-flow/config.json',
        'claude-flow.config.json',
        '.claude-flow.json'
    ];""")

# CF-003a: Add checkMemoryBackend() diagnostic function
# Insert after checkMemoryDatabase, before checkApiKeys
patch("CF-003a: checkMemoryBackend diagnostic (absorbs CF-005)",
    DOC,
    """    return { name: 'Memory Database', status: 'warn', message: 'Not initialized', fix: 'claude-flow memory configure --backend hybrid' };
}
// Check API keys""",
    """    return { name: 'Memory Database', status: 'warn', message: 'Not initialized', fix: 'claude-flow memory configure --backend hybrid' };
}
// Check memory backend dependencies
async function checkMemoryBackend() {
    // CF-003a: Read configured backend from config.json
    let configuredBackend = 'hybrid';
    try {
        const cfgPath = join(process.cwd(), '.claude-flow', 'config.json');
        if (existsSync(cfgPath)) {
            const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
            if (cfg.memory && cfg.memory.backend) configuredBackend = cfg.memory.backend;
        }
    } catch {}
    // Check package availability
    const packages = {};
    for (const pkg of ['better-sqlite3', 'agentdb', '@claude-flow/memory']) {
        try {
            require.resolve(pkg);
            packages[pkg] = true;
        } catch {
            packages[pkg] = false;
        }
    }
    const needsNative = ['hybrid', 'sqlite'].includes(configuredBackend);
    const hasBetterSqlite3 = packages['better-sqlite3'];
    const hasMemoryPkg = packages['@claude-flow/memory'];
    if (needsNative && !hasBetterSqlite3) {
        return {
            name: 'Memory Backend',
            status: 'fail',
            message: `backend: ${configuredBackend} — better-sqlite3 native bindings missing`,
            fix: 'npx @claude-flow/cli doctor --install  OR  set "memory.backend": "sqljs" in .claude-flow/config.json'
        };
    }
    if (needsNative && !hasMemoryPkg) {
        return {
            name: 'Memory Backend',
            status: 'warn',
            message: `backend: ${configuredBackend} — @claude-flow/memory not found`,
            fix: 'npm install @claude-flow/memory'
        };
    }
    const available = Object.entries(packages).filter(([,v]) => v).map(([k]) => k);
    return {
        name: 'Memory Backend',
        status: 'pass',
        message: `backend: ${configuredBackend} — deps OK (${available.join(', ')})`
    };
}
// Check API keys""")

# CF-003a2: Add checkMemoryBackend to allChecks array
patch("CF-003a2: add checkMemoryBackend to allChecks",
    DOC,
    """            checkMemoryDatabase,
            checkApiKeys,""",
    """            checkMemoryDatabase,
            checkMemoryBackend,
            checkApiKeys,""")

# CF-003a3: Add checkMemoryBackend to componentMap
patch("CF-003a3: add checkMemoryBackend to componentMap",
    DOC,
    """            'memory': checkMemoryDatabase,""",
    """            'memory': checkMemoryDatabase,
            'memory-backend': checkMemoryBackend,""")

# CF-003b: Extend --install to auto-resolve native deps
patch("CF-003b: --install native dep rebuild",
    DOC,
    """                    output.writeln(formatCheck(newCheck));
                }
            }
        }
        // Summary""",
    """                    output.writeln(formatCheck(newCheck));
                }
            }
        }
        // Auto-rebuild native dependencies if needed
        if (autoInstall) {
            const memBackendResult = results.find(r => r.name === 'Memory Backend');
            if (memBackendResult && memBackendResult.status === 'fail') {
                output.writeln();
                output.writeln(output.bold('Rebuilding native dependencies...'));
                try {
                    // Find better-sqlite3 package directory
                    let bsqlDir = '';
                    try {
                        const resolved = require.resolve('better-sqlite3/package.json');
                        bsqlDir = resolved.substring(0, resolved.lastIndexOf('/'));
                    } catch {
                        // Try common npx cache locations
                        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
                        const npxCache = join(homeDir, '.npm', '_npx');
                        if (existsSync(npxCache)) {
                            const entries = readdirSync(npxCache);
                            for (const entry of entries) {
                                const candidate = join(npxCache, entry, 'node_modules', 'better-sqlite3');
                                if (existsSync(candidate)) { bsqlDir = candidate; break; }
                            }
                        }
                    }
                    if (bsqlDir) {
                        output.writeln(output.dim(`  Rebuilding better-sqlite3 at ${bsqlDir}...`));
                        execSync('npx node-gyp rebuild', {
                            cwd: bsqlDir,
                            encoding: 'utf8',
                            stdio: 'pipe',
                            timeout: 120000
                        });
                        output.writeln(output.success('  better-sqlite3 rebuilt successfully'));
                        // Re-check after rebuild
                        const recheck = await checkMemoryBackend();
                        const idx = results.findIndex(r => r.name === 'Memory Backend');
                        if (idx !== -1) results[idx] = recheck;
                        output.writeln(formatCheck(recheck));
                    } else {
                        output.writeln(output.warning('  better-sqlite3 package not found — install it first'));
                    }
                } catch (rebuildErr) {
                    output.writeln(output.error('  Failed to rebuild native dependencies'));
                    if (rebuildErr instanceof Error) {
                        output.writeln(output.dim(`  ${rebuildErr.message}`));
                    }
                    output.writeln(output.dim('  Workaround: set "memory.backend": "sqljs" in .claude-flow/config.json'));
                }
            }
        }
        // Summary""")
