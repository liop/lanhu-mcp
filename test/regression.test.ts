import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer, type Server as NetServer } from 'node:net';
import { join } from 'node:path';
import { createMcpServer, buildLayerTree } from '../src/server/mcp-server.js';
import { WebSocketServer } from '../src/server/websocket-server.js';
import { DataStore } from '../src/server/data-store.js';
import { cacheLanhuData } from '../src/server/cache-lanhu-data.js';
import { addCurrentContext, getPayloadContext, mergeLanhuContext, normalizeWsPort, pickDataResponse } from '../src/extension/background/background-helpers.js';
import { extractLanhuPageNames, findRecordById, getUrlObserverTarget, toRecordArray } from '../src/extension/content/content-helpers.js';
import { extractAxureLayers } from '../src/extension/content/axure-parser.js';
import { extractLanhuContextFromUrl } from '../src/extension/shared/url-context.js';

test('registers project resources as URI templates', () => {
  const server = createMcpServer({} as never, {} as never);
  const registeredResources = (server as unknown as { _registeredResources: Record<string, unknown> })._registeredResources;
  const registeredTemplates = (server as unknown as { _registeredResourceTemplates: Record<string, unknown> })._registeredResourceTemplates;

  assert.equal(registeredResources['lanhu://project/{projectId}'], undefined);
  assert.equal(registeredResources['lanhu://project/{projectId}/screens'], undefined);
  assert.ok(registeredTemplates.lanhu_project);
  assert.ok(registeredTemplates.lanhu_screens);
});

test('buildLayerTree does not mutate cached layer objects', () => {
  const layers = [
    { id: 'root', name: 'Root' },
    { id: 'child', name: 'Child', parentId: 'root' }
  ];

  const first = buildLayerTree(layers);
  const second = buildLayerTree(layers);

  assert.equal((layers[0] as { children?: unknown[] }).children, undefined);
  assert.deepEqual(first, [{
    id: 'root',
    name: 'Root',
    children: [{ id: 'child', name: 'Child', parentId: 'root' }]
  }]);
  assert.deepEqual(second, first);
});

test('adds current Lanhu context without overwriting explicit context', () => {
  const payload = addCurrentContext(
    { dataType: 'layers', action: 'cache', data: [], context: { screenId: 'explicit-screen' } },
    'project-1',
    'screen-1'
  );

  assert.deepEqual(payload.context, {
    projectId: 'project-1',
    screenId: 'explicit-screen'
  });
});

test('normalizes stored WebSocket ports', () => {
  assert.equal(normalizeWsPort('3201'), 3201);
  assert.equal(normalizeWsPort('0'), 3100);
  assert.equal(normalizeWsPort('not-a-port'), 3100);
});

test('reports context changes only when Lanhu identifiers change', () => {
  assert.deepEqual(
    mergeLanhuContext(
      { currentProjectId: 'project-1', currentScreenId: 'screen-1' },
      { projectId: 'project-1' }
    ),
    { currentProjectId: 'project-1', currentScreenId: 'screen-1', changed: false }
  );

  assert.deepEqual(
    mergeLanhuContext(
      { currentProjectId: 'project-1', currentScreenId: 'screen-1' },
      { screenId: 'screen-2' }
    ),
    { currentProjectId: 'project-1', currentScreenId: 'screen-2', changed: true }
  );
});

test('extracts Lanhu context from pushed data payloads', () => {
  assert.deepEqual(
    getPayloadContext({
      dataType: 'screens',
      data: [],
      context: { projectId: 'project-1', screenId: 'screen-1' }
    }),
    { projectId: 'project-1', screenId: 'screen-1' }
  );

  assert.deepEqual(
    getPayloadContext({
      dataType: 'context',
      data: { projectId: 'project-2' }
    }),
    { projectId: 'project-2' }
  );
});

test('injects the API interceptor without inline scripts', () => {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), 'src/extension/manifest.json'), 'utf8')) as {
    permissions?: string[];
    host_permissions?: string[];
    content_scripts?: Array<{ matches?: string[]; all_frames?: boolean }>;
  };
  const contentSource = readFileSync(join(process.cwd(), 'src/extension/content/content.ts'), 'utf8');

  assert.ok(manifest.permissions?.includes('scripting'));
  assert.ok(manifest.permissions?.includes('webNavigation'));
  assert.ok(manifest.host_permissions?.includes('https://axure-file.lanhuapp.com/*'));
  assert.ok(manifest.content_scripts?.some(script => script.all_frames && script.matches?.includes('https://axure-file.lanhuapp.com/*')));
  assert.match(contentSource, /INJECT_INTERCEPTOR/);
  assert.doesNotMatch(contentSource, /interceptorScript\.textContent/);
});

