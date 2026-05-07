import { useCallback, useEffect, useRef, useState } from 'react';
import { socketService } from '../services/socket';

interface Participant {
  id: string;
  stream: MediaStream | null;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
}

interface UseWebRTCMeshOptions {
  callId: string;
  chatId: string;
  onParticipantJoined?: (participantId: string, user: any) => void;
  onParticipantLeft?: (participantId: string) => void;
  onCallEnded?: (reason: string) => void;
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const parseUrls = (value?: string) =>
  value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

const buildIceServers = (): RTCIceServer[] => {
  const rawIceServers = import.meta.env.VITE_WEBRTC_ICE_SERVERS;
  if (rawIceServers) {
    try {
      const parsed = JSON.parse(rawIceServers);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as RTCIceServer[];
      }
    } catch (error) {
      console.warn('Invalid VITE_WEBRTC_ICE_SERVERS value, falling back to STUN/TURN variables.', error);
    }
  }

  const iceServers: RTCIceServer[] = [];
  const stunUrls = parseUrls(import.meta.env.VITE_STUN_URLS);
  const turnUrls = parseUrls(import.meta.env.VITE_TURN_URLS);

  if (stunUrls.length > 0) {
    iceServers.push({ urls: stunUrls });
  }

  if (turnUrls.length > 0) {
    iceServers.push({
      urls: turnUrls,
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    });
  }

  return iceServers.length > 0 ? iceServers : DEFAULT_ICE_SERVERS;
};

const ICE_CONFIGURATION: RTCConfiguration = {
  iceServers: buildIceServers(),
};

