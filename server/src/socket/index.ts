import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';
import telegramService from '../services/telegramService';
import { getJwtSecret } from '../utils/authConfig';
import { attachLinkPreview, sendChatMessage } from '../services/messageLifecycleService';
import { markChatReadThroughMessage } from '../services/chatReadStateService';
import { assertCanPinMessage } from '../utils/permissions';

interface AuthSocket extends Socket {
  userId?: string;
}

const userSockets = new Map<string, Set<string>>();
const callTimeouts = new Map<string, NodeJS.Timeout>();

const registerSocket = (userId: string, socketId: string) => {
  const sockets = userSockets.get(userId) ?? new Set<string>();
  sockets.add(socketId);
  userSockets.set(userId, sockets);
};

const unregisterSocket = (userId: string, socketId: string) => {
  const sockets = userSockets.get(userId);
  if (!sockets) return;

  sockets.delete(socketId);
  if (sockets.size === 0) {
    userSockets.delete(userId);
  }
};

const hasActiveSocket = (userId: string) => {
  return (userSockets.get(userId)?.size ?? 0) > 0;
};

const emitToUser = (io: Server, userId: string, event: string, payload: unknown) => {
  const sockets = userSockets.get(userId);
  if (!sockets) return;

  for (const socketId of sockets) {
    io.to(socketId).emit(event, payload);
  }
};

const clearCallTimeout = (callId: string) => {
  const timeout = callTimeouts.get(callId);
  if (timeout) {
    clearTimeout(timeout);
    callTimeouts.delete(callId);
  }
};

const scheduleMissedCallTimeout = (io: Server, callId: string, chatId: string) => {
  clearCallTimeout(callId);
  callTimeouts.set(
    callId,
    setTimeout(async () => {
      try {
        const currentCall = await prisma.call.findUnique({
          where: { id: callId },
        });

        if (!currentCall || currentCall.status !== 'CALLING') {
          return;
        }

        await prisma.call.update({
          where: { id: callId },
          data: { status: 'MISSED', endedAt: new Date() },
        });

        io.to(`chat:${chatId}`).emit('call:missed', { callId });
      } catch (error) {
        console.error('Call timeout error:', error);
      } finally {
        clearCallTimeout(callId);
      }
    }, 30000)
  );
};

const scheduleGroupCallTimeout = (io: Server, callId: string, chatId: string) => {
  clearCallTimeout(callId);
  callTimeouts.set(
    callId,
    setTimeout(async () => {
      try {
        const currentCall = await prisma.call.findUnique({
          where: { id: callId },
          include: {
            participants: {
              where: { leftAt: null },
            },
          },
        });

        if (!currentCall || !['CALLING', 'ACTIVE'].includes(currentCall.status)) {
          return;
        }

        // If no one has joined after 60 seconds, end the call
        if (currentCall.participants.length <= 1) {
          await prisma.call.update({
            where: { id: callId },
            data: { status: 'MISSED', endedAt: new Date() },
          });

          io.to(`call:${callId}`).emit('call:group:ended', { callId, reason: 'no_answer' });
        }
      } catch (error) {
        console.error('Group call timeout error:', error);
      } finally {
        clearCallTimeout(callId);
      }
    }, 60000)
  );
};

const ensureChatMembership = async (chatId: string, userId: string) =>
  prisma.chatMember.findFirst({
    where: { chatId, userId },
    select: { chatId: true },
  });

const getAccessibleMessage = async (messageId: string, userId: string) =>
  prisma.message.findFirst({
    where: {
      id: messageId,
      chat: {
        members: {
          some: { userId },
        },
      },
    },
    select: {
      id: true,
      chatId: true,
    },
  });

