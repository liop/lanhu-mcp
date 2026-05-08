// Integration test - verify MCP Server + WebSocket communication flow

import WebSocket from 'ws';

const WS_PORT = 3100;

async function testWebSocketHandshake(): Promise<void> {
  console.log('Test 1: WebSocket handshake...');

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${WS_PORT}`);

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Handshake timeout'));
    }, 5000);

    ws.on('open', () => {
      console.log('  Connected to WebSocket server');
      ws.send(JSON.stringify({
        id: 'test-1',
        type: 'HANDSHAKE',
        payload: { extensionVersion: '1.0.0' },
        timestamp: Date.now()
      }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'HANDSHAKE_ACK') {
          console.log('  Handshake ACK received:', JSON.stringify(msg.payload));
          clearTimeout(timeout);
          ws.close();
          resolve();
        }
      } catch {
        // Ignore non-JSON messages from MCP stdio
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket error: ${err.message}`));
    });
  });
}

async function testDataUpdate(): Promise<void> {
  console.log('Test 2: Data update push...');

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${WS_PORT}`);

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Data update timeout'));
    }, 5000);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        id: 'test-2',
        type: 'HANDSHAKE',
        payload: { extensionVersion: '1.0.0' },
        timestamp: Date.now()
      }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'HANDSHAKE_ACK') {
          // Push project data
          ws.send(JSON.stringify({
            id: 'test-2-data',
            type: 'DATA_UPDATE',
            payload: {
              dataType: 'projects',
              action: 'cache',
              data: [
                { id: 'proj-1', name: 'Test Project', teamId: 'team-1' },
                { id: 'proj-2', name: 'Another Project', teamId: 'team-1' }
              ]
            },
            timestamp: Date.now()
          }));

          console.log('  Project data pushed');
          clearTimeout(timeout);
          ws.close();
          resolve();
        }
      } catch {
        // Ignore
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket error: ${err.message}`));
    });
  });
}

async function main(): Promise<void> {
  console.log('=== Lanhu MCP Integration Tests ===\n');

  await testWebSocketHandshake();
  console.log('  PASS\n');

  await testDataUpdate();
  console.log('  PASS\n');

  console.log('All tests passed!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Test failed:', err.message);
  process.exit(1);
});