export const useWebRTCMesh = ({ callId, chatId, onParticipantJoined, onParticipantLeft, onCallEnded }: UseWebRTCMeshOptions) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [participants, setParticipants] = useState<Map<string, Participant>>(new Map());
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  const getPeerConnection = useCallback(
    (participantId: string) => {
      if (peerConnections.current.has(participantId)) {
        return peerConnections.current.get(participantId)!;
      }

      const pc = new RTCPeerConnection(ICE_CONFIGURATION);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketService.sendGroupICECandidate(callId, participantId, event.candidate);
        }
      };

      pc.ontrack = (event) => {
        setParticipants((prev) => {
          const next = new Map(prev);
          const existing = next.get(participantId);
          if (existing) {
            next.set(participantId, { ...existing, stream: event.streams[0] });
          } else {
            next.set(participantId, {
              id: participantId,
              stream: event.streams[0],
              isAudioEnabled: true,
              isVideoEnabled: true,
            });
          }
          return next;
        });
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setIsConnected(true);
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          setIsConnected(false);
        }
      };

      peerConnections.current.set(participantId, pc);
      return pc;
    },
    [callId]
  );

  const startLocalStream = useCallback(async (video = true) => {
    if (localStreamRef.current) return localStreamRef.current;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video,
      });

      setLocalStream(stream);
      localStreamRef.current = stream;

      // Add tracks to all existing peer connections
      peerConnections.current.forEach((pc) => {
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });
      });

      return stream;
    } catch (error) {
      console.error('Error getting local stream:', error);
      throw error;
    }
  }, []);

  const createOfferForParticipant = useCallback(
    async (participantId: string) => {
      try {
        const pc = getPeerConnection(participantId);
        const stream = localStreamRef.current || (await startLocalStream());

        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketService.sendGroupWebRTCOffer(callId, participantId, offer);
      } catch (error) {
        console.error('Error creating offer:', error);
      }
    },
    [callId, getPeerConnection, startLocalStream]
  );

  const handleOffer = useCallback(
    async ({ callId: incomingCallId, from, offer }: { callId: string; from: string; offer: RTCSessionDescriptionInit }) => {
      if (incomingCallId !== callId) return;

      try {
        const pc = getPeerConnection(from);
        const stream = localStreamRef.current || (await startLocalStream());

        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socketService.sendGroupWebRTCAnswer(callId, from, answer);
      } catch (error) {
        console.error('Error handling offer:', error);
      }
    },
    [callId, getPeerConnection, startLocalStream]
  );

  const handleAnswer = useCallback(
    async ({ callId: incomingCallId, from, answer }: { callId: string; from: string; answer: RTCSessionDescriptionInit }) => {
      if (incomingCallId !== callId) return;

      try {
        const pc = peerConnections.current.get(from);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
      } catch (error) {
        console.error('Error handling answer:', error);
      }
    },
    [callId]
  );

  const handleICECandidate = useCallback(
    async ({ callId: incomingCallId, from, candidate }: { callId: string; from: string; candidate: RTCIceCandidate }) => {
      if (incomingCallId !== callId) return;

      try {
        const pc = peerConnections.current.get(from);
        if (pc) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (error) {
        console.error('Error handling ICE candidate:', error);
      }
    },
    [callId]
  );

  const handleParticipantJoined = useCallback(
    ({ callId: incomingCallId, userId, user }: { callId: string; userId: string; user: any }) => {
      if (incomingCallId !== callId) return;

      setParticipants((prev) => {
        const next = new Map(prev);
        if (!next.has(userId)) {
          next.set(userId, {
            id: userId,
            stream: null,
            isAudioEnabled: true,
            isVideoEnabled: true,
          });
        }
        return next;
      });

      // Create offer for the new participant
      void createOfferForParticipant(userId);
      onParticipantJoined?.(userId, user);
    },
    [callId, createOfferForParticipant, onParticipantJoined]
  );

  const handleParticipantLeft = useCallback(
    ({ callId: incomingCallId, userId }: { callId: string; userId: string }) => {
      if (incomingCallId !== callId) return;

      // Clean up peer connection
      const pc = peerConnections.current.get(userId);
      if (pc) {
        pc.close();
        peerConnections.current.delete(userId);
      }

      // Remove from participants
      setParticipants((prev) => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });

      onParticipantLeft?.(userId);
    },
    [callId, onParticipantLeft]
  );

  const handleCallEnded = useCallback(
    ({ callId: incomingCallId, reason }: { callId: string; reason: string }) => {
      if (incomingCallId !== callId) return;
      onCallEnded?.(reason);
    },
    [callId, onCallEnded]
  );

  const setupSocketListeners = useCallback(() => {
    socketService.onGroupWebRTCOffer(handleOffer);
    socketService.onGroupWebRTCAnswer(handleAnswer);
    socketService.onGroupICECandidate(handleICECandidate);
    socketService.onGroupCallParticipantJoined(handleParticipantJoined);
    socketService.onGroupCallParticipantLeft(handleParticipantLeft);
    socketService.onGroupCallEnded(handleCallEnded);
  }, [handleAnswer, handleCallEnded, handleICECandidate, handleOffer, handleParticipantJoined, handleParticipantLeft]);

  const cleanup = useCallback(() => {
    // Stop local stream tracks
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);

    // Close all peer connections
    peerConnections.current.forEach((pc) => pc.close());
    peerConnections.current.clear();

    // Remove participants
    setParticipants(new Map());
    setIsConnected(false);

    // Remove socket listeners
    socketService.offGroupWebRTCOffer(handleOffer);
    socketService.offGroupWebRTCAnswer(handleAnswer);
    socketService.offGroupICECandidate(handleICECandidate);
    socketService.offGroupCallParticipantJoined(handleParticipantJoined);
    socketService.offGroupCallParticipantLeft(handleParticipantLeft);
    socketService.offGroupCallEnded(handleCallEnded);
  }, [handleAnswer, handleCallEnded, handleICECandidate, handleOffer, handleParticipantJoined, handleParticipantLeft]);

  useEffect(() => {
    setupSocketListeners();
    return () => {
      cleanup();
    };
  }, [cleanup, setupSocketListeners]);

  const startCall = useCallback(
    async (video = true) => {
      try {
        const stream = await startLocalStream(video);
        socketService.joinGroupCall(callId);
        return stream;
      } catch (error) {
        console.error('Error starting group call:', error);
        throw error;
      }
    },
    [callId, startLocalStream]
  );

  const endCall = useCallback(() => {
    socketService.leaveGroupCall(callId);
    cleanup();
  }, [callId, cleanup]);

  const toggleAudio = useCallback(() => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (!audioTrack) return;

    audioTrack.enabled = !audioTrack.enabled;
    setIsAudioEnabled(audioTrack.enabled);
  }, []);

  const toggleVideo = useCallback(() => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (!videoTrack) return;

    videoTrack.enabled = !videoTrack.enabled;
    setIsVideoEnabled(videoTrack.enabled);
  }, []);

  const participantArray = Array.from(participants.values());

  return {
    localStream,
    participants: participantArray,
    participantCount: participants.size,
    isAudioEnabled,
    isVideoEnabled,
    isConnected,
    startCall,
    endCall,
    toggleAudio,
    toggleVideo,
    cleanup,
  };
};