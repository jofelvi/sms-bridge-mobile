import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

/**
 * Canal push hacia el telefono.
 *
 * El telefono mantiene un WebSocket abierto (ya corre un foreground service
 * 24/7, asi que sostener el socket no cuesta nada extra) y el servidor le
 * avisa en cuanto entra un mensaje. El polling del telefono queda como red de
 * seguridad a intervalo largo: si el socket se cae, nada se pierde.
 *
 * Se eligio WebSocket sobre FCM porque no obliga a quien adopte el proyecto a
 * crear un proyecto Firebase ni a recompilar el APK.
 */
export class DeviceHub {
  private readonly clients = new Set<WebSocket>();
  private wss: WebSocketServer | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  /**
   * Monta el WebSocket en /ws/device. La autenticacion se hace en el handshake:
   * un socket sin token valido se rechaza antes de establecerse.
   */
  attach(server: Server, deviceToken: string): void {
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url ?? '', 'http://localhost');
      if (url.pathname !== '/ws/device') {
        socket.destroy();
        return;
      }

      // El token puede venir por cabecera o por query: los clientes WebSocket
      // de Android no siempre permiten cabeceras personalizadas.
      const header = request.headers['authorization'] ?? '';
      const fromHeader = String(header).startsWith('Bearer ')
        ? String(header).slice(7)
        : '';
      const token = fromHeader || url.searchParams.get('token') || '';

      if (token !== deviceToken) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      this.wss!.handleUpgrade(request, socket, head, (ws) => {
        this.register(ws);
      });
    });

    // Ping periodico: detecta sockets muertos que quedaron "abiertos" porque
    // la red movil se corto sin cerrar limpiamente.
    this.heartbeatTimer = setInterval(() => {
      for (const client of this.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.ping();
        }
      }
    }, 30_000);
  }

  private register(ws: WebSocket): void {
    this.clients.add(ws);
    ws.on('close', () => this.clients.delete(ws));
    ws.on('error', () => this.clients.delete(ws));
    ws.send(JSON.stringify({ type: 'connected' }));
  }

  /** Avisa a los telefonos conectados que hay trabajo. Devuelve a cuantos. */
  notifyNewMessage(): number {
    const payload = JSON.stringify({ type: 'new-message' });
    let notified = 0;

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
        notified++;
      }
    }
    return notified;
  }

  get connectedCount(): number {
    let open = 0;
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) open++;
    }
    return open;
  }

  close(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const client of this.clients) client.close();
    this.clients.clear();
    this.wss?.close();
  }
}
