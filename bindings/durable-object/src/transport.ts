import { existsSync, unlinkSync } from "node:fs";
import {
  createConnection,
  createServer,
  type Server,
  type Socket,
} from "node:net";

export interface UdsServer {
  close(): Promise<void>;
  address(): string | null;
}

export interface UdsSocket {
  write(data: Uint8Array): void;
  end(): void;
  on(event: "data", listener: (data: Uint8Array) => void): void;
  on(event: "close", listener: () => void): void;
  on(event: "error", listener: (error: Error) => void): void;
}

type ConnectionHandler = (socket: UdsSocket) => void;

export async function createUdsServer(
  socketPath: string,
  handler: ConnectionHandler,
): Promise<UdsServer> {
  removeSocket(socketPath);

  const server = createServer((socket) => {
    handler(new NodeSocket(socket));
  });

  await listen(server, socketPath);

  return {
    close: () => close(server),
    address: () => socketPath,
  };
}

export async function connectUds(socketPath: string): Promise<UdsSocket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    const wrapper = new NodeSocket(socket);

    socket.once("connect", () => resolve(wrapper));
    socket.once("error", reject);
  });
}

class NodeSocket implements UdsSocket {
  constructor(private readonly socket: Socket) {}

  write(data: Uint8Array): void {
    this.socket.write(data);
  }

  end(): void {
    this.socket.end();
  }

  on(event: string, listener: (...args: any[]) => void): void {
    this.socket.on(event, listener);
  }
}

function listen(server: Server, socketPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(socketPath, () => {
      server.off("error", onError);
      resolve();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function removeSocket(socketPath: string): void {
  if (existsSync(socketPath)) {
    unlinkSync(socketPath);
  }
}
