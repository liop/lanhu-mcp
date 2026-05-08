// MCP Server - tools and resources registration

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { info, error } from '../utils/logger.js';
import { cacheLanhuData } from './cache-lanhu-data.js';
import type { DataStore } from './data-store.js';
import type { WebSocketServer } from './websocket-server.js';

export function createMcpServer(dataStore: DataStore, wsServer: WebSocketServer): McpServer {
  const server = new McpServer({
    name: 'lanhu-mcp',
    version: '1.0.0'
  });

  // Register all tools
  registerTools(server, dataStore, wsServer);

  // Register resources
  registerResources(server, dataStore);

  info('MCP Server initialized with tools and resources');
  return server;
}

async function requestAndCache(
  dataStore: DataStore,
  wsServer: WebSocketServer,
  requestType: string,
  params: Record<string, unknown>,
  context: Record<string, unknown> = params
): Promise<unknown> {
  const data = await wsServer.requestData(requestType, params);
  cacheLanhuData(dataStore, requestType, data, context);
  return data;
}

function registerTools(server: McpServer, dataStore: DataStore, wsServer: WebSocketServer): void {
  // Ping tool - for testing connection
  server.tool(
    'lanhu_ping',
    'Test MCP server connection, returns connection status',
    {},
    async () => {
      const status = wsServer.getStatus();
      const stats = dataStore.getStats();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'ok',
            extensionConnected: status.connected > 0,
            wsListening: status.listening,
            wsPort: status.wsPort,
            clients: status.clients,
            cachedData: stats
          }, null, 2)
        }]
      };
    }
  );

  // Project tools
  server.tool(
    'lanhu_list_projects',
    '列出蓝湖项目列表，返回用户有权限访问的所有项目',
    {
      teamId: z.string().optional().describe('可选，按团队 ID 过滤项目')
    },
    async ({ teamId }) => {
      try {
        const cachedProjects = dataStore.listProjects();
        if (cachedProjects.length > 0) {
          const projects = teamId
            ? cachedProjects.filter(p => p.teamId === teamId)
            : cachedProjects;
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(projects, null, 2)
            }]
          };
        }

        // Request from extension
        const data = await requestAndCache(dataStore, wsServer, 'projects', { teamId });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data, null, 2)
          }]
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        error('lanhu_list_projects failed:', msg);
        return {
          content: [{
            type: 'text',
            text: `Error: ${msg}`
          }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'lanhu_get_project',
    '获取单个蓝湖项目的详细信息',
    {
      projectId: z.string().describe('项目 ID，可从 lanhu_list_projects 获取')
    },
    async ({ projectId }) => {
      try {
        const cached = dataStore.getProject(projectId);
        if (cached) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(cached, null, 2)
            }]
          };
        }

        const data = await requestAndCache(dataStore, wsServer, 'project', { projectId });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data, null, 2)
          }]
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        error('lanhu_get_project failed:', msg);
        return {
          content: [{
            type: 'text',
            text: `Error: ${msg}`
          }],
          isError: true
        };
      }
    }
  );

  // Screen tools
  server.tool(
    'lanhu_list_screens',
    '列出项目下的所有页面/原型图',
    {
      projectId: z.string().describe('项目 ID'),
      folderId: z.string().optional().describe('可选，文件夹 ID，用于过滤特定文件夹下的页面')
    },
    async ({ projectId, folderId }) => {
      try {
        const cachedScreens = dataStore.listScreens(projectId);
        if (cachedScreens.length > 0) {
          const screens = folderId
            ? cachedScreens.filter(s => s.folderId === folderId)
            : cachedScreens;
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(screens, null, 2)
            }]
          };
        }

        const data = await requestAndCache(dataStore, wsServer, 'screens', { projectId, folderId }, { projectId });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data, null, 2)
          }]
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        error('lanhu_list_screens failed:', msg);
        return {
          content: [{
            type: 'text',
            text: `Error: ${msg}`
          }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'lanhu_get_screen',
    '获取单个页面的详细信息，包含名称、尺寸、创建时间等',
    {
      screenId: z.string().describe('页面 ID，可从 lanhu_list_screens 获取')
    },
    async ({ screenId }) => {
      try {
        const cached = dataStore.getScreen(screenId);
        if (cached) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(cached, null, 2)
            }]
          };
        }

        const data = await requestAndCache(dataStore, wsServer, 'screen', { screenId });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data, null, 2)
          }]
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        error('lanhu_get_screen failed:', msg);
        return {
          content: [{
            type: 'text',
            text: `Error: ${msg}`
          }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'lanhu_get_screen_image',
    '获取页面的原型图/截图 URL',
    {
      screenId: z.string().describe('页面 ID'),
      scale: z.number().optional().default(1).describe('缩放比例，默认为 1')
    },
    async ({ screenId, scale }) => {
      try {
        const data = await wsServer.requestData('screen_image', { screenId, scale });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data, null, 2)
          }]
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        error('lanhu_get_screen_image failed:', msg);
        return {
          content: [{
            type: 'text',
            text: `Error: ${msg}`
          }],
          isError: true
        };
      }
    }
  );

  // Layer/Design tools
  server.tool(
    'lanhu_get_screen_layers',
    '获取页面的图层树结构，包含所有图层的层级关系',
    {
      screenId: z.string().describe('页面 ID')
    },
    async ({ screenId }) => {
      try {
        const cachedLayers = dataStore.getLayers(screenId);
        if (cachedLayers.length > 0) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(buildLayerTree(cachedLayers), null, 2)
            }]
          };
        }

        const data = await requestAndCache(dataStore, wsServer, 'layers', { screenId }, { screenId });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data, null, 2)
          }]
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        error('lanhu_get_screen_layers failed:', msg);
        return {
          content: [{
            type: 'text',
            text: `Error: ${msg}`
          }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'lanhu_get_layer_detail',
    '获取单个图层的详细信息，包含尺寸、位置、样式等',
    {
      screenId: z.string().describe('页面 ID'),
      layerId: z.string().describe('图层 ID')
    },
    async ({ screenId, layerId }) => {
      try {
        const cached = dataStore.getLayer(screenId, layerId);
        if (cached) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(cached, null, 2)
            }]
          };
        }

        const data = await wsServer.requestData('layer', { screenId, layerId });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data, null, 2)
          }]
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        error('lanhu_get_layer_detail failed:', msg);
        return {
          content: [{
            type: 'text',
            text: `Error: ${msg}`
          }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'lanhu_get_colors',
    '提取页面中使用的所有颜色',
    {
      screenId: z.string().describe('页面 ID')
    },
    async ({ screenId }) => {
      try {
        const cached = dataStore.getColors(screenId);
        if (cached && cached.length > 0) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(cached, null, 2)
            }]
          };
        }

        const data = await requestAndCache(dataStore, wsServer, 'colors', { screenId }, { screenId });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data, null, 2)
          }]
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        error('lanhu_get_colors failed:', msg);
        return {
          content: [{
            type: 'text',
            text: `Error: ${msg}`
          }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'lanhu_get_fonts',
    '提取页面中使用的所有字体',
    {
      screenId: z.string().describe('页面 ID')
    },
    async ({ screenId }) => {
      try {
        const cached = dataStore.getFonts(screenId);
        if (cached && cached.length > 0) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(cached, null, 2)
            }]
          };
        }

        const data = await requestAndCache(dataStore, wsServer, 'fonts', { screenId }, { screenId });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data, null, 2)
          }]
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        error('lanhu_get_fonts failed:', msg);
        return {
          content: [{
            type: 'text',
            text: `Error: ${msg}`
          }],
          isError: true
        };
      }
    }
  );

  // Asset tools
  server.tool(
    'lanhu_list_assets',
    '列出页面可导出的资源（切图）',
    {
      screenId: z.string().describe('页面 ID')
    },
    async ({ screenId }) => {
      try {
        const cachedAssets = dataStore.listAssets(screenId);
        if (cachedAssets.length > 0) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(cachedAssets, null, 2)
            }]
          };
        }

        const data = await requestAndCache(dataStore, wsServer, 'assets', { screenId }, { screenId });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data, null, 2)
          }]
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        error('lanhu_list_assets failed:', msg);
        return {
          content: [{
            type: 'text',
            text: `Error: ${msg}`
          }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'lanhu_export_asset',
    '导出单个资源（切图），返回 base64 数据',
    {
      screenId: z.string().describe('页面 ID'),
      assetId: z.string().describe('资源 ID'),
      format: z.enum(['png', 'svg', 'webp', 'jpg']).optional().default('png').describe('导出格式')
    },
    async ({ screenId, assetId, format }) => {
      try {
        const data = await wsServer.requestData('asset', { screenId, assetId, format });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data, null, 2)
          }]
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        error('lanhu_export_asset failed:', msg);
        return {
          content: [{
            type: 'text',
            text: `Error: ${msg}`
          }],
          isError: true
        };
      }
    }
  );

  // Prototype tools
  server.tool(
    'lanhu_get_screen_links',
    '获取页面的交互原型链接',
    {
      screenId: z.string().describe('页面 ID')
    },
    async ({ screenId }) => {
      try {
        const cached = dataStore.getPrototypeLinks(screenId);
        if (cached && cached.length > 0) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(cached, null, 2)
            }]
          };
        }

        const data = await requestAndCache(dataStore, wsServer, 'prototype_links', { screenId }, { screenId });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data, null, 2)
          }]
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        error('lanhu_get_screen_links failed:', msg);
        return {
          content: [{
            type: 'text',
            text: `Error: ${msg}`
          }],
          isError: true
        };
      }
    }
  );

  // Comment tools
  server.tool(
    'lanhu_get_screen_comments',
    '获取页面的评论列表',
    {
      screenId: z.string().describe('页面 ID')
    },
    async ({ screenId }) => {
      try {
        const cached = dataStore.getComments(screenId);
        if (cached && cached.length > 0) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(cached, null, 2)
            }]
          };
        }

        const data = await requestAndCache(dataStore, wsServer, 'comments', { screenId }, { screenId });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data, null, 2)
          }]
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        error('lanhu_get_screen_comments failed:', msg);
        return {
          content: [{
            type: 'text',
            text: `Error: ${msg}`
          }],
          isError: true
        };
      }
    }
  );

  info('Registered 15 MCP tools');

  // Project tree tool
  server.tool(
    'lanhu_get_project_tree',
    '获取项目的文件夹和页面树结构，包含项目内所有文件夹及其包含的页面',
    {
      projectId: z.string().describe('项目 ID')
    },
    async ({ projectId }) => {
      try {
        const cached = dataStore.getProjectTree(projectId);
        if (cached) {
          return { content: [{ type: 'text', text: JSON.stringify(cached, null, 2) }] };
        }
        const resp = await requestAndCache(dataStore, wsServer, 'project_tree', { projectId }, { projectId });
        return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        error('lanhu_get_project_tree failed:', msg);
        return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
      }
    }
  );

  // Layer styles tool
  server.tool(
    'lanhu_get_layer_styles',
    '获取图层的详细 CSS 样式，包含背景、边框、阴影、字体、内边距等',
    {
      screenId: z.string().describe('页面 ID'),
      layerId: z.string().describe('图层 ID')
    },
    async ({ screenId, layerId }) => {
      try {
        const cached = dataStore.getLayerStyles(screenId, layerId);
        if (cached) {
          return { content: [{ type: 'text', text: JSON.stringify(cached, null, 2) }] };
        }
        const resp = await requestAndCache(dataStore, wsServer, 'layer_styles', { screenId, layerId }, { screenId });
        return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        error('lanhu_get_layer_styles failed:', msg);
        return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
      }
    }
  );

  // Prototype flow tool
  server.tool(
    'lanhu_get_prototype_flow',
    '获取项目的交互原型流程，包含所有页面的跳转关系和交互路径',
    {
      projectId: z.string().describe('项目 ID')
    },
    async ({ projectId }) => {
      try {
        const cached = dataStore.getPrototypeFlow(projectId);
        if (cached) {
          return { content: [{ type: 'text', text: JSON.stringify(cached, null, 2) }] };
        }
        const resp = await requestAndCache(dataStore, wsServer, 'prototype_flow', { projectId }, { projectId });
        return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        error('lanhu_get_prototype_flow failed:', msg);
        return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
      }
    }
  );

  info('Registered 3 additional MCP tools (total: 18)');
}

