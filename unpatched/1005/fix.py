# 1005: memory store crashes when --value is numeric
# GitHub: #1005

MEM_CMD = commands + "/memory.js" if commands else ""

patch("1005a: use nullish fallback for value parsing",
    MEM_CMD,
    "let value = ctx.flags.value || ctx.args[0];",
    "let value = ctx.flags.value ?? ctx.args[0];")

patch("1005b: normalize value to string before Buffer.byteLength",
    MEM_CMD,
    """        if (!value && ctx.interactive) {
            value = await input({
                message: 'Enter value to store:',
                validate: (v) => v.length > 0 || 'Value is required'
            });
        }
        if (!value) {
            output.printError('Value is required. Use --value');
            return { success: false, exitCode: 1 };
        }
        const storeData = {
            key,
            namespace,
            value,
            ttl,
            tags,
            asVector,
            storedAt: new Date().toISOString(),
            size: Buffer.byteLength(value, 'utf8')
        };""",
    """        if ((value === undefined || value === null || value === '') && ctx.interactive) {
            value = await input({
                message: 'Enter value to store:',
                validate: (v) => v.length > 0 || 'Value is required'
            });
        }
        if (value === undefined || value === null || value === '') {
            output.printError('Value is required. Use --value');
            return { success: false, exitCode: 1 };
        }
        const normalizedValue = typeof value === 'string' ? value : String(value);
        const storeData = {
            key,
            namespace,
            value: normalizedValue,
            ttl,
            tags,
            asVector,
            storedAt: new Date().toISOString(),
            size: Buffer.byteLength(normalizedValue, 'utf8')
        };""")

patch("1005c: pass normalizedValue into storeEntry",
    MEM_CMD,
    """            const result = await storeEntry({
                key,
                value,
                namespace,
                generateEmbeddingFlag: true, // Always generate embeddings for semantic search""",
    """            const result = await storeEntry({
                key,
                value: normalizedValue,
                namespace,
                generateEmbeddingFlag: true, // Always generate embeddings for semantic search""")
