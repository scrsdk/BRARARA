import { io, Socket } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001';

class SocketService {
  private socket: Socket | null = null;

  connect(token: string) {
    if (this.socket?.connected) return;

    this.socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  on(event: string, callback: (...args: any[]) => void) {
    this.socket?.on(event, callback);
  }

  off(event: string, callback?: (...args: any[]) => void) {
    if (callback) {
      this.socket?.off(event, callback);
    } else {
      this.socket?.off(event);
    }
  }

  emit(event: string, data?: any) {
    this.socket?.emit(event, data);
  }

  sendMessage(chatId: string, content: string, type = 'TEXT', replyToId?: string, clientMessageId?: string) {
    this.emit('message:send', { chatId, content, type, replyToId, clientMessageId });
  }

  typing(chatId: string, isTyping: boolean) {
    this.emit('message:typing', { chatId, isTyping });
  }

  readMessage(messageId: string) {
    this.emit('message:read', { messageId });
  }

  initiateCall(chatId: string, type: 'AUDIO' | 'VIDEO') {
    this.emit('call:initiate', { chatId, type });
  }

  answerCall(callId: string) {
    this.emit('call:answer', { callId });
  }

  rejectCall(callId: string) {
    this.emit('call:reject', { callId });
  }

  endCall(callId: string) {
    this.emit('call:end', { callId });
  }

  sendWebRTCOffer(callId: string, to: string, offer: RTCSessionDescriptionInit) {
    this.emit('webrtc:offer', { callId, to, offer });
  }

  sendWebRTCAnswer(callId: string, to: string, answer: RTCSessionDescriptionInit) {
    this.emit('webrtc:answer', { callId, to, answer });
  }

  sendICECandidate(callId: string, to: string, candidate: RTCIceCandidate) {
    this.emit('webrtc:ice-candidate', { callId, to, candidate });
  }

  // Group call methods
  initiateGroupCall(chatId: string, type: 'AUDIO' | 'VIDEO') {
    this.emit('call:group:initiate', { chatId, type });
  }

  joinGroupCall(callId: string) {
    this.emit('call:group:join', { callId });
  }

  leaveGroupCall(callId: string) {
    this.emit('call:group:leave', { callId });
  }

  endGroupCall(callId: string) {
    this.emit('call:group:end', { callId });
  }

  sendGroupWebRTCOffer(callId: string, to: string, offer: RTCSessionDescriptionInit) {
    this.emit('call:group:webrtc:offer', { callId, to, offer });
  }

  sendGroupWebRTCAnswer(callId: string, to: string, answer: RTCSessionDescriptionInit) {
    this.emit('call:group:webrtc:answer', { callId, to, answer });
  }

  sendGroupICECandidate(callId: string, to: string, candidate: RTCIceCandidate) {
    this.emit('call:group:webrtc:ice-candidate', { callId, to, candidate });
  }

  // Group call event listeners
  onGroupCallIncoming(callback: (data: { callId: string; chatId: string; callType: string; initiator: any; participants: any[] }) => void) {
    this.socket?.on('call:group:incoming', callback);
  }

  offGroupCallIncoming(callback?: (...args: any[]) => void) {
    if (callback) {
      this.socket?.off('call:group:incoming', callback);
    } else {
      this.socket?.off('call:group:incoming');
    }
  }

  onGroupCallInitiated(callback: (data: { callId: string; call: any }) => void) {
    this.socket?.on('call:group:initiated', callback);
  }

  offGroupCallInitiated(callback?: (...args: any[]) => void) {
    if (callback) {
      this.socket?.off('call:group:initiated', callback);
    } else {
      this.socket?.off('call:group:initiated');
    }
  }

  onGroupCallJoined(callback: (data: { callId: string; participants: any[] }) => void) {
    this.socket?.on('call:group:joined', callback);
  }

  offGroupCallJoined(callback?: (...args: any[]) => void) {
    if (callback) {
      this.socket?.off('call:group:joined', callback);
    } else {
      this.socket?.off('call:group:joined');
    }
  }

  onGroupCallParticipantJoined(callback: (data: { callId: string; userId: string; user: any }) => void) {
    this.socket?.on('call:group:participant:joined', callback);
  }

  offGroupCallParticipantJoined(callback?: (...args: any[]) => void) {
    if (callback) {
      this.socket?.off('call:group:participant:joined', callback);
    } else {
      this.socket?.off('call:group:participant:joined');
    }
  }

  onGroupCallParticipantLeft(callback: (data: { callId: string; userId: string }) => void) {
    this.socket?.on('call:group:participant:left', callback);
  }

  offGroupCallParticipantLeft(callback?: (...args: any[]) => void) {
    if (callback) {
      this.socket?.off('call:group:participant:left', callback);
    } else {
      this.socket?.off('call:group:participant:left');
    }
  }

  onGroupCallEnded(callback: (data: { callId: string; reason: string }) => void) {
    this.socket?.on('call:group:ended', callback);
  }

  offGroupCallEnded(callback?: (...args: any[]) => void) {
    if (callback) {
      this.socket?.off('call:group:ended', callback);
    } else {
      this.socket?.off('call:group:ended');
    }
  }

  // Group WebRTC signaling listeners
  onGroupWebRTCOffer(callback: (data: { callId: string; from: string; offer: RTCSessionDescriptionInit }) => void) {
    this.socket?.on('call:group:webrtc:offer', callback);
  }

  offGroupWebRTCOffer(callback?: (...args: any[]) => void) {
    if (callback) {
      this.socket?.off('call:group:webrtc:offer', callback);
    } else {
      this.socket?.off('call:group:webrtc:offer');
    }
  }

  onGroupWebRTCAnswer(callback: (data: { callId: string; from: string; answer: RTCSessionDescriptionInit }) => void) {
    this.socket?.on('call:group:webrtc:answer', callback);
  }

  offGroupWebRTCAnswer(callback?: (...args: any[]) => void) {
    if (callback) {
      this.socket?.off('call:group:webrtc:answer', callback);
    } else {
      this.socket?.off('call:group:webrtc:answer');
    }
  }

  onGroupICECandidate(callback: (data: { callId: string; from: string; candidate: RTCIceCandidate }) => void) {
    this.socket?.on('call:group:webrtc:ice-candidate', callback);
  }

  offGroupICECandidate(callback?: (...args: any[]) => void) {
    if (callback) {
      this.socket?.off('call:group:webrtc:ice-candidate', callback);
    } else {
      this.socket?.off('call:group:webrtc:ice-candidate');
    }
  }
}

export const socketService = new SocketService();