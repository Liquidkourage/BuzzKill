import { io, Socket } from "socket.io-client";

let socketInstance: Socket | null = null;

export function getSocket(): Socket {
  if (!socketInstance) {
    // Connect to the server service
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";
    console.log('Connecting to server:', serverUrl);
    socketInstance = io(serverUrl, { 
      transports: ["polling", "websocket"], 
      autoConnect: true,
      timeout: 10000,
      forceNew: true,
      upgrade: true,
      rememberUpgrade: false
    });
    
    socketInstance.on('connect', () => {
      console.log('Socket connected to:', serverUrl);
    });
    
    socketInstance.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });
  }
  return socketInstance;
}



