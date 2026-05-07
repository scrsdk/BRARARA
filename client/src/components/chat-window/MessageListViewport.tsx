import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type Ref } from 'react';
import { TypingIndicator } from '../TypingIndicator';
import { Message, ChatType } from '../../types';
import { MessageBubble } from './MessageBubble';
import ru from '../../i18n/ru';

type TypingUsersMap = Map<string, { username: string; displayName?: string }>;

interface MessageListViewportProps {
  messages: Message[];
  currentUserId?: string;
  currentChatType: ChatType;
  typingUsers: TypingUsersMap;
  messagesEndRef: Ref<HTMLDivElement>;
  selectedMessages?: Set<string>;
  isSelectionMode?: boolean;
  onMessageContextMenu: (event: MouseEvent<HTMLDivElement>, messageId: string) => void;
  onExpireMessage: (messageId: string) => void;
  onSelectMessage?: (messageId: string) => void;
}

const INITIAL_RENDER_COUNT = 120;
const LOAD_MORE_COUNT = 80;
const LOAD_MORE_THRESHOLD = 160;
const FOCUS_EVENT_NAME = 'chat-window-focus-message';

export function MessageListViewport({
  messages,
  currentUserId,
  currentChatType,
  typingUsers,
  messagesEndRef,
  selectedMessages = new Set(),
  isSelectionMode = false,
  onMessageContextMenu,
  onExpireMessage,
  onSelectMessage,
}: MessageListViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleStartIndex, setVisibleStartIndex] = useState(() =>
    Math.max(0, messages.length - INITIAL_RENDER_COUNT),
  );
  const restoreScrollRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);

  useEffect(() => {
    setVisibleStartIndex((current) => {
      if (messages.length <= INITIAL_RENDER_COUNT) {
        return 0;
      }

      const minimumStart = Math.max(0, messages.length - INITIAL_RENDER_COUNT);
      return Math.min(current, minimumStart);
    });
  }, [messages.length]);

  useLayoutEffect(() => {
    if (!restoreScrollRef.current || !containerRef.current) {
      return;
    }

    const { scrollHeight, scrollTop } = restoreScrollRef.current;
    const nextHeight = containerRef.current.scrollHeight;
    containerRef.current.scrollTop = scrollTop + (nextHeight - scrollHeight);
    restoreScrollRef.current = null;
  }, [visibleStartIndex]);

  useEffect(() => {
    const handleFocusMessage = (event: Event) => {
      const customEvent = event as CustomEvent<{ messageId?: string }>;
      const messageId = customEvent.detail?.messageId;

      if (!messageId) {
        return;
      }

      const targetIndex = messages.findIndex((message) => message.id === messageId);
      if (targetIndex === -1) {
        return;
      }

      setVisibleStartIndex((current) => {
        if (targetIndex >= current) {
          return current;
        }

        return Math.max(0, targetIndex - 20);
      });

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const messageElement = document.getElementById(`message-${messageId}`);
          if (!messageElement) {
            return;
          }

          messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          messageElement.classList.add('highlight');
          window.setTimeout(() => {
            messageElement.classList.remove('highlight');
          }, 2000);
        });
      });
    };

    window.addEventListener(FOCUS_EVENT_NAME, handleFocusMessage as EventListener);
    return () => window.removeEventListener(FOCUS_EVENT_NAME, handleFocusMessage as EventListener);
  }, [messages]);

  const visibleMessages = useMemo(() => messages.slice(visibleStartIndex), [messages, visibleStartIndex]);
  const typingEntries = useMemo(() => Array.from(typingUsers.entries()), [typingUsers]);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    if (target.scrollTop > LOAD_MORE_THRESHOLD || visibleStartIndex === 0) {
      return;
    }

    restoreScrollRef.current = {
      scrollHeight: target.scrollHeight,
      scrollTop: target.scrollTop,
    };

    setVisibleStartIndex((current) => Math.max(0, current - LOAD_MORE_COUNT));
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="telegram-wallpaper flex-1 space-y-1 overflow-y-auto px-4 py-5 scrollbar-thin md:px-7"
      style={{
        backgroundBlendMode: 'normal',
      }}
    >
      {visibleStartIndex > 0 && (
        <div className="mb-3 flex justify-center">
          <button
            type="button"
            onClick={() => {
              if (!containerRef.current) {
                setVisibleStartIndex((current) => Math.max(0, current - LOAD_MORE_COUNT));
                return;
              }

              restoreScrollRef.current = {
                scrollHeight: containerRef.current.scrollHeight,
                scrollTop: containerRef.current.scrollTop,
              };
              setVisibleStartIndex((current) => Math.max(0, current - LOAD_MORE_COUNT));
            }}
            className="panel-soft rounded-full px-4 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/15"
          >
            {ru.chat.messages.showEarlier}
          </button>
        </div>
      )}

      {visibleMessages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          isOwn={!message.botId && message.senderId === currentUserId}
          currentChatType={currentChatType}
          isSelected={selectedMessages.has(message.id)}
          isSelectionMode={isSelectionMode}
          onMessageContextMenu={onMessageContextMenu}
          onExpireMessage={onExpireMessage}
          onSelect={onSelectMessage}
        />
      ))}

      {typingEntries.map(([userId, userInfo]) => (
        <div key={userId} className="mb-1 flex justify-start">
          <TypingIndicator username={userInfo.displayName || userInfo.username} />
        </div>
      ))}

      <div ref={messagesEndRef} />
    </div>
  );
}