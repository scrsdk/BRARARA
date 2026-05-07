import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Video, VideoOff, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useWebRTCMesh } from '../hooks/useWebRTCMesh';
import { socketService } from '../services/socket';
import { useAuthStore } from '../store/authStore';

interface GroupCallModalProps {
  callId: string;
  chatId: string;
  callType: 'AUDIO' | 'VIDEO';
  onClose: () => void;
}

interface ParticipantInfo {
  id: string;
  displayName: string;
  avatar?: string | null;
}

export default function GroupCallModal({ callId, chatId, callType, onClose }: GroupCallModalProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const { user: currentUser } = useAuthStore();
  const [participantInfo, setParticipantInfo] = useState<Map<string, ParticipantInfo>>(new Map());

  const {
    localStream,
    participants: remoteParticipants,
    participantCount,
    isAudioEnabled,
    isVideoEnabled,
    isConnected,
    startCall,
    endCall,
    toggleAudio,
    toggleVideo,
    cleanup,
  } = useWebRTCMesh({
    callId,
    chatId,
    onParticipantJoined: (participantId, user) => {
      console.log('Participant joined:', participantId, user);
      if (user) {
        setParticipantInfo((prev) => {
          const next = new Map(prev);
          next.set(participantId, {
            id: participantId,
            displayName: user.displayName || user.username || participantId,
            avatar: user.avatar,
          });
          return next;
        });
      }
    },
    onParticipantLeft: (participantId) => {
      console.log('Participant left:', participantId);
      setParticipantInfo((prev) => {
        const next = new Map(prev);
        next.delete(participantId);
        return next;
      });
    },
    onCallEnded: (reason) => {
      console.log('Call ended:', reason);
      toast.success('Групповой звонок завершен');
      handleClose();
    },
  });

  useEffect(() => {
    void startCall(callType === 'VIDEO');
  }, [callType, startCall]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  const handleClose = () => {
    endCall();
    cleanup();
    onClose();
  };

  const handleLeave = () => {
    endCall();
    cleanup();
    onClose();
  };

  const getGridClass = (count: number) => {
    if (count <= 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-2';
    if (count <= 4) return 'grid-cols-2';
    if (count <= 6) return 'grid-cols-3';
    return 'grid-cols-4';
  };

  const totalParticipants = (remoteParticipants.length || 0) + 1; // +1 for local user

  const getDisplayName = (participantId: string) => {
    const info = participantInfo.get(participantId);
    return info?.displayName || participantId;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-sm">
      <div className="relative h-full w-full overflow-hidden">
        {/* Header */}
        <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-slate-900/80 to-transparent px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#3390ec]">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Групповой звонок</h2>
              <p className="text-sm text-slate-300">
                {totalParticipants} участник{totalParticipants !== 1 ? 'а' : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full bg-slate-800/60 p-2 text-white transition hover:bg-slate-700/60"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Video Grid */}
        <div className={`grid h-full gap-2 p-4 pt-24 pb-32 ${getGridClass(totalParticipants)}`}>
          {/* Local Video */}
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-800">
            {callType === 'VIDEO' && localStream ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#3390ec] text-2xl font-bold text-white">
                  {currentUser?.displayName?.[0] || currentUser?.username?.[0] || 'U'}
                </div>
              </div>
            )}
            <div className="absolute bottom-2 left-2 rounded-lg bg-slate-900/70 px-2 py-1 text-xs text-white">
              {currentUser?.displayName || currentUser?.username || 'Вы'} (Вы)
            </div>
            {!isAudioEnabled && (
              <div className="absolute bottom-2 right-2 rounded-full bg-rose-600 p-1.5">
                <MicOff className="h-3 w-3 text-white" />
              </div>
            )}
          </div>

          {/* Remote Participants */}
          {remoteParticipants.map((participant) => (
            <div
              key={participant.id}
              className="relative aspect-video overflow-hidden rounded-2xl bg-slate-800"
            >
              {participant.stream && callType === 'VIDEO' ? (
                <VideoPreview stream={participant.stream} />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-700 text-2xl font-bold text-white">
                    {getDisplayName(participant.id)[0]?.toUpperCase() || 'U'}
                  </div>
                </div>
              )}
              <div className="absolute bottom-2 left-2 rounded-lg bg-slate-900/70 px-2 py-1 text-xs text-white">
                {getDisplayName(participant.id)}
              </div>
              {!participant.isAudioEnabled && (
                <div className="absolute bottom-2 right-2 rounded-full bg-rose-600 p-1.5">
                  <MicOff className="h-3 w-3 text-white" />
                </div>
              )}
            </div>
          ))}

          {/* Empty State */}
          {remoteParticipants.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center text-white/60">
              <Users className="mb-2 h-12 w-12" />
              <p>Ожидание участников...</p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-full border border-white/10 bg-slate-900/80 px-6 py-4 shadow-2xl backdrop-blur">
          <button
            type="button"
            onClick={toggleAudio}
            className={`rounded-full p-4 transition ${
              isAudioEnabled ? 'bg-slate-700 hover:bg-slate-600' : 'bg-rose-600 hover:bg-rose-700'
            }`}
            title={isAudioEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
          >
            {isAudioEnabled ? (
              <Mic className="h-6 w-6 text-white" />
            ) : (
              <MicOff className="h-6 w-6 text-white" />
            )}
          </button>

          {callType === 'VIDEO' && (
            <button
              type="button"
              onClick={toggleVideo}
              className={`rounded-full p-4 transition ${
                isVideoEnabled ? 'bg-slate-700 hover:bg-slate-600' : 'bg-rose-600 hover:bg-rose-700'
              }`}
              title={isVideoEnabled ? 'Выключить камеру' : 'Включить камеру'}
            >
              {isVideoEnabled ? (
                <Video className="h-6 w-6 text-white" />
              ) : (
                <VideoOff className="h-6 w-6 text-white" />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={handleLeave}
            className="rounded-full bg-rose-600 p-4 transition hover:bg-rose-700"
            title="Покинуть звонок"
          >
            <PhoneOff className="h-6 w-6 text-white" />
          </button>
        </div>

        {/* Connection Status */}
        <div className="absolute bottom-8 right-8 rounded-full bg-slate-900/80 px-4 py-2 text-sm text-white/80">
          {isConnected ? (
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Подключено
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
              Подключение...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Video preview component to handle stream assignment
function VideoPreview({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      className="h-full w-full object-cover"
    />
  );
}