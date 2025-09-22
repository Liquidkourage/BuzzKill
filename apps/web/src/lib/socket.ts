import { io, Socket } from "socket.io-client";

let socketInstance: Socket | null = null;

export function getSocket(): Socket {
  if (!socketInstance) {
    // In production, connect to the same port as the web service
    const serverUrl = process.env.NODE_ENV === 'production' 
      ? window.location.origin 
      : (process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000");
    socketInstance = io(serverUrl, { transports: ["websocket"], autoConnect: true });
  }
  return socketInstance;
}



