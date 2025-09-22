import { io, Socket } from "socket.io-client";

let socketInstance: Socket | null = null;

export function getSocket(): Socket {
  if (!socketInstance) {
    // Connect to the server service
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";
    socketInstance = io(serverUrl, { transports: ["websocket"], autoConnect: true });
  }
  return socketInstance;
}



