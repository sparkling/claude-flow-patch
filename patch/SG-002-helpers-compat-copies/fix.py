# SG-002: init doesn't create .js/.cjs compat copies for helper modules
# GitHub: #1153
#
# Root cause:
# writeHelpers() produces either .cjs (from source copy) or .js (from generation)
# but never both. writeStatusline() produces statusline.cjs but no .js copy.
# hook-handler.cjs uses safeRequire('router.js'), safeRequire('session.js'),
# safeRequire('memory.js') — so the missing extension variant causes failures.
#
# Fix: Single compat sweep after both writeHelpers() and writeStatusline() complete.
# For each module, if only one extension exists, copy it to the other.

patch("SG-002: compat copies after helpers + statusline init",
    EXECUTOR,
    """        // Generate statusline
        if (options.components.statusline) {
            await writeStatusline(targetDir, options, result);
        }
        // Generate runtime config""",
    """        // Generate statusline
        if (options.components.statusline) {
            await writeStatusline(targetDir, options, result);
        }
        // SG-002: Create .js/.cjs compat copies so hook-handler.cjs can require() both extensions
        {
            const hDir = path.join(targetDir, '.claude', 'helpers');
            for (const mod of ['router', 'session', 'memory', 'statusline']) {
                const cjsP = path.join(hDir, `${mod}.cjs`);
                const jsP = path.join(hDir, `${mod}.js`);
                if (fs.existsSync(cjsP) && !fs.existsSync(jsP)) {
                    fs.copyFileSync(cjsP, jsP);
                    result.created.files.push(`.claude/helpers/${mod}.js`);
                } else if (fs.existsSync(jsP) && !fs.existsSync(cjsP)) {
                    fs.copyFileSync(jsP, cjsP);
                    result.created.files.push(`.claude/helpers/${mod}.cjs`);
                }
            }
        }
        // Generate runtime config""")
