import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';
import { z } from 'zod';
import n8nService from '../services/n8nService';
import {
  assertCanPinMessage,
  checkChatAdminPermission,
  checkChatOwnership,
} from '../utils/permissions';

const createChatSchema = z.object({
  type: z.enum(['PRIVATE', 'GROUP', 'CHANNEL']),
  name: z.string().optional(),
  description: z.string().optional(),
  memberIds: z.array(z.string()),
});

const pinMessageSchema = z.object({
  messageId: z.string(),
});

export const createChat = async (req: AuthRequest, res: Response) => {
  try {
    const { type, name, description, memberIds } = createChatSchema.parse(req.body);
    const userId = req.userId!;

    if (type === 'PRIVATE' && memberIds.length !== 1) {
      return res.status(400).json({ error: 'Private chat requires exactly one member' });
    }

    if (type === 'PRIVATE') {
      const existingChats = await prisma.chat.findMany({
        where: {
          type: 'PRIVATE',
          AND: [
            { members: { some: { userId } } },
            { members: { some: { userId: memberIds[0] } } },
          ],
        },
        include: {
          members: {
            include: { user: true },
          },
        },
      });
      const participantIds = new Set([userId, memberIds[0]]);
      const existingChat = existingChats.find((chat) => (
        chat.members.length === participantIds.size &&
        chat.members.every((member) => participantIds.has(member.userId))
      ));

      if (existingChat) {
        return res.json(existingChat);
      }
    }

    const chat = await prisma.chat.create({
      data: {
        type,
        name,
        description,
        members: {
          create: [
            { userId, role: 'OWNER' },
            ...memberIds.map((id) => ({ userId: id, role: 'MEMBER' as const })),
          ],
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                status: true,
              },
            },
          },
        },
      },
    });

    // Send n8n webhook event (async, don't wait)
    n8nService.deliverWebhookEvent('new_chat', {
      chatId: chat.id,
      type: chat.type,
      name: chat.name,
      createdBy: userId,
      memberIds: [userId, ...memberIds],
      timestamp: chat.createdAt.toISOString(),
    }).catch(console.error);

    res.status(201).json(chat);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Create chat error:', error);
    res.status(500).json({ error: 'Failed to create chat' });
  }
};

export const getChats = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { limit = 50, offset = 0 } = req.query;
    const normalizedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const normalizedOffset = Math.max(Number(offset) || 0, 0);

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get total count for pagination
    const totalCount = await prisma.chat.count({
      where: {
        members: {
          some: { userId },
        },
      },
    });

    // Get paginated chats with optimized query - use select instead of include for members
    // to avoid N+1, then fetch members separately
    const chats = await prisma.chat.findMany({
      where: {
        members: {
          some: { userId },
        },
      },
      select: {
        id: true,
        name: true,
        type: true,
        avatar: true,
        description: true,
        isSecret: true,
        pinnedMessageId: true,
        createdAt: true,
        updatedAt: true,
        members: {
          select: {
            id: true,
            userId: true,
            role: true,
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                status: true,
                lastSeen: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: normalizedLimit,
      skip: normalizedOffset,
    });

    // Fetch last message for each chat in a single query to avoid N+1
    const chatIds = chats.map(c => c.id);
    const lastMessages = await prisma.message.findMany({
      where: {
        chatId: { in: chatIds },
        isDeleted: false,
      },
      orderBy: { createdAt: 'desc' },
      distinct: ['chatId'],
      select: {
        id: true,
        chatId: true,
        content: true,
        type: true,
        createdAt: true,
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
          },
        },
      },
    });

    // Create a map for quick lookup
    const lastMessageMap = new Map(lastMessages.map(m => [m.chatId, m]));

    // Fetch pinned messages if any
    const pinnedMessageIds = chats
      .map(c => c.pinnedMessageId)
      .filter((id): id is string => id !== null);
    
    const pinnedMessages = pinnedMessageIds.length > 0
      ? await prisma.message.findMany({
          where: { id: { in: pinnedMessageIds } },
          select: {
            id: true,
            chatId: true,
            content: true,
            sender: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
              },
            },
          },
        })
      : [];
    
    const pinnedMessageMap = new Map(pinnedMessages.map(m => [m.id, m]));

    // Combine data
    const enrichedChats = chats.map(chat => ({
      ...chat,
      messages: lastMessageMap.has(chat.id) ? [lastMessageMap.get(chat.id)] : [],
      pinnedMessage: chat.pinnedMessageId && pinnedMessageMap.has(chat.pinnedMessageId)
        ? pinnedMessageMap.get(chat.pinnedMessageId)
        : null,
    }));

    res.json({
      chats: enrichedChats,
      pagination: {
        total: totalCount,
        limit: normalizedLimit,
        offset: normalizedOffset,
        hasMore: normalizedOffset + chats.length < totalCount,
      },
    });
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch chats',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const getChatById = async (req: AuthRequest, res: Response) => {
  try {
    const { chatId } = req.params;
    const userId = req.userId!;

    const chat = await prisma.chat.findFirst({
      where: {
        id: chatId,
        members: {
          some: { userId },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                status: true,
                lastSeen: true,
              },
            },
          },
        },
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

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    res.json(chat);
  } catch (error) {
    console.error('Get chat error:', error);
    res.status(500).json({ error: 'Failed to fetch chat' });
  }
};

