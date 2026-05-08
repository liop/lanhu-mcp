[@LinuxDo](https://linux.do/u/grandy/summary)

# Lanhu MCP Server

让 Codex、Claude Code、OpenCode 等 AI 编程工具 / MCP 客户端通过 Chrome 插件读取蓝湖项目、设计稿和 Axure 导入原型的 MCP Server。

## 架构

```text
Chrome Extension ──WebSocket──▶ MCP Server ──stdio──▶ MCP Client
     │                              │
     │                              │
蓝湖页面 / Axure HTML 提取       暴露 MCP Tools / Resources
```

MCP Server 通过 stdio 与 MCP 客户端通信；Chrome 插件通过本机 WebSocket 连接 MCP Server，复用浏览器里的蓝湖登录态读取页面数据。

## 功能

- **项目工具**: 列出项目、获取项目详情、获取项目文件夹树
- **页面工具**: 列出页面、获取页面详情、获取页面截图
- **设计标注**: 获取图层结构、图层详情、CSS 样式、颜色、字体
- **Axure 原型**: 支持 `axure-file.lanhuapp.com` 页面和蓝湖内嵌 Axure iframe 的 DOM 图层解析
- **资源导出**: 列出切图、导出切图
- **交互原型**: 获取页面链接和项目原型流程
- **评论**: 获取页面评论

## 安装

### 1. 安装依赖并构建

```bash
cd /Users/mac/project/lanhu-mcp
npm install
npm run build
npm run build:extension
```

### 2. 打包为本地 npx 包

```bash
npm pack --pack-destination /Users/mac/project/lanhu-mcp
```

生成的包路径为：

```text
/Users/mac/project/lanhu-mcp/lanhu-mcp-1.0.0.tgz
```

### 3. 加载 Chrome 插件

1. 打开 Chrome，访问 `chrome://extensions/`
2. 启用“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择 `/Users/mac/project/lanhu-mcp/extension-dist`
5. 后续每次执行 `npm run build:extension` 后，需要在扩展详情页点击“重新加载”

插件会请求访问 `lanhuapp.com`、`lanhu.com` 和 `axure-file.lanhuapp.com`，用于读取蓝湖页面和 Axure 原型 iframe。

## 配置 MCP 客户端

### Codex Desktop

编辑 `~/.codex/config.toml`：

```toml
[mcp_servers.lanhu]
type = "stdio"
command = "npx"
args = ["-y", "--package", "/Users/mac/project/lanhu-mcp/lanhu-mcp-1.0.0.tgz", "lanhu-mcp"]
enabled = true
```

注意不要写成下面这种形式：

```toml
args = ["-y", "/Users/mac/project/lanhu-mcp/lanhu-mcp-1.0.0.tgz"]
```

`npx -y /path/to/package.tgz` 会尝试直接执行 tgz 文件，常见结果是 `Permission denied`。正确写法是用 `--package` 安装 tarball，再执行包里的 `lanhu-mcp` bin。

改完配置后重启 Codex Desktop。MCP 进程会由 Codex 自动拉起，不需要手动常驻运行 `npm start`。

### Claude Code / Claude Desktop

也可以直接用构建后的 Node 入口：

```json
{
  "mcpServers": {
    "lanhu": {
      "command": "node",
      "args": ["/Users/mac/project/lanhu-mcp/dist/index.js"],
      "env": {
        "LANHU_WS_PORT": "3100"
      }
    }
  }
}
```

如果希望和 Codex 一样用本地 tgz：

```json
{
  "mcpServers": {
    "lanhu": {
      "command": "npx",
      "args": [
        "-y",
        "--package",
        "/Users/mac/project/lanhu-mcp/lanhu-mcp-1.0.0.tgz",
        "lanhu-mcp"
      ]
    }
  }
}
```

## 使用

1. 重启 MCP 客户端，让它自动拉起 MCP Server
2. 在 Chrome 中登录蓝湖
3. 打开蓝湖项目、设计稿页面，或打开蓝湖内嵌 / 独立 Axure 原型页
4. 点击 Chrome 插件图标确认连接状态
5. 在 MCP 客户端中调用 `lanhu_ping`，确认 `extensionConnected: true`
6. 调用 `lanhu_get_screen_layers` 等工具读取页面结构

`lanhu_ping` 返回示例：

```json
{
  "status": "ok",
  "extensionConnected": true,
  "wsListening": true,
  "wsPort": 3100,
  "clients": [
    {
      "extensionVersion": "1.0.1"
    }
  ]
}
```

如果当前页面是 Axure 导入的 HTML 原型，图层结果里会带有：

```json
{
  "source": "axure-html"
}
```

这表示数据来自 Axure DOM 解析，而不是蓝湖原生设计标注 API。

## MCP 工具列表

| 工具名 | 描述 |
|--------|------|
| `lanhu_ping` | 测试 MCP Server 和 Chrome 插件连接状态 |
| `lanhu_list_projects` | 列出蓝湖项目 |
| `lanhu_get_project` | 获取单个项目详情 |
| `lanhu_get_project_tree` | 获取项目文件夹和页面树 |
| `lanhu_list_screens` | 列出项目下的页面 / 原型图 |
| `lanhu_get_screen` | 获取页面详情 |
| `lanhu_get_screen_image` | 获取页面截图 URL |
| `lanhu_get_screen_layers` | 获取页面图层树 |
| `lanhu_get_layer_detail` | 获取单个图层详情 |
| `lanhu_get_layer_styles` | 获取图层 CSS 样式 |
| `lanhu_get_colors` | 提取页面颜色 |
| `lanhu_get_fonts` | 提取页面字体 |
| `lanhu_list_assets` | 列出页面可导出资源 |
| `lanhu_export_asset` | 导出单个资源 |
| `lanhu_get_screen_links` | 获取页面交互原型链接 |
| `lanhu_get_prototype_flow` | 获取项目交互原型流程 |
| `lanhu_get_screen_comments` | 获取页面评论 |

## MCP Resources

- `lanhu://projects` - 项目列表
- `lanhu://project/{projectId}` - 项目详情
- `lanhu://project/{projectId}/screens` - 页面列表

## 端口和环境变量

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `LANHU_WS_PORT` | `3100` | Chrome 插件连接 MCP Server 的 WebSocket 端口 |
| `LANHU_HTTP_PORT` | `3200` | 预留配置，当前 MCP 传输使用 stdio |
| `LANHU_LOG_LEVEL` | `info` | 日志级别：`debug` / `info` / `warn` / `error` |

如需修改 WebSocket 端口，需要同时修改：

1. MCP Server 环境变量 `LANHU_WS_PORT`
2. Chrome 插件弹窗里的端口设置

MCP Server 启动时如果发现端口被占用，会每秒自动重试。端口释放后会自动恢复监听。

## 故障排查

### 插件报 `ERR_CONNECTION_REFUSED`

常见原因是 MCP Server 没有运行、没有监听 3100，或插件端口和服务端端口不一致。

先在 MCP 客户端调用：

```text
lanhu_ping
```

检查：

- `wsListening: true` 表示 MCP Server 已经监听 WebSocket 端口
- `extensionConnected: true` 表示 Chrome 插件已经连上 MCP Server
- `wsPort` 应与插件弹窗中的端口一致

也可以在终端检查端口：

```bash
lsof -nP -iTCP:3100 -sTCP:LISTEN
```

### Codex 没有自动拉起 MCP

确认 `~/.codex/config.toml` 使用的是 `--package` 写法：

```toml
command = "npx"
args = ["-y", "--package", "/Users/mac/project/lanhu-mcp/lanhu-mcp-1.0.0.tgz", "lanhu-mcp"]
```

更新 tgz 或配置后需要重启 Codex Desktop。

### 插件显示已连接，但工具拿不到页面数据

1. 确认 Chrome 当前标签页是蓝湖项目页、设计稿页或 Axure 原型页
2. 刷新当前蓝湖页面，让 content script 重新注入
3. 在 `chrome://extensions/` 中重新加载 `Lanhu MCP Bridge`
4. 对 Axure 原型，确认页面域名是 `axure-file.lanhuapp.com` 或蓝湖页面里包含该 iframe

## 开发

```bash
# 监听模式编译 MCP Server
npm run dev

# 构建 Chrome 插件
npm run build:extension

# 运行回归测试
npm run test:unit

# 验证 npm 包入口
npm run test:package

# 清理构建产物
npm run clean
```

## 注意事项

- Chrome 插件复用浏览器中的蓝湖登录态，请确保 Chrome 已登录蓝湖
- 插件不能自己启动本地 MCP Server；MCP Server 由 MCP 客户端通过 stdio 启动
- 更新 `extension-dist` 后必须在 Chrome 扩展页重新加载插件
- 蓝湖和 Axure 页面结构可能变化，DOM 解析策略需要随页面结构调整

## License

MIT
