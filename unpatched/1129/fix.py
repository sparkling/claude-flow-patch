# 1129: Hardcoded model display version in statusline/hooks
# GitHub: #1129

STATUS_GEN = init + "/statusline-generator.js" if init else ""

patch("1129a: hooks statusline parse model version",
    HOOKS_CMD,
    "const modelName = 'Opus 4.5';",
    """let modelName = 'Unknown';
            const modelId = process.env.CLAUDE_MODEL || process.env.ANTHROPIC_MODEL || '';
            if (modelId.includes('opus')) {
                const match = modelId.match(/opus-(\\d+)-(\\d+)/);
                modelName = match ? `Opus ${match[1]}.${match[2]}` : 'Opus';
            }
            else if (modelId.includes('sonnet')) {
                const match = modelId.match(/sonnet-(\\d+)-(\\d+)/);
                modelName = match ? `Sonnet ${match[1]}.${match[2]}` : 'Sonnet';
            }
            else if (modelId.includes('haiku')) {
                const match = modelId.match(/haiku-(\\d+)-(\\d+)/);
                modelName = match ? `Haiku ${match[1]}.${match[2]}` : 'Haiku';
            }""")

patch("1129b: statusline generator parse modelId",
    STATUS_GEN,
    """if (modelId.includes('opus')) modelName = 'Opus 4.5';
          else if (modelId.includes('sonnet')) modelName = 'Sonnet 4';
          else if (modelId.includes('haiku')) modelName = 'Haiku 4.5';
          else modelName = modelId.split('-').slice(1, 3).join(' ');""",
    """if (modelId.includes('opus')) {
            const match = modelId.match(/opus-(\\d+)-(\\d+)/);
            modelName = match ? `Opus ${match[1]}.${match[2]}` : 'Opus';
          }
          else if (modelId.includes('sonnet')) {
            const match = modelId.match(/sonnet-(\\d+)-(\\d+)/);
            modelName = match ? `Sonnet ${match[1]}.${match[2]}` : 'Sonnet';
          }
          else if (modelId.includes('haiku')) {
            const match = modelId.match(/haiku-(\\d+)-(\\d+)/);
            modelName = match ? `Haiku ${match[1]}.${match[2]}` : 'Haiku';
          }
          else modelName = modelId.split('-').slice(1, 3).join(' ');""")

patch("1129c: statusline generator parse settings.model",
    STATUS_GEN,
    """if (settings.model.includes('opus')) modelName = 'Opus 4.5';
          else if (settings.model.includes('sonnet')) modelName = 'Sonnet 4';
          else if (settings.model.includes('haiku')) modelName = 'Haiku 4.5';
          else modelName = settings.model.split('-').slice(1, 3).join(' ');""",
    """if (settings.model.includes('opus')) {
            const match = settings.model.match(/opus-(\\d+)-(\\d+)/);
            modelName = match ? `Opus ${match[1]}.${match[2]}` : 'Opus';
          }
          else if (settings.model.includes('sonnet')) {
            const match = settings.model.match(/sonnet-(\\d+)-(\\d+)/);
            modelName = match ? `Sonnet ${match[1]}.${match[2]}` : 'Sonnet';
          }
          else if (settings.model.includes('haiku')) {
            const match = settings.model.match(/haiku-(\\d+)-(\\d+)/);
            modelName = match ? `Haiku ${match[1]}.${match[2]}` : 'Haiku';
          }
          else modelName = settings.model.split('-').slice(1, 3).join(' ');""")