export const updateChat = async (req: AuthRequest, res: Response) => {
  try {
    const { chatId } = req.params;
    const userId = req.userId!;
    const { name, description, avatar } = req.body;

    if (!(await checkChatAdminPermission(chatId, userId))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const chat = await prisma.chat.update({
      where: { id: chatId },
      data: { name, description, avatar },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                status: true,
              },
            },
          },
        },
      },
    });

    res.json(chat);
  } catch (error) {
    console.error('Update chat error:', error);
    res.status(500).json({ error: 'Failed to update chat' });
  }
};

export const deleteChat = async (req: AuthRequest, res: Response) => {
  try {
    const { chatId } = req.params;
    const userId = req.userId!;

    if (!(await checkChatOwnership(chatId, userId))) {
      return res.status(403).json({ error: 'Only owner can delete chat' });
    }

    await prisma.chat.delete({
      where: { id: chatId },
    });

    res.json({ message: 'Chat deleted successfully' });
  } catch (error) {
    console.error('Delete chat error:', error);
    res.status(500).json({ error: 'Failed to delete chat' });
  }
};

export const addMember = async (req: AuthRequest, res: Response) => {
  try {
    const { chatId } = req.params;
    const { userId: newUserId } = req.body;
    const userId = req.userId!;

    if (!(await checkChatAdminPermission(chatId, userId))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const newMember = await prisma.chatMember.create({
      data: {
        chatId,
        userId: newUserId,
        role: 'MEMBER',
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
            status: true,
          },
        },
      },
    });

    res.status(201).json(newMember);
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ error: 'Failed to add member' });
  }
};

export const removeMember = async (req: AuthRequest, res: Response) => {
  try {
    const { chatId, memberId } = req.params;
    const userId = req.userId!;

    if (!(await checkChatAdminPermission(chatId, userId))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    await prisma.chatMember.delete({
      where: {
        id: memberId,
      },
    });

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
};

export const pinMessage = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { chatId } = req.params;
    const { messageId } = pinMessageSchema.parse(req.body);

    try {
      await assertCanPinMessage(chatId, userId);
    } catch {
      return res.status(403).json({ error: 'Only owners and admins can pin messages' });
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message || message.chatId !== chatId) {
      return res.status(404).json({ error: 'Message not found' });
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
        members: {
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

    res.json({ chat, message: 'Message pinned successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Pin message error:', error);
    res.status(500).json({ error: 'Failed to pin message' });
  }
};

export const unpinMessage = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { chatId } = req.params;

    try {
      await assertCanPinMessage(chatId, userId);
    } catch {
      return res.status(403).json({ error: 'Only owners and admins can unpin messages' });
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
        members: {
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

    res.json({ chat, message: 'Message unpinned successfully' });
  } catch (error) {
    console.error('Unpin message error:', error);
    res.status(500).json({ error: 'Failed to unpin message' });
  }
};
