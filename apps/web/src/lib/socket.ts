import { io, Socket } from "socket.io-client";

let socketInstance: Socket | null = null;

export function getSocket(): Socket {
  if (!socketInstance) {
    // For now, create a mock socket that doesn't require a server
    // This allows the Create Room button to work without Socket.IO server
    const mockSocket = {
      on: () => {},
      off: () => {},
      emit: (event: string, data?: any, callback?: () => void) => {
        console.log('Mock socket emit:', event, data);
        // Simulate successful room creation
        if (event === 'host:createRoom') {
          setTimeout(() => {
            // Simulate the server response
            const mockResponse = { code: Math.random().toString(36).substring(2, 8).toUpperCase() };
            console.log('Mock room created:', mockResponse.code);
            // Trigger the host:created event
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('mock-host-created', { detail: mockResponse }));
            }
          }, 100);
        }
        if (callback) callback();
      },
      connected: true
    } as any;
    
    socketInstance = mockSocket;
    console.log('Using mock socket - no server required');
  }
  return socketInstance;
}



