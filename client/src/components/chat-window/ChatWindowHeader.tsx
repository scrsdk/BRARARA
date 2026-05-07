import { ArrowLeft, Phone, PinOff, Search, Settings, Video, Users } from 'lucide-react';

interface ChatWindowHeaderProps {
  chatName: string;
  chatAvatar: string | null;
  chatSubtitle: string;
  canStartCall: boolean;
  canStartGroupCall?: boolean;
  hasPinnedMessage: boolean;
  onBack?: () => void;
  onOpenProfile: () => void;
  onUnpinMessage: () => void;
  onOpenSearch: () => void;
  onStartAudioCall: () => void;
  onStartVideoCall: () => void;
  onStartGroupCall?: () => void;
  onOpenSettings: () => void;
  getInitials: (value: string) => string;
}

export function ChatWindowHeader({
  chatName,
  chatAvatar,
  chatSubtitle,
  canStartCall,
  canStartGroupCall = false,
  hasPinnedMessage,
  onBack,
  onOpenProfile,
  onUnpinMessage,
  onOpenSearch,
  onStartAudioCall,
  onStartVideoCall,
  onStartGroupCall,
  onOpenSettings,
  getInitials,
}: ChatWindowHeaderProps) {
  return (
    <div className="border-b border-white/8 bg-[linear-gradient(180deg,rgba(18,29,42,0.94),rgba(15,24,35,0.88))] px-3 py-3 text-white md:px-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 md:gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="panel-soft flex-shrink-0 rounded-full p-2 transition hover:bg-white/10 md:hidden"
              title="Назад"
            >
              <ArrowLeft className="h-5 w-5 text-white" />
            </button>
          )}
          <button
            onClick={onOpenProfile}
            className="flex min-w-0 items-center gap-3 rounded-[22px] px-1.5 py-1.5 text-left transition hover:bg-white/6"
            title="Открыть профиль"
          >
            {chatAvatar ? (
              <img src={chatAvatar} alt={chatName} className="h-11 w-11 flex-shrink-0 rounded-full object-cover ring-2 ring-white/10" />
            ) : (
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#4ba3ff,#2f8cff)] text-sm font-medium text-white shadow-[0_10px_30px_rgba(47,140,255,0.32)]">
                {getInitials(chatName)}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-[16px] font-semibold text-white">{chatName}</h2>
              <p className="truncate text-xs text-[#93abc1]">{chatSubtitle}</p>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-[22px] border border-white/8 bg-white/[0.035] px-1.5 py-1.5 backdrop-blur-xl">
          {hasPinnedMessage && (
            <button
              onClick={onUnpinMessage}
              className="rounded-full p-2 transition hover:bg-white/10"
              title="Открепить сообщение"
            >
              <PinOff className="h-5 w-5 text-white" />
            </button>
          )}
          <button
            onClick={onOpenSearch}
            className="rounded-full p-2 transition hover:bg-white/10"
            title="Поиск"
          >
            <Search className="h-5 w-5 text-white" />
          </button>
          
          {/* Group call button - only shown for group chats */}
          {canStartGroupCall && onStartGroupCall && (
            <button
              onClick={onStartGroupCall}
              className="rounded-full p-2 transition hover:bg-white/10"
              title="Начать групповой звонок"
            >
              <Users className="h-5 w-5 text-white" />
            </button>
          )}
          
          {/* Regular call buttons - only for private chats */}
          {canStartCall && (
            <>
              <button
                onClick={onStartAudioCall}
                className="rounded-full p-2 transition hover:bg-white/10"
                title="Аудиозвонок"
              >
                <Phone className="h-5 w-5 text-white" />
              </button>
              <button
                onClick={onStartVideoCall}
                className="rounded-full p-2 transition hover:bg-white/10"
                title="Видеозвонок"
              >
                <Video className="h-5 w-5 text-white" />
              </button>
            </>
          )}
          <button
            onClick={onOpenSettings}
            className="rounded-full p-2 transition hover:bg-white/10"
            title="Настройки чата"
          >
            <Settings className="h-5 w-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}