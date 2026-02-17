# 1070: MCP stdio emits non-handshake output before initialize
# GitHub: #1070

MCP_SERVER = base + "/mcp-server.js" if base else ""

patch("1070a: stderr runtime log should not be raw JSON",
    MCP_SERVER,
    """console.error(JSON.stringify({
            arch: process.arch,
            mode: 'mcp-stdio',
            nodeVersion: process.version,
            pid: process.pid,
            platform: process.platform,
            protocol: 'stdio',
            sessionId,
            version: VERSION,
        }));""",
    """console.error(`[${new Date().toISOString()}] INFO [claude-flow-mcp] (${sessionId}) Runtime: ${process.platform}/${process.arch} node=${process.version} pid=${process.pid}`);""")

patch("1070b: remove premature server.initialized notification",
    MCP_SERVER,
    """// Send server initialization notification
        console.log(JSON.stringify({
            jsonrpc: '2.0',
            method: 'server.initialized',
            params: {
                serverInfo: {
                    name: 'claude-flow',
                    version: VERSION,
                    capabilities: {
                        tools: { listChanged: true },
                        resources: { subscribe: true, listChanged: true },
                    },
                },
            },
        }));""",
    """// Do not emit protocol messages until the client sends initialize.""")
