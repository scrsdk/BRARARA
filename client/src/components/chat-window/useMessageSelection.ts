import { useState, useCallback } from 'react';

interface UseMessageSelectionParams {
  onForward: (messageIds: string[]) => void;
  onDelete: (messageIds: string[]) => void;
}

export function useMessageSelection({ onForward, onDelete }: UseMessageSelectionParams) {
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  const toggleSelection = useCallback((messageId: string) => {
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

  const selectAll = useCallback((messageIds: string[]) => {
    setSelectedMessages(new Set(messageIds));
    setIsSelectionMode(true);
  }, []);

  const handleForwardSelected = useCallback(() => {
    if (selectedMessages.size > 0) {
      onForward(Array.from(selectedMessages));
    }
    exitSelectionMode();
  }, [selectedMessages, onForward, exitSelectionMode]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedMessages.size > 0) {
      onDelete(Array.from(selectedMessages));
    }
    exitSelectionMode();
  }, [selectedMessages, onDelete, exitSelectionMode]);

  return {
    selectedMessages,
    isSelectionMode,
    selectedCount: selectedMessages.size,
    toggleSelection,
    enterSelectionMode,
    exitSelectionMode,
    selectAll,
    handleForwardSelected,
    handleDeleteSelected,
  };
}