function registerResources(server: McpServer, dataStore: DataStore): void {
  // Projects list resource
  server.resource(
    'lanhu_projects',
    'lanhu://projects',
    async (uri) => {
      const projects = dataStore.listProjects();
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(projects, null, 2)
        }]
      };
    }
  );

  // Project detail resource template
  server.resource(
    'lanhu_project',
    new ResourceTemplate('lanhu://project/{projectId}', { list: undefined }),
    async (uri, args) => {
      const projectId = (args as Record<string, unknown>).projectId as string | undefined;
      const project = dataStore.getProject(projectId || '');
      if (!project) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ error: 'Project not found' })
          }]
        };
      }
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(project, null, 2)
        }]
      };
    }
  );

  // Screens list resource template
  server.resource(
    'lanhu_screens',
    new ResourceTemplate('lanhu://project/{projectId}/screens', { list: undefined }),
    async (uri, args) => {
      const projectId = (args as Record<string, unknown>).projectId as string | undefined;
      const screens = dataStore.listScreens(projectId || '');
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(screens, null, 2)
        }]
      };
    }
  );

  info('Registered MCP resources');
}

// Helper to build layer tree from flat list
export function buildLayerTree(layers: { id: string; parentId?: string; children?: unknown[] }[]): unknown[] {
  const layerMap = new Map<string, Record<string, unknown>>();
  const rootLayers: unknown[] = [];

  for (const layer of layers) {
    const node = { ...(layer as Record<string, unknown>) };
    if (Array.isArray(layer.children)) {
      node.children = layer.children.map(child => child && typeof child === 'object' ? { ...(child as Record<string, unknown>) } : child);
    } else {
      delete node.children;
    }
    layerMap.set(layer.id, node);
  }

  for (const layer of layers) {
    const node = layerMap.get(layer.id);
    if (!node) {
      continue;
    }

    if (layer.parentId) {
      const parent = layerMap.get(layer.parentId);
      if (parent) {
        if (!Array.isArray(parent.children)) {
          parent.children = [];
        }
        const alreadyLinked = (parent.children as unknown[]).some(child =>
          child && typeof child === 'object' && (child as Record<string, unknown>).id === node.id
        );
        if (!alreadyLinked) {
          (parent.children as unknown[]).push(node);
        }
      }
    } else {
      rootLayers.push(node);
    }
  }

  return rootLayers;
}
