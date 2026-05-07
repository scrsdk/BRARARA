import { lazy, Suspense, useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { messageApi } from '../services/api';
import { socketService } from '../services/socket';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { ChatType, Message, NotificationLevel } from '../types';
import { getChatAvatar, getChatName, getInitials } from '../utils/helpers';
import PinnedMessageBanner from './PinnedMessageBanner';
import { useConfirm } from './confirm/ConfirmDialogProvider';
import { ChatWindowHeader } from './chat-window/ChatWindowHeader';
import { MessageComposer } from './chat-window/MessageComposer';
import { MessageContextMenu } from './chat-window/MessageContextMenu';
import { MessageListViewport } from './chat-window/MessageListViewport';
import { SelectionModeBar } from './chat-window/SelectionModeBar';
import { useChatComposer } from './chat-window/useChatComposer';
import { useChatWindowData } from './chat-window/useChatWindowData';
import { useChatWindowRealtime } from './chat-window/useChatWindowRealtime';
import { useChatWindowUiState } from './chat-window/useChatWindowUiState';

const CallModal = lazy(() => import('./CallModal'));
const IncomingCallModal = lazy(() => import('./IncomingCallModal'));
const ForwardMessageModal = lazy(() => import('./ForwardMessageModal'));
const MessageSearch = lazy(() => import('./MessageSearch'));
const VoiceRecorder = lazy(() => import('./VoiceRecorder'));
const ChatSettingsDrawer = lazy(() => import('./ChatSettingsDrawer'));
const ChatProfileDrawer = lazy(() => import('./ChatProfileDrawer'));
const GroupCallModal = lazy(() => import('./GroupCallModal'));

interface ChatWindowProps {
  chatId: string;
  onBack?: () => void;
}

export default function ChatWindow({ chatId, onBack }: ChatWindowProps) {
  const confirm = useConfirm();
  const {
    currentChat,
    messages,
    selectChat,
    sendMessage,
    markMessageAsRead,
    deleteMessage: deleteMessageFromStore,
  } = useChatStore();
  const { user } = useAuthStore();

  const {
    typingUsers,
    showCallModal,
    setShowCallModal,
    incomingCall,
    activeCallId,
    setActiveCallId,
    callType,
    setCallType,
    isInitiator,
    setIsInitiator,
    messagesEndRef,
    handleAnswerCall,
    handleRejectCall,
  } = useChatWindowRealtime({
    chatId,
    currentChat,
    userId: user?.id,
    messages,
    markMessageAsRead,
    deleteMessageFromStore,
  });

  const {
    chatSettings,
    folders,
    isAdmin,
    handlePinMessage,
    handleUnpinMessage,
    handleUpdateNotificationLevel,
    handleUpdateFolder,
  } = useChatWindowData({
    chatId,
    currentChat,
    userId: user?.id,
    selectChat,
  });

  // Group call state
  const [showGroupCallModal, setShowGroupCallModal] = useState(false);
  const [groupCallId, setGroupCallId] = useState<string | null>(null);

  const handleStartCall = (type: 'AUDIO' | 'VIDEO') => {
    if (currentChat?.type !== ChatType.PRIVATE) {
      toast.error('Звонки сейчас доступны только в личных чатах');
      return;
    }

    setCallType(type);
    setIsInitiator(true);
    socketService.initiateCall(chatId, type);
  };

  const handleStartGroupCall = (type: 'AUDIO' | 'VIDEO') => {
    if (currentChat?.type === ChatType.PRIVATE) {
      // For private chats, use regular calls
      handleStartCall(type);
      return;
    }

    setCallType(type);
    setIsInitiator(true);
    socketService.initiateGroupCall(chatId, type);

    // Listen for group call initiated confirmation
    const handleGroupCallInitiated = ({ callId }: { callId: string }) => {
      setGroupCallId(callId);
      setShowGroupCallModal(true);
      socketService.offGroupCallInitiated(handleGroupCallInitiated);
    };

    socketService.onGroupCallInitiated(handleGroupCallInitiated);

    // Set up listener for incoming group calls to join
    const handleGroupCallIncoming = ({ callId }: { callId: string; chatId: string; callType: string; initiator: any; participants: any[] }) => {
      setGroupCallId(callId);
      setShowGroupCallModal(true);
      socketService.offGroupCallIncoming(handleGroupCallIncoming);
    };

    socketService.onGroupCallIncoming(handleGroupCallIncoming);
  };

  const handleCloseGroupCall = () => {
    setShowGroupCallModal(false);
    setGroupCallId(null);
  };

  const {
    messageInput,
    showVoiceRecorder,
    selfDestructSeconds,
    showSelfDestructOptions,
    selfDestructButtonRef,
    fileInputRef,
    setShowVoiceRecorder,
    setSelfDestructSeconds,
    setShowSelfDestructOptions,
    setMessageInput,
    handleTyping,
    handleSendMessage,
    handleEmojiSelect,
    handleFileSelect,
    handleFileButtonClick,
    handleVoiceSend,
  } = useChatComposer({
    chatId,
    currentChat,
    sendMessage,
    onStartCall: handleStartCall,
  });

  const {
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
    selectedCount,
    enterSelectionMode,
    exitSelectionMode,
    toggleMessageSelection,
    handleForwardSelected,
    handleDeleteSelected,
  } = useChatWindowUiState({
    chatId,
  });

  const handleCopyMessage = async (message: Message) => {
    if (message.content) {
      await navigator.clipboard.writeText(message.content);
    }
    setContextMenu(null);
  };

  const handleCopyLink = async (message: Message) => {
    const link = `${window.location.origin}/chat/${chatId}?message=${message.id}`;
    await navigator.clipboard.writeText(link);
    toast.success('Ссылка скопирована');
    setContextMenu(null);
  };

  const handleSaveMedia = async (message: Message) => {
    if (!message.fileUrl) return;
    
    try {
      const response = await fetch(message.fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = message.fileName || 'media';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Медиа сохранено');
    } catch (error) {
      toast.error('Не удалось сохранить медиа');
    }
    setContextMenu(null);
  };

  const handleReply = (message: Message) => {
    setMessageInput(message.content || '');
    setContextMenu(null);
    // TODO: Set reply context if needed
  };

  const handleSelect = (messageId: string) => {
    enterSelectionMode(messageId);
    setContextMenu(null);
  };

  const handleEditMessage = (message: Message) => {
    setMessageInput(message.content || '');
    setContextMenu(null);
  };

  const handleDeleteMessage = async (messageId: string) => {
    const shouldDelete = await confirm({
      title: 'Удалить сообщение',
      message: 'Сообщение будет удалено из чата.',
      confirmText: 'Удалить',
      tone: 'danger',
    });

    if (!shouldDelete) {
      return;
    }

    try {
      await messageApi.delete(messageId);
    } catch (error) {
      console.error('Failed to delete message:', error);
    }

    setContextMenu(null);
  };

  const handleBulkDelete = useCallback(async (messageIds: string[]) => {
    const shouldDelete = await confirm({
      title: 'Удалить сообщения',
      message: `${messageIds.length} сообщений будет удалено из чата.`,
      confirmText: 'Удалить',
      tone: 'danger',
    });

    if (!shouldDelete) {
      return;
    }

    try {
      await Promise.all(messageIds.map(id => messageApi.delete(id)));
      toast.success(`Удалено ${messageIds.length} сообщений`);
    } catch (error) {
      console.error('Failed to delete messages:', error);
    }
  }, []);

  if (!currentChat) {
    return (
      <div className="telegram-wallpaper flex h-full items-center justify-center">
        <div className="panel-soft flex h-16 w-16 items-center justify-center rounded-[22px]">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-white/10 border-t-[#4ba3ff]" />
        </div>
      </div>
    );
  }

  const chatName = getChatName(currentChat, user?.id || '');
  const chatAvatar = getChatAvatar(currentChat, user?.id || '') || null;
  const canStartCall = currentChat.type === ChatType.PRIVATE;
  const chatSubtitle =
    currentChat.type === ChatType.PRIVATE
      ? 'личный чат'
      : currentChat.type === ChatType.GROUP
        ? `${currentChat.members.length} участников`
        : 'канал';

  const isPinned = contextMenu?.messageId === currentChat.pinnedMessageId;

  return (
    <div className="flex h-full bg-transparent">
      <SelectionModeBar
        selectedCount={selectedCount}
        onForward={handleForwardSelected}
        onDelete={() => handleDeleteSelected(handleBulkDelete)}
        onCancel={exitSelectionMode}
      />

      <div className="flex min-w-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(11,20,31,0.76),rgba(10,17,28,0.92))]">
        <ChatWindowHeader
          chatName={chatName}
          chatAvatar={chatAvatar}
          chatSubtitle={chatSubtitle}
          canStartCall={canStartCall}
          canStartGroupCall={currentChat?.type !== ChatType.PRIVATE}
          hasPinnedMessage={Boolean(currentChat.pinnedMessageId)}
          onBack={onBack}
          onOpenProfile={() => setShowChatProfile(true)}
          onUnpinMessage={handleUnpinMessage}
          onOpenSearch={() => setShowSearch(true)}
          onStartAudioCall={() => handleStartGroupCall('AUDIO')}
          onStartVideoCall={() => handleStartGroupCall('VIDEO')}
          onStartGroupCall={() => handleStartGroupCall('VIDEO')}
          onOpenSettings={() => setShowChatSettings(true)}
          getInitials={getInitials}
        />

        {currentChat.pinnedMessage && (
          <PinnedMessageBanner
            message={currentChat.pinnedMessage}
            onUnpin={isAdmin ? handleUnpinMessage : undefined}
          />
        )}

        <MessageListViewport
          messages={messages}
          currentUserId={user?.id}
          currentChatType={currentChat.type}
          typingUsers={typingUsers}
          messagesEndRef={messagesEndRef}
          selectedMessages={selectedMessages}
          isSelectionMode={isSelectionMode}
          onMessageContextMenu={handleMessageContextMenu}
          onExpireMessage={deleteMessageFromStore}
          onSelectMessage={toggleMessageSelection}
        />

        <MessageComposer
          messageInput={messageInput}
          selfDestructSeconds={selfDestructSeconds}
          showSelfDestructOptions={showSelfDestructOptions}
          selfDestructButtonRef={selfDestructButtonRef}
          fileInputRef={fileInputRef}
          onSubmit={handleSendMessage}
          onTyping={handleTyping}
          onEmojiSelect={handleEmojiSelect}
          onVoiceRecorderOpen={() => setShowVoiceRecorder(true)}
          onFileButtonClick={handleFileButtonClick}
          onFileSelect={handleFileSelect}
          onToggleSelfDestructOptions={() => setShowSelfDestructOptions(!showSelfDestructOptions)}
          onSelfDestructSelect={(seconds) => {
            setSelfDestructSeconds(seconds);
            setShowSelfDestructOptions(false);
          }}
          onCloseSelfDestructOptions={() => setShowSelfDestructOptions(false)}
        />
      </div>

      {contextMenu && (
        <MessageContextMenu
          contextMenu={contextMenu}
          message={messages.find((message) => message.id === contextMenu.messageId)}
          isAdmin={isAdmin}
          isPinned={isPinned}
          currentUserId={user?.id}
          onClose={() => setContextMenu(null)}
          onReply={handleReply}
          onSelect={handleSelect}
          onCopyMessage={handleCopyMessage}
          onForwardMessage={handleForwardMessage}
          onPinMessage={handlePinMessage}
          onUnpinMessage={handleUnpinMessage}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
          onCopyLink={handleCopyLink}
          onSaveMedia={handleSaveMedia}
        />
      )}

      <Suspense fallback={null}>
        {showChatProfile && (
          <div className="hidden lg:block lg:w-[380px] lg:shrink-0">
            <ChatProfileDrawer
              chat={currentChat}
              currentUserId={user?.id || ''}
              variant="docked"
              onClose={() => setShowChatProfile(false)}
              onStartCall={(type) => {
                setShowChatProfile(false);
                handleStartCall(type);
              }}
            />
          </div>
        )}

        {incomingCall && (
          <IncomingCallModal
            call={incomingCall}
            onAnswer={handleAnswerCall}
            onReject={handleRejectCall}
          />
        )}

        {showCallModal && activeCallId && (
          <CallModal
            callId={activeCallId}
            chatId={chatId}
            callType={callType}
            isInitiator={isInitiator}
            onClose={() => {
              setShowCallModal(false);
              setActiveCallId(null);
            }}
          />
        )}

        {showGroupCallModal && groupCallId && (
          <GroupCallModal
            callId={groupCallId}
            chatId={chatId}
            callType={callType}
            onClose={handleCloseGroupCall}
          />
        )}

        {showForwardModal && forwardMessageId && (
          <ForwardMessageModal
            messageId={forwardMessageId}
            onClose={() => {
              setShowForwardModal(false);
              setForwardMessageId(null);
            }}
          />
        )}

        {showSearch && (
          <MessageSearch
            chatId={chatId}
            onSelectMessage={handleSearchSelect}
            onClose={() => setShowSearch(false)}
          />
        )}

        {showVoiceRecorder && (
          <div className="px-4 py-2">
            <VoiceRecorder onSend={handleVoiceSend} onCancel={() => setShowVoiceRecorder(false)} />
          </div>
        )}

        {showChatSettings && (
          <ChatSettingsDrawer
            chatId={chatId}
            chatName={chatName}
            notificationLevel={chatSettings?.notificationLevel ?? NotificationLevel.ALL}
            isMuted={chatSettings?.isMuted || false}
            folders={folders}
            selectedFolderId={chatSettings?.folderId ?? null}
            onUpdateNotificationLevel={handleUpdateNotificationLevel}
            onUpdateFolder={handleUpdateFolder}
            onClose={() => setShowChatSettings(false)}
          />
        )}

        {showChatProfile && (
          <div className="lg:hidden">
            <ChatProfileDrawer
              chat={currentChat}
              currentUserId={user?.id || ''}
              variant="overlay"
              onClose={() => setShowChatProfile(false)}
              onStartCall={(type) => {
                setShowChatProfile(false);
                handleStartCall(type);
              }}
            />
          </div>
        )}
      </Suspense>
    </div>
  );
}