test('extracts layers from Axure generated DOM elements', () => {
  const title = fakeAxureElement({
    id: 'u1',
    className: 'ax_default heading_1',
    text: '工单基本信息',
    style: { left: '120px', top: '48px', width: '180px', height: '32px', fontSize: '20px', color: 'rgb(51, 51, 51)' }
  });
  const button = fakeAxureElement({
    id: 'u2',
    className: 'ax_default primary_button',
    text: '提交',
    style: { left: '320px', top: '420px', width: '96px', height: '40px', backgroundColor: 'rgb(22, 119, 255)' }
  });
  const duplicateTextNode = fakeAxureElement({
    id: 'u2_text',
    className: 'text',
    text: '提交',
    style: { left: '0px', top: '0px', width: '96px', height: '40px' }
  });
  const doc = fakeAxureDocument([title, button, duplicateTextNode]);

  assert.deepEqual(extractAxureLayers(doc, { screenId: 'screen-1' }), [
    {
      id: 'u1',
      name: '工单基本信息',
      screenId: 'screen-1',
      type: 'text',
      x: 120,
      y: 48,
      width: 180,
      height: 32,
      visible: true,
      textContent: '工单基本信息',
      source: 'axure-html',
      styles: {
        color: 'rgb(51, 51, 51)',
        fontSize: 20
      }
    },
    {
      id: 'u2',
      name: '提交',
      screenId: 'screen-1',
      type: 'component',
      x: 320,
      y: 420,
      width: 96,
      height: 40,
      visible: true,
      textContent: '提交',
      source: 'axure-html',
      styles: {
        backgroundColor: 'rgb(22, 119, 255)'
      }
    }
  ]);
});

test('prefers non-empty Axure frame responses over empty top-frame data', () => {
  const emptyTopFrame: unknown[] = [];
  const axureLayers = [{ id: 'u1', name: '标题', source: 'axure-html' }];

  assert.deepEqual(pickDataResponse('layers', emptyTopFrame, axureLayers), axureLayers);
  assert.deepEqual(pickDataResponse('comments', [], []), []);
});

test('finds records in array and single-object API cache values', () => {
  assert.deepEqual(findRecordById([{ id: 'a' }, { projectId: 'b' }], 'b'), { projectId: 'b' });
  assert.deepEqual(findRecordById({ id: 'project-1', name: 'One' }, 'project-1'), { id: 'project-1', name: 'One' });
  assert.equal(findRecordById({ id: 'project-1' }, 'project-2'), undefined);
});

test('normalizes cached API values to record arrays', () => {
  assert.deepEqual(toRecordArray([{ id: 'a' }]), [{ id: 'a' }]);
  assert.deepEqual(toRecordArray({ id: 'a' }), [{ id: 'a' }]);
  assert.deepEqual(toRecordArray(null), []);
  assert.deepEqual(toRecordArray('not records'), []);
});

test('selects a safe URL observer target at document_start', () => {
  assert.equal(getUrlObserverTarget({ body: null, documentElement: 'html' }), 'html');
  assert.equal(getUrlObserverTarget({ body: 'body', documentElement: 'html' }), 'body');
  assert.equal(getUrlObserverTarget({ body: null, documentElement: null }), null);
});

test('extracts visible Axure page names without toolbar noise', () => {
  const text = `
页面
搜索
蓝芯格业务.rp
新流程
角色功能定义
施工流程-业务部门输出
蓝芯格总公司
登录页
框架
工单详情-已接单
选择文件: 未选择任何文件
该页文档还没有评论 按 N 快速创建
`;

  assert.deepEqual(extractLanhuPageNames(text), [
    '新流程',
    '角色功能定义',
    '施工流程-业务部门输出',
    '蓝芯格总公司',
    '登录页',
    '框架',
    '工单详情-已接单'
  ]);
});

test('caches tool response data with request context', () => {
  const dataStore = new DataStore();

  cacheLanhuData(dataStore, 'projects', [{ id: 'project-1', name: 'One' }], {});
  cacheLanhuData(dataStore, 'screens', [{ id: 'screen-1', name: 'Home', width: 0, height: 0 }], { projectId: 'project-1' });
  cacheLanhuData(dataStore, 'comments', [], { screenId: 'screen-1' });

  assert.equal(dataStore.getProject('project-1')?.name, 'One');
  assert.deepEqual(dataStore.listScreens('project-1').map(screen => screen.id), ['screen-1']);
  assert.deepEqual(dataStore.getComments('screen-1'), []);
});

