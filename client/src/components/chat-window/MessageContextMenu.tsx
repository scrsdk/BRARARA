import { AnimatePresence, motion } from 'framer-motion';
import { Copy, Download, Forward, Link2, MessageCircle, Pin, Trash2, X } from 'lucide-react';
import { Message } from '../../types';
import ru from '../../i18n/ru';

interface MessageContextMenuProps {
  contextMenu: { messageId: string; x: number; y: number };
  message: Message | undefined;
  isAdmin: boolean;
  isPinned?: boolean;
  currentUserId?: string;
  onClose: () => void;
  onReply: (message: Message) => void;
  onSelect: (messageId: string) => void;
  onCopyMessage: (message: Message) => void;
  onForwardMessage: (messageId: string) => void;
  onPinMessage: (messageId: string) => void;
  onUnpinMessage: (messageId: string) => void;
  onEditMessage: (message: Message) => void;
  onDeleteMessage: (messageId: string) => void;
  onCopyLink: (message: Message) => void;
  onSaveMedia: (message: Message) => void;
}

export function MessageContextMenu({
  contextMenu,
  message,
  isAdmin,
  isPinned = false,
  currentUserId,
  onClose,
  onReply,
  onSelect,
  onCopyMessage,
  onForwardMessage,
  onPinMessage,
  onUnpinMessage,
  onEditMessage,
  onDeleteMessage,
  onCopyLink,
  onSaveMedia,
}: MessageContextMenuProps) {
  if (!message) {
    return null;
  }

  const isOwn = !message.botId && message.senderId === currentUserId;
  const hasMedia = message.fileUrl && (message.type === 'IMAGE' || message.type === 'VIDEO' || message.type === 'AUDIO' || message.type === 'VOICE' || message.type === 'FILE');

  const menuItems = [
    {
      icon: <MessageCircle className="h-4 w-4" />,
      label: ru.chat.menu.reply,
      onClick: () => onReply(message),
      show: true,
    },
    {
      icon: <Copy className="h-4 w-4" />,
      label: ru.chat.menu.select,
      onClick: () => onSelect(message.id),
      show: true,
    },
    {
      icon: <Copy className="h-4 w-4" />,
      label: ru.chat.menu.copy,
      onClick: () => onCopyMessage(message),
      show: message.content,
    },
    {
      icon: <Forward className="h-4 w-4" />,
      label: ru.chat.menu.forward,
      onClick: () => onForwardMessage(message.id),
      show: true,
    },
    ...(isPinned
      ? [
          {
            icon: <Pin className="h-4 w-4" />,
            label: ru.chat.menu.unpin,
            onClick: () => onUnpinMessage(message.id),
            show: isAdmin || isOwn,
          },
        ]
      : [
          {
            icon: <Pin className="h-4 w-4" />,
            label: ru.chat.menu.pin,
            onClick: () => onPinMessage(message.id),
            show: isAdmin || isOwn,
          },
        ]),
    {
      icon: <Link2 className="h-4 w-4" />,
      label: ru.chat.menu.copyLink,
      onClick: () => onCopyLink(message),
      show: true,
    },
    {
      icon: <Download className="h-4 w-4" />,
      label: ru.chat.menu.saveMedia,
      onClick: () => onSaveMedia(message),
      show: Boolean(hasMedia),
    },
    {
      icon: <Copy className="h-4 w-4" />,
      label: ru.chat.menu.edit,
      onClick: () => onEditMessage(message),
      show: isOwn,
      danger: false,
    },
    {
      icon: <Trash2 className="h-4 w-4" />,
      label: ru.chat.menu.delete,
      onClick: () => onDeleteMessage(message.id),
      show: isOwn,
      danger: true,
    },
  ].filter((item) => item.show);

  const position = {
    left: Math.min(contextMenu.x, window.innerWidth - 220),
    top: Math.min(contextMenu.y, window.innerHeight - menuItems.length * 44 - 20),
  };

  return (
    <AnimatePresence>
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-40"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="fixed z-50 min-w-[190px] max-w-[calc(100vw-16px)] rounded-2xl bg-white py-1 shadow-xl dark:bg-[#202c33]"
          style={position}
        >
          {menuItems.map((item, index) => (
            <motion.button
              key={index}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.03, duration: 0.15 }}
              onClick={() => {
                item.onClick();
                onClose();
              }}
              className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm ${
                item.danger
                  ? 'text-red-600 hover:bg-gray-100 dark:text-red-400 dark:hover:bg-[#2a3942]'
                  : 'text-[#111b21] hover:bg-gray-100 dark:text-[#e9edef] dark:hover:bg-[#2a3942]'
              }`}
            >
              {item.icon}
              {item.label}
            </motion.button>
          ))}
        </motion.div>
      </>
    </AnimatePresence>
  );
}