export const initSocketHandlers = (io: Server) => {
  io.use(async (socket: AuthSocket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication error'));
      }

      const decoded = jwt.verify(token, getJwtSecret()) as {
        userId: string;
        sessionId?: string;
      };

      if (!decoded.sessionId) {
        return next(new Error('Authentication error'));
      }

      const session = await prisma.userSession.findFirst({
        where: {
          id: decoded.sessionId,
          userId: decoded.userId,
          expiresAt: {
            gt: new Date(),
          },
        },
        select: { id: true },
      });

      if (!session) {
        return next(new Error('Authentication error'));
      }

      socket.userId = decoded.userId;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', async (socket: AuthSocket) => {
    const userId = socket.userId!;
    console.log(`User connected: ${userId}`);

    registerSocket(userId, socket.id);
    socket.join(`user:${userId}`);

    await prisma.user.update({
      where: { id: userId },
      data: { status: 'ONLINE', lastSeen: new Date() },
    });

    io.emit('user:status', { userId, status: 'ONLINE' });

    const userChats = await prisma.chatMember.findMany({
      where: { userId },
      select: { chatId: true },
    });

    userChats.forEach(({ chatId }: { chatId: string }) => {
      socket.join(`chat:${chatId}`);
    });

    socket.on('message:send', async (data) => {
      try {
        const { chatId, content, type, replyToId, clientMessageId } = data;

        const { message, isDuplicate, links, unreadUpdates } = await sendChatMessage({
          chatId,
          senderId: userId,
          content,
          type: type || 'TEXT',
          replyToId,
          clientMessageId,
        });

        if (!isDuplicate) {
          io.to(`chat:${chatId}`).emit('message:new', message);
          unreadUpdates.forEach((update) => {
            io.to(`user:${update.userId}`).emit('chat:unread-updated', update);
          });
        } else {
          socket.emit('message:sent', message);
        }

        if (links.length > 0) {
          attachLinkPreview(message.id, chatId, links[0], (updatedMessage) => {
            io.to(`chat:${chatId}`).emit('message:update', updatedMessage);
          }).catch(console.error);
        }

        const chatMembers = await prisma.chatMember.findMany({
          where: { chatId },
          include: { user: true },
        });

        for (const member of chatMembers) {
          if (
            member.userId !== userId &&
            member.user.telegramId &&
            member.user.telegramNotifications &&
            !hasActiveSocket(member.userId)
          ) {
            const senderName = message.sender.displayName || message.sender.username;
            await telegramService.sendNotification(
              member.user.telegramId,
              `Новое сообщение от *${senderName}*\n\n${content}`
            );
          }
        }

        const bridges = await prisma.telegramChatBridge.findMany({
          where: {
            stogramChatId: chatId,
            isActive: true,
          },
        });

        for (const bridge of bridges) {
          try {
            await telegramService.syncMessageToTelegram(bridge.id, message);
          } catch (error) {
            console.error('Failed to sync message to Telegram:', error);
          }
        }
      } catch (error) {
        console.error('Message send error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    socket.on('message:typing', async ({ chatId, isTyping }) => {
      try {
        const membership = await ensureChatMembership(chatId, userId);
        if (!membership) {
          return socket.emit('error', { message: 'Not a member of this chat' });
        }

        socket.to(`chat:${chatId}`).emit('user:typing', {
          userId,
          chatId,
          isTyping,
        });
      } catch (error) {
        console.error('Message typing error:', error);
      }
    });

    socket.on('message:read', async ({ messageId }) => {
      try {
        const message = await getAccessibleMessage(messageId, userId);

        if (message) {
          const unreadUpdate = await markChatReadThroughMessage(message.chatId, userId, messageId);

          io.to(`chat:${message.chatId}`).emit('message:read', {
            messageId,
            userId,
          });
          if (unreadUpdate) {
            io.to(`user:${userId}`).emit('chat:unread-updated', unreadUpdate);
          }
        }
      } catch (error) {
        console.error('Message read error:', error);
      }
    });

    socket.on('call:initiate', async (data) => {
      try {
        const { chatId, type } = data;
        const chat = await prisma.chat.findFirst({
          where: {
            id: chatId,
            members: {
              some: { userId },
            },
          },
          include: {
            members: {
              select: { userId: true },
            },
          },
        });

        if (!chat) {
          return socket.emit('error', { message: 'Not a member of this chat' });
        }

        if (chat.type !== 'PRIVATE') {
          return socket.emit('error', { message: 'Calls are currently supported only in private chats' });
        }

        const existingCall = await prisma.call.findFirst({
          where: {
            chatId,
            status: { in: ['CALLING', 'ACTIVE'] },
          },
        });

        if (existingCall) {
          return socket.emit('error', { message: 'A call is already in progress in this chat' });
        }

        const call = await prisma.call.create({
          data: {
            chatId,
            initiatorId: userId,
            type: type || 'AUDIO',
            status: 'CALLING',
          },
          include: {
            initiator: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
              },
            },
          },
        });

        await prisma.callParticipant.create({
          data: {
            callId: call.id,
            userId,
          },
        });

        for (const member of chat.members) {
          if (member.userId !== userId) {
            emitToUser(io, member.userId, 'call:incoming', call);
          }
        }

        socket.emit('call:initiated', { callId: call.id, call });
        scheduleMissedCallTimeout(io, call.id, chatId);
      } catch (error) {
        console.error('Call initiate error:', error);
        socket.emit('error', { message: 'Failed to initiate call' });
      }
    });

    socket.on('call:answer', async ({ callId }) => {
      try {
        const call = await prisma.call.findUnique({
          where: { id: callId },
          include: {
            chat: {
              include: {
                members: {
                  select: { userId: true },
                },
              },
            },
          },
        });

        if (!call) {
          return socket.emit('error', { message: 'Call not found' });
        }

        if (call.status !== 'CALLING') {
          return socket.emit('error', { message: 'Call is no longer available' });
        }

        if (!call.chat.members.some((member) => member.userId === userId)) {
          return socket.emit('error', { message: 'Not allowed to answer this call' });
        }

        if (call.initiatorId === userId) {
          return socket.emit('error', { message: 'Initiator cannot answer their own call' });
        }

        await prisma.call.update({
          where: { id: callId },
          data: { status: 'ACTIVE' },
        });

        await prisma.callParticipant.upsert({
          where: {
            callId_userId: {
              callId,
              userId,
            },
          },
          update: {
            leftAt: null,
          },
          create: {
            callId,
            userId,
          },
        });

        clearCallTimeout(callId);
        io.to(`chat:${call.chatId}`).emit('call:answered', { callId, userId });
      } catch (error) {
        console.error('Call answer error:', error);
      }
    });

    socket.on('call:reject', async ({ callId }) => {
      try {
        const call = await prisma.call.findUnique({
          where: { id: callId },
          include: {
            chat: {
              include: {
                members: {
                  select: { userId: true },
                },
              },
            },
          },
        });

        if (!call) {
          return socket.emit('error', { message: 'Call not found' });
        }

        if (!call.chat.members.some((member) => member.userId === userId)) {
          return socket.emit('error', { message: 'Not allowed to reject this call' });
        }

        if (!['CALLING', 'ACTIVE'].includes(call.status)) {
          return socket.emit('error', { message: 'Call is no longer active' });
        }

        await prisma.call.update({
          where: { id: callId },
          data: { status: 'DECLINED', endedAt: new Date() },
        });

        await prisma.callParticipant.updateMany({
          where: {
            callId,
            userId,
            leftAt: null,
          },
          data: {
            leftAt: new Date(),
          },
        });

        clearCallTimeout(callId);
        io.to(`chat:${call.chatId}`).emit('call:rejected', { callId, userId });
      } catch (error) {
        console.error('Call reject error:', error);
      }
    });

    socket.on('call:end', async ({ callId }) => {
      try {
        const call = await prisma.call.findUnique({
          where: { id: callId },
          include: {
            chat: {
              include: {
                members: {
                  select: { userId: true },
                },
              },
            },
          },
        });

        if (!call) {
          return socket.emit('error', { message: 'Call not found' });
        }

        if (!call.chat.members.some((member) => member.userId === userId)) {
          return socket.emit('error', { message: 'Not allowed to end this call' });
        }

        if (!['CALLING', 'ACTIVE'].includes(call.status)) {
          return socket.emit('error', { message: 'Call is already ended' });
        }

        await prisma.call.update({
          where: { id: callId },
          data: { status: 'ENDED', endedAt: new Date() },
        });

        await prisma.callParticipant.updateMany({
          where: {
            callId,
            leftAt: null,
          },
          data: {
            leftAt: new Date(),
          },
        });

        clearCallTimeout(callId);
        io.to(`chat:${call.chatId}`).emit('call:ended', { callId });
      } catch (error) {
        console.error('Call end error:', error);
      }
    });

    socket.on('call:toggle-recording', async ({ callId, isRecording }) => {
      try {
        const call = await prisma.call.findUnique({
          where: { id: callId },
        });

        if (!call) {
          return socket.emit('error', { message: 'Call not found' });
        }

        if (call.initiatorId !== userId) {
          return socket.emit('error', { message: 'Only initiator can control recording' });
        }

        await prisma.call.update({
          where: { id: callId },
          data: { isRecording },
        });

        io.to(`call:${callId}`).emit('call:recording-status', { callId, isRecording });
      } catch (error) {
        console.error('Call recording toggle error:', error);
      }
    });

    // =====================================================
    // GROUP CALL HANDLERS
    // =====================================================

    /**
     * call:group:initiate - Initiate a group call in a chat
     * 
     * Expected payload:
     *   - chatId: string - The chat to start the call in
     *   - type: 'AUDIO' | 'VIDEO' - Type of call
     */
    socket.on('call:group:initiate', async (data) => {
      try {
        const { chatId, type } = data;

        // Verify user is a member of the chat
        const chat = await prisma.chat.findFirst({
          where: {
            id: chatId,
            members: {
              some: { userId },
            },
          },
          include: {
            members: {
              select: { userId: true },
            },
          },
        });

        if (!chat) {
          return socket.emit('error', { message: 'Not a member of this chat' });
        }

        // Check if there's already an active group call in this chat
        const existingCall = await prisma.call.findFirst({
          where: {
            chatId,
            status: { in: ['CALLING', 'ACTIVE'] },
          },
        });

        if (existingCall) {
          return socket.emit('error', { message: 'A call is already in progress in this chat' });
        }

        // Create the group call
        const call = await prisma.call.create({
          data: {
            chatId,
            initiatorId: userId,
            type: type || 'AUDIO',
            status: 'CALLING',
          },
          include: {
            initiator: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
              },
            },
            participants: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatar: true,
                  },
                },
              },
            },
          },
        });

        // Join the call initiator to the call room
        socket.join(`call:${call.id}`);

        // Add initiator as a participant
        await prisma.callParticipant.create({
          data: {
            callId: call.id,
            userId,
          },
        });

        // Notify all chat members about the incoming group call
        for (const member of chat.members) {
          if (member.userId !== userId) {
            emitToUser(io, member.userId, 'call:group:incoming', {
              callId: call.id,
              chatId,
              callType: call.type,
              initiator: call.initiator,
              participants: call.participants,
            });
          }
        }

        // Notify others in the call room about the new participant
        socket.to(`call:${call.id}`).emit('call:group:participant:joined', {
          callId: call.id,
          userId,
          user: call.initiator,
        });

        // Confirm to initiator
        socket.emit('call:group:initiated', { callId: call.id, call });

        // Schedule missed call timeout
        scheduleGroupCallTimeout(io, call.id, chatId);
      } catch (error) {
        console.error('Group call initiate error:', error);
        socket.emit('error', { message: 'Failed to initiate group call' });
      }
    });

    /**
     * call:group:join - Join an existing group call
     * 
     * Expected payload:
     *   - callId: string - The call to join
     */
    socket.on('call:group:join', async ({ callId }) => {
      try {
        // Find the call
        const call = await prisma.call.findUnique({
          where: { id: callId },
          include: {
            chat: {
              include: {
                members: {
                  select: { userId: true },
                },
              },
            },
            participants: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatar: true,
                  },
                },
              },
            },
          },
        });

        if (!call) {
          return socket.emit('error', { message: 'Call not found' });
        }

        if (!['CALLING', 'ACTIVE'].includes(call.status)) {
          return socket.emit('error', { message: 'Call is no longer active' });
        }

        // Verify user is a member of the chat
        const isMember = call.chat.members.some((member) => member.userId === userId);
        if (!isMember) {
          return socket.emit('error', { message: 'Not a member of this chat' });
        }

        // Check if user already joined
        const existingParticipant = call.participants.find((p) => p.userId === userId);
        if (existingParticipant && !existingParticipant.leftAt) {
          return socket.emit('error', { message: 'Already joined this call' });
        }

        // Join the call room
        socket.join(`call:${call.id}`);

        // Add or update participant
        if (existingParticipant) {
          await prisma.callParticipant.update({
            where: { id: existingParticipant.id },
            data: { leftAt: null },
          });
        } else {
          await prisma.callParticipant.create({
            data: {
              callId,
              userId,
            },
          });
        }

        // If this is the first participant answering, set call to ACTIVE
        if (call.status === 'CALLING') {
          await prisma.call.update({
            where: { id: callId },
            data: { status: 'ACTIVE' },
          });
          clearCallTimeout(callId);
        }

        // Get updated participant list
        const updatedCall = await prisma.call.findUnique({
          where: { id: callId },
          include: {
            participants: {
              where: { leftAt: null },
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatar: true,
                  },
                },
              },
            },
          },
        });

        // Notify the user they joined successfully
        socket.emit('call:group:joined', {
          callId,
          participants: updatedCall?.participants || [],
        });

        // Notify others in the call
        socket.to(`call:${callId}`).emit('call:group:participant:joined', {
          callId,
          userId,
          user: updatedCall?.participants.find((p) => p.userId === userId)?.user,
        });
      } catch (error) {
        console.error('Group call join error:', error);
        socket.emit('error', { message: 'Failed to join group call' });
      }
    });

    /**
     * call:group:leave - Leave a group call
     * 
     * Expected payload:
     *   - callId: string - The call to leave
     */
    socket.on('call:group:leave', async ({ callId }) => {
      try {
        const call = await prisma.call.findUnique({
          where: { id: callId },
          include: {
            participants: {
              where: { leftAt: null },
            },
          },
        });

        if (!call) {
          return socket.emit('error', { message: 'Call not found' });
        }

        if (!['CALLING', 'ACTIVE'].includes(call.status)) {
          return socket.emit('error', { message: 'Call is no longer active' });
        }

        // Mark participant as left
        await prisma.callParticipant.updateMany({
          where: {
            callId,
            userId,
            leftAt: null,
          },
          data: {
            leftAt: new Date(),
          },
        });

        // Leave the socket room
        socket.leave(`call:${callId}`);

        // Notify others about the participant leaving
        io.to(`call:${callId}`).emit('call:group:participant:left', {
          callId,
          userId,
        });

        // Check if call should be ended (no participants left)
        const remainingParticipants = await prisma.callParticipant.findMany({
          where: {
            callId,
            leftAt: null,
          },
        });

        if (remainingParticipants.length === 0) {
          // No participants left, end the call
          await prisma.call.update({
            where: { id: callId },
            data: { status: 'ENDED', endedAt: new Date() },
          });

          clearCallTimeout(callId);
          io.to(`call:${callId}`).emit('call:group:ended', { callId, reason: 'no_participants' });
        } else if (remainingParticipants.length === 1 && call.initiatorId === userId) {
          // Initiator left with only one participant - end the call
          await prisma.call.update({
            where: { id: callId },
            data: { status: 'ENDED', endedAt: new Date() },
          });

          clearCallTimeout(callId);
          io.to(`call:${callId}`).emit('call:group:ended', { callId, reason: 'initiator_left' });
        }

        socket.emit('call:group:left', { callId });
      } catch (error) {
        console.error('Group call leave error:', error);
        socket.emit('error', { message: 'Failed to leave group call' });
      }
    });

    /**
     * call:group:end - End a group call (initiator only)
     * 
     * Expected payload:
     *   - callId: string - The call to end
     */
    socket.on('call:group:end', async ({ callId }) => {
      try {
        const call = await prisma.call.findUnique({
          where: { id: callId },
        });

        if (!call) {
          return socket.emit('error', { message: 'Call not found' });
        }

        if (!['CALLING', 'ACTIVE'].includes(call.status)) {
          return socket.emit('error', { message: 'Call is no longer active' });
        }

        // Only initiator can end the call
        if (call.initiatorId !== userId) {
          return socket.emit('error', { message: 'Only the initiator can end this call' });
        }

        // Mark all participants as left
        await prisma.callParticipant.updateMany({
          where: {
            callId,
            leftAt: null,
          },
          data: {
            leftAt: new Date(),
          },
        });

        // End the call
        await prisma.call.update({
          where: { id: callId },
          data: { status: 'ENDED', endedAt: new Date() },
        });

        clearCallTimeout(callId);

        // Notify all participants the call has ended
        io.to(`call:${callId}`).emit('call:group:ended', { callId, reason: 'ended_by_initiator' });
      } catch (error) {
        console.error('Group call end error:', error);
        socket.emit('error', { message: 'Failed to end group call' });
      }
    });

    /**
     * call:group:invite - Invite a user to an ongoing group call
     * 
     * Expected payload:
     *   - callId: string - The call ID
     *   - userId: string - The user to invite
     */
    socket.on('call:group:invite', async ({ callId, targetUserId }) => {
      try {
        const call = await prisma.call.findUnique({
          where: { id: callId },
          include: {
            chat: {
              include: {
                members: {
                  select: { userId: true },
                },
              },
            },
          },
        });

        if (!call) {
          return socket.emit('error', { message: 'Call not found' });
        }

        if (!['CALLING', 'ACTIVE'].includes(call.status)) {
          return socket.emit('error', { message: 'Call is no longer active' });
        }

        // Check if user is in the chat
        const isMember = call.chat.members.some((member) => member.userId === targetUserId);
        if (!isMember) {
          return socket.emit('error', { message: 'User is not a member of this chat' });
        }

        // Get initiator info
        const initiator = await prisma.user.findUnique({
          where: { id: call.initiatorId },
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
          },
        });

        // Send invitation to target user
        emitToUser(io, targetUserId, 'call:group:invite', {
          callId,
          chatId: call.chatId,
          callType: call.type,
          initiator,
        });

        socket.emit('call:group:invited', { callId, userId: targetUserId });
      } catch (error) {
        console.error('Group call invite error:', error);
        socket.emit('error', { message: 'Failed to invite user to call' });
      }
    });

    /**
     * call:group:participants - Get list of participants in a group call
     * 
     * Expected payload:
     *   - callId: string - The call ID
     */
    socket.on('call:group:participants', async ({ callId }) => {
      try {
        const call = await prisma.call.findUnique({
          where: { id: callId },
          include: {
            participants: {
              where: { leftAt: null },
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatar: true,
                  },
                },
              },
            },
          },
        });

        if (!call) {
          return socket.emit('error', { message: 'Call not found' });
        }

        socket.emit('call:group:participants:list', {
          callId,
          participants: call.participants,
        });
      } catch (error) {
        console.error('Group call participants error:', error);
        socket.emit('error', { message: 'Failed to get participants' });
      }
    });

    socket.on('call:save-recording', async ({ callId, recordingUrl }) => {
      try {
        const call = await prisma.call.findUnique({
          where: { id: callId },
        });

        if (!call) {
          return socket.emit('error', { message: 'Call not found' });
        }

        if (call.initiatorId !== userId) {
          return socket.emit('error', { message: 'Only initiator can save recording' });
        }

        await prisma.call.update({
          where: { id: callId },
          data: { recordingUrl, isRecording: false },
        });

        io.to(`chat:${call.chatId}`).emit('call:recording-saved', { callId, recordingUrl });
      } catch (error) {
        console.error('Call save recording error:', error);
      }
    });

    socket.on('webrtc:offer', async ({ callId, to, offer }) => {
      const call = await prisma.call.findUnique({
        where: { id: callId },
        include: {
          chat: {
            include: {
              members: {
                select: { userId: true },
              },
            },
          },
        },
      });

      if (!call || !['CALLING', 'ACTIVE'].includes(call.status)) {
        return;
      }

      const memberIds = new Set(call.chat.members.map((member) => member.userId));
      if (!memberIds.has(userId) || !memberIds.has(to)) {
        return socket.emit('error', { message: 'Invalid WebRTC target' });
      }

      emitToUser(io, to, 'webrtc:offer', {
        callId,
        from: userId,
        offer,
      });
    });

    socket.on('webrtc:answer', async ({ callId, to, answer }) => {
      const call = await prisma.call.findUnique({
        where: { id: callId },
        include: {
          chat: {
            include: {
              members: {
                select: { userId: true },
              },
            },
          },
        },
      });

      if (!call || !['CALLING', 'ACTIVE'].includes(call.status)) {
        return;
      }

      const memberIds = new Set(call.chat.members.map((member) => member.userId));
      if (!memberIds.has(userId) || !memberIds.has(to)) {
        return socket.emit('error', { message: 'Invalid WebRTC target' });
      }

      emitToUser(io, to, 'webrtc:answer', {
        callId,
        from: userId,
        answer,
      });
    });

    socket.on('webrtc:ice-candidate', async ({ callId, to, candidate }) => {
      const call = await prisma.call.findUnique({
        where: { id: callId },
        include: {
          chat: {
            include: {
              members: {
                select: { userId: true },
              },
            },
          },
        },
      });

      if (!call || !['CALLING', 'ACTIVE'].includes(call.status)) {
        return;
      }

      const memberIds = new Set(call.chat.members.map((member) => member.userId));
      if (!memberIds.has(userId) || !memberIds.has(to)) {
        return socket.emit('error', { message: 'Invalid WebRTC target' });
      }

      emitToUser(io, to, 'webrtc:ice-candidate', {
        callId,
        from: userId,
        candidate,
      });
    });

    // =====================================================
    // GROUP CALL WEBRTC SIGNALING
    // =====================================================

    /**
     * call:group:webrtc:offer - Send WebRTC offer to a specific participant in group call
     */
    socket.on('call:group:webrtc:offer', async ({ callId, to, offer }) => {
      try {
        const call = await prisma.call.findUnique({
          where: { id: callId },
          include: {
            participants: {
              where: { leftAt: null },
            },
          },
        });

        if (!call || !['CALLING', 'ACTIVE'].includes(call.status)) {
          return;
        }

        // Verify the sender is a participant
        const isParticipant = call.participants.some((p) => p.userId === userId);
        if (!isParticipant) {
          return socket.emit('error', { message: 'Not a participant of this call' });
        }

        // Verify the target is a participant
        const isTargetParticipant = call.participants.some((p) => p.userId === to);
        if (!isTargetParticipant) {
          return socket.emit('error', { message: 'Target is not a participant of this call' });
        }

        emitToUser(io, to, 'call:group:webrtc:offer', {
          callId,
          from: userId,
          offer,
        });
      } catch (error) {
        console.error('Group WebRTC offer error:', error);
        socket.emit('error', { message: 'Failed to send WebRTC offer' });
      }
    });

    /**
     * call:group:webrtc:answer - Send WebRTC answer to a specific participant in group call
     */
    socket.on('call:group:webrtc:answer', async ({ callId, to, answer }) => {
      try {
        const call = await prisma.call.findUnique({
          where: { id: callId },
          include: {
            participants: {
              where: { leftAt: null },
            },
          },
        });

        if (!call || !['CALLING', 'ACTIVE'].includes(call.status)) {
          return;
        }

        // Verify the sender is a participant
        const isParticipant = call.participants.some((p) => p.userId === userId);
        if (!isParticipant) {
          return socket.emit('error', { message: 'Not a participant of this call' });
        }

        // Verify the target is a participant
        const isTargetParticipant = call.participants.some((p) => p.userId === to);
        if (!isTargetParticipant) {
          return socket.emit('error', { message: 'Target is not a participant of this call' });
        }

        emitToUser(io, to, 'call:group:webrtc:answer', {
          callId,
          from: userId,
          answer,
        });
      } catch (error) {
        console.error('Group WebRTC answer error:', error);
        socket.emit('error', { message: 'Failed to send WebRTC answer' });
      }
    });

    /**
     * call:group:webrtc:ice-candidate - Send ICE candidate to a specific participant in group call
     */
    socket.on('call:group:webrtc:ice-candidate', async ({ callId, to, candidate }) => {
      try {
        const call = await prisma.call.findUnique({
          where: { id: callId },
          include: {
            participants: {
              where: { leftAt: null },
            },
          },
        });

        if (!call || !['CALLING', 'ACTIVE'].includes(call.status)) {
          return;
        }

        // Verify the sender is a participant
        const isParticipant = call.participants.some((p) => p.userId === userId);
        if (!isParticipant) {
          return socket.emit('error', { message: 'Not a participant of this call' });
        }

        // Verify the target is a participant
        const isTargetParticipant = call.participants.some((p) => p.userId === to);
        if (!isTargetParticipant) {
          return socket.emit('error', { message: 'Target is not a participant of this call' });
        }

        emitToUser(io, to, 'call:group:webrtc:ice-candidate', {
          callId,
          from: userId,
          candidate,
        });
      } catch (error) {
        console.error('Group WebRTC ICE candidate error:', error);
        socket.emit('error', { message: 'Failed to send ICE candidate' });
      }
    });

    /**
     * call:group:webrtc:relay - Relay signaling data to all other participants (mesh approach)
     * This is used when a participant sends signaling data and it needs to be broadcast to others
     */
    socket.on('call:group:webrtc:relay', async ({ callId, type, data }) => {
      try {
        const call = await prisma.call.findUnique({
          where: { id: callId },
          include: {
            participants: {
              where: { leftAt: null },
            },
          },
        });

        if (!call || !['CALLING', 'ACTIVE'].includes(call.status)) {
          return;
        }

        // Verify the sender is a participant
        const isParticipant = call.participants.some((p) => p.userId === userId);
        if (!isParticipant) {
          return socket.emit('error', { message: 'Not a participant of this call' });
        }

        // Broadcast to all other participants
        const eventMap = {
          'offer': 'call:group:webrtc:offer',
          'answer': 'call:group:webrtc:answer',
          'ice-candidate': 'call:group:webrtc:ice-candidate',
        };

        const event = eventMap[type as keyof typeof eventMap];
        if (!event) {
          return socket.emit('error', { message: 'Invalid signaling type' });
        }

        for (const participant of call.participants) {
          if (participant.userId !== userId) {
            emitToUser(io, participant.userId, event, {
              callId,
              from: userId,
              ...data,
            });
          }
        }
      } catch (error) {
        console.error('Group WebRTC relay error:', error);
        socket.emit('error', { message: 'Failed to relay WebRTC signaling' });
      }
    });

    socket.on('chat:pin-message', async ({ chatId, messageId }) => {
      try {
        try {
          await assertCanPinMessage(chatId, userId);
        } catch {
          return socket.emit('error', { message: 'Only owners and admins can pin messages' });
        }

        const message = await prisma.message.findUnique({
          where: { id: messageId },
        });

        if (!message || message.chatId !== chatId) {
          return socket.emit('error', { message: 'Message not found' });
        }

        const chat = await prisma.chat.update({
          where: { id: chatId },
          data: { pinnedMessageId: messageId },
          include: {
            pinnedMessage: {
              include: {
                sender: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatar: true,
                  },
                },
              },
            },
          },
        });

        io.to(`chat:${chatId}`).emit('chat:pin-updated', { chat });
      } catch (error) {
        console.error('Pin message socket error:', error);
        socket.emit('error', { message: 'Failed to pin message' });
      }
    });

    socket.on('chat:unpin-message', async ({ chatId }) => {
      try {
        try {
          await assertCanPinMessage(chatId, userId);
        } catch {
          return socket.emit('error', { message: 'Only owners and admins can unpin messages' });
        }

        const chat = await prisma.chat.update({
          where: { id: chatId },
          data: { pinnedMessageId: null },
          include: {
            pinnedMessage: {
              include: {
                sender: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatar: true,
                  },
                },
              },
            },
          },
        });

        io.to(`chat:${chatId}`).emit('chat:pin-updated', { chat });
      } catch (error) {
        console.error('Unpin message socket error:', error);
        socket.emit('error', { message: 'Failed to unpin message' });
      }
    });

    socket.on('chat:update-notifications', async ({ chatId, level }) => {
      try {
        const isMember = await prisma.chatMember.findFirst({
          where: { chatId, userId },
        });

        if (!isMember) {
          return socket.emit('error', { message: 'Not a member of this chat' });
        }

        const settings = await prisma.chatSettings.upsert({
          where: {
            userId_chatId: {
              userId,
              chatId,
            },
          },
          update: {
            notificationLevel: level,
            isMuted: level === 'MUTED',
          },
          create: {
            userId,
            chatId,
            notificationLevel: level,
            isMuted: level === 'MUTED',
          },
        });

        socket.emit('chat:notification-updated', { settings });
      } catch (error) {
        console.error('Update notification socket error:', error);
        socket.emit('error', { message: 'Failed to update notification settings' });
      }
    });

    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${userId}`);
      unregisterSocket(userId, socket.id);

      if (hasActiveSocket(userId)) {
        return;
      }

      await prisma.user.update({
        where: { id: userId },
        data: { status: 'OFFLINE', lastSeen: new Date() },
      });

      io.emit('user:status', { userId, status: 'OFFLINE' });
    });
  });
};