test('accepts heartbeat PONG messages from the extension', () => {
  const wsServer = new WebSocketServer({ wsPort: 0, httpPort: 0, logLevel: 'error' });
  const client = {
    ws: { readyState: 1, send: () => {} },
    lastPing: 0
  };

  try {
    (wsServer as unknown as {
      handleMessage: (clientId: string, client: { ws: { readyState: number; send: () => void }; lastPing: number }, message: { id: string; type: string; payload: unknown; timestamp: number }) => void;
    }).handleMessage('client-1', client, {
      id: 'pong-1',
      type: 'PONG',
      payload: { timestamp: Date.now() },
      timestamp: Date.now()
    });

    assert.ok(client.lastPing > 0);
  } finally {
    wsServer.close();
  }
});

test('retries WebSocket listen after the configured port is released', async () => {
  const blocker = await listenOnRandomPort();
  const address = blocker.address();
  assert.ok(address && typeof address === 'object');

  const wsServer = new WebSocketServer({ wsPort: address.port, httpPort: 0, logLevel: 'error' });

  try {
    await sleep(100);
    assert.equal(wsServer.getStatus().listening, false);

    await closeServer(blocker);
    await waitFor(() => wsServer.getStatus().listening, 3000);

    assert.equal(wsServer.getStatus().wsPort, address.port);
  } finally {
    wsServer.close();
    if (blocker.listening) {
      await closeServer(blocker);
    }
  }
});

test('extracts Lanhu context from hash-route URLs', () => {
  const context = extractLanhuContextFromUrl('https://lanhuapp.com/web/#/item/project/product?tid=f9342fff-216e-4484-974c-4347beeabc67&pid=3f629272-07b0-45a9-8eba-7dc756fec107&pageId=87959432768d4dcfa25dc10122f31d6a&docId=446df5c7-7084-4852-ac18-d95c179ef6b9');

  assert.deepEqual(context, {
    projectId: '3f629272-07b0-45a9-8eba-7dc756fec107',
    screenId: '87959432768d4dcfa25dc10122f31d6a'
  });
});

test('extracts Lanhu project context from Axure file URLs', () => {
  assert.deepEqual(
    extractLanhuContextFromUrl('https://axure-file.lanhuapp.com/3f629272-07b0-45a9-8eba-7dc756fec107_md5__bd427e14ba435931ce9e664dc360a4aa.html?___v='),
    { projectId: '3f629272-07b0-45a9-8eba-7dc756fec107' }
  );
});

test('does not treat API route words as project identifiers', () => {
  assert.deepEqual(extractLanhuContextFromUrl('https://lanhuapp.com/api/project/comment/list'), {});
  assert.deepEqual(extractLanhuContextFromUrl('https://lanhuapp.com/api/project/permission'), {});
});

test('does not treat document identifiers as screen identifiers', () => {
  assert.deepEqual(
    extractLanhuContextFromUrl('https://lanhuapp.com/web/#/item/project/product?pid=proj-1&docId=doc-1&image_id=image-1'),
    { projectId: 'proj-1' }
  );
});

function fakeAxureDocument(elements: unknown[]): Document {
  return {
    title: 'Axure Test',
    querySelectorAll: () => elements,
    querySelector: () => null
  } as unknown as Document;
}

function fakeAxureElement(input: {
  id: string;
  className: string;
  text: string;
  style: Record<string, string>;
  attrs?: Record<string, string>;
}): Element {
  return {
    id: input.id,
    className: input.className,
    textContent: input.text,
    tagName: 'DIV',
    parentElement: null,
    style: input.style,
    getAttribute: (name: string) => input.attrs?.[name] ?? null,
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({})
    })
  } as unknown as Element;
}

function listenOnRandomPort(): Promise<NetServer> {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

function closeServer(server: NetServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => err ? reject(err) : resolve());
  });
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await sleep(50);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test('Chrome extension permissions are restricted to required hosts and capabilities', () => {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), 'src/extension/manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.permissions.includes('webRequest'), false);
  assert.equal(manifest.host_permissions.some((host: string) => host === '<all_urls>'), false);
});

test('WebSocket listener is restricted to IPv4 loopback', () => {
  const source = readFileSync(join(process.cwd(), 'src/server/websocket-server.ts'), 'utf8');
  assert.ok(source.includes("host: '127.0.0.1'"));
  assert.match(source, /maxPayload:/);
});
