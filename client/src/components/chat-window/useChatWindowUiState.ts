import { useEffect, useState, useCallback } from 'react';
import type { Message } from '../../types';

interface UseChatWindowUiStateParams {
  chatId: string;
}

export function useChatWindowUiState({ chatId }: UseChatWindowUiStateParams) {
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardMessageId, setForwardMessageId] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ messageId: string; x: number; y: number } | null>(null);
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [showChatProfile, setShowChatProfile] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);
  
  // Selection mode state
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      setShowChatProfile(true);
    }
  }, [chatId]);

  // Reset selection when chat changes
  useEffect(() => {
    setSelectedMessages(new Set());
    setIsSelectionMode(false);
  }, [chatId]);

  const handleMessageContextMenu = (event: React.MouseEvent, messageId: string) => {
    event.preventDefault();
    if (isSelectionMode) {
      // In selection mode, clicking opens context menu but doesn't enter selection mode
      setContextMenu({ messageId, x: event.clientX, y: event.clientY });
    } else {
      setContextMenu({ messageId, x: event.clientX, y: event.clientY });
    }
  };

  const handleForwardMessage = (messageId: string) => {
    setForwardMessageId(messageId);
    setShowForwardModal(true);
    setContextMenu(null);
  };

  const handleSearchSelect = (message: Message) => {
    window.dispatchEvent(
      new CustomEvent('chat-window-focus-message', {
        detail: { messageId: message.id },
      }),
    );
  };

  // Selection mode handlers
  const enterSelectionMode = useCallback((messageId?: string) => {
    setIsSelectionMode(true);
    if (messageId) {
      setSelectedMessages(new Set([messageId]));
    }
  }, []);

  const exitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedMessages(new Set());
  }, []);

  const toggleMessageSelection = useCallback((messageId: string) => {
    setSelectedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      if (next.size === 0) {
        setIsSelectionMode(false);
      }
      return next;
    });
  }, []);

  const handleForwardSelected = useCallback(() => {
    if (selectedMessages.size > 0) {
      setForwardMessageId(Array.from(selectedMessages)[0]);
      setShowForwardModal(true);
    }
    exitSelectionMode();
  }, [selectedMessages, exitSelectionMode]);

  const handleDeleteSelected = useCallback((deleteFn: (ids: string[]) => void) => {
    if (selectedMessages.size > 0) {
      deleteFn(Array.from(selectedMessages));
    }
    exitSelectionMode();
  }, [selectedMessages, exitSelectionMode]);

  return {
    showForwardModal,
    setShowForwardModal,
    forwardMessageId,
    setForwardMessageId,
    showSearch,
    setShowSearch,
    contextMenu,
    setContextMenu,
    showChatSettings,
    setShowChatSettings,
    showChatProfile,
    setShowChatProfile,
    handleMessageContextMenu,
    handleForwardMessage,
    handleSearchSelect,
    // Selection mode
    selectedMessages,
    isSelectionMode,
    selectedCount: selectedMessages.size,
    enterSelectionMode,
    exitSelectionMode,
    toggleMessageSelection,
    handleForwardSelected,
    handleDeleteSelected,
  };
}