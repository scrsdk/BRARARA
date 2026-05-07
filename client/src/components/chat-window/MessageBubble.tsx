import { memo } from 'react';
import { Forward, Check } from 'lucide-react';
import LinkPreview from '../LinkPreview';
import MessageStatus from '../MessageStatus';
import SelfDestructTimer from '../SelfDestructTimer';
import { formatMessageTime } from '../../utils/helpers';
import { ChatType, Message } from '../../types';
import { MessageAttachment } from './MessageAttachment';
import ru from '../../i18n/ru';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  currentChatType: ChatType;
  isSelected?: boolean;
  isSelectionMode?: boolean;
  onMessageContextMenu: (event: React.MouseEvent<HTMLDivElement>, messageId: string) => void;
  onExpireMessage: (messageId: string) => void;
  onSelect?: (messageId: string) => void;
}

function MessageBubbleComponent({
  message,
  isOwn,
  currentChatType,
  isSelected = false,
  isSelectionMode = false,
  onMessageContextMenu,
  onExpireMessage,
  onSelect,
}: MessageBubbleProps) {
  const isReadByRecipient = Boolean(
    message.readBy?.some((readerId) => readerId !== message.senderId) ||
      message.reads?.some((read) => read.userId !== message.senderId)
  );
  const deliveryStatus =
    message.deliveryStatus === 'failed' || message.deliveryStatus === 'pending'
      ? message.deliveryStatus
      : message.isRead || isReadByRecipient
        ? 'read'
        : message.isSent
          ? 'delivered'
          : 'sent';

  const handleClick = () => {
    if (isSelectionMode && onSelect) {
      onSelect(message.id);
    }
  };

  return (
    <div
      id={`message-${message.id}`}
      className={`mb-1.5 flex transition ${isOwn ? 'justify-end' : 'justify-start'}`}
      onContextMenu={(event) => onMessageContextMenu(event, message.id)}
      onClick={handleClick}
    >
      {isSelectionMode && (
        <div className="flex items-center">
          <div
            className={`mr-2 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${
              isSelected
                ? 'border-[#008069] bg-[#008069]'
                : 'border-white/40 bg-transparent'
            }`}
          >
            {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
          </div>
        </div>
      )}
      <div
        className={`max-w-[78%] border px-3.5 py-2.5 shadow-[0_12px_30px_rgba(6,12,20,0.18)] transition-all xl:max-w-[58%] ${
          isSelected && isSelectionMode ? 'ring-2 ring-[#008069] ring-offset-1 ring-offset-transparent' : ''
        } ${
          isOwn
            ? 'border-[#6fe0b2]/20 text-[#10211b] dark:text-[#e9edef]'
            : 'border-white/10 text-[#111b21] dark:text-[#e9edef]'
        }`}
        style={{
          background: isOwn ? 'var(--app-bubble-own-dark)' : 'var(--app-bubble-peer-dark)',
          borderRadius: isOwn ? '7.5px 7.5px 0 7.5px' : '7.5px 7.5px 7.5px 0',
        }}
      >
        {message.isForwarded && (
          <div className="mb-1 border-b border-white/10 pb-1">
            <p className="flex items-center gap-1 text-xs text-[#d2e3f2]/70">
              <Forward className="h-3 w-3" />
              {ru.chat.messages.forwarded}
            </p>
          </div>
        )}

        {!isOwn && currentChatType !== ChatType.PRIVATE && (
          <p className="mb-0.5 text-xs font-semibold text-[#84c2ff]">
            {message.bot?.displayName ||
              message.bot?.username ||
              message.sender.displayName ||
              message.sender.username}
          </p>
        )}

        <MessageAttachment message={message} />

        {message.content && <p className="break-words text-[15px] leading-[1.45]">{message.content}</p>}

        {message.linkPreview && typeof message.linkPreview === 'object' && (
          <div className="mt-2">
            <LinkPreview preview={message.linkPreview} messageId={message.id} />
          </div>
        )}

        {message.expiresAt && (
          <div className="mt-1">
            <SelfDestructTimer expiresAt={message.expiresAt} onExpire={() => onExpireMessage(message.id)} />
          </div>
        )}

        <div className={`mt-0.5 flex items-center gap-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
          <span className="text-xs text-[#d2e3f2]/70">
            {formatMessageTime(message.createdAt)}
          </span>
          {message.isEdited && <span className="text-xs text-[#d2e3f2]/70">({ru.chat.messages.edited})</span>}
          {isOwn && <MessageStatus status={deliveryStatus} isOwn />}
        </div>
      </div>
    </div>
  );
}

function areEqual(prev: MessageBubbleProps, next: MessageBubbleProps) {
  return (
    prev.message === next.message &&
    prev.isOwn === next.isOwn &&
    prev.currentChatType === next.currentChatType &&
    prev.isSelected === next.isSelected &&
    prev.isSelectionMode === next.isSelectionMode &&
    prev.onMessageContextMenu === next.onMessageContextMenu &&
    prev.onExpireMessage === next.onExpireMessage &&
    prev.onSelect === next.onSelect
  );
}

export const MessageBubble = memo(MessageBubbleComponent, areEqual);