# Privacy information — Lanhu MCP Bridge

The extension reads Lanhu and Axure design metadata on pages opened in the user's browser **only while data capture is enabled**. Data may include design layer text, project and page names, comments and design URLs. It attempts to mask credential-like fields and strips API URL queries before forwarding; this is best-effort and cannot guarantee removal of secrets in free-form document content.

The extension forwards captured design data over a loopback WebSocket to a local MCP server on the same machine. There is no project-operated cloud server or analytics endpoint in this source repository. The local MCP server passes requested design data to the MCP client chosen and configured by the user. A cloud-hosted AI MCP client may transmit that data to its own provider; consult its privacy practices.

Collection is off by default. Disable it in the extension popup to stop forwarding, close the bridge socket and prevent new connections. The MCP server keeps an in-memory cache until the process exits; captured data already supplied to another client cannot be revoked. The extension stores the enabled setting and local port using Chrome local storage.

We do not sell user data. Do not use the extension for designs you are not authorized to disclose. For support and removal requests contact the project maintainer via GitHub issues at https://github.com/liop/lanhu-mcp/issues.
