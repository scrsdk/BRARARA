import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';
import { CacheMiddleware } from '../middleware/cache';

export const searchMessages = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { 
      query, 
      chatId, 
      type,
      dateFrom,
      dateTo,
      senderId,
      limit = 50 
    } = req.query;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const normalizedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

    // Get all chats user is member of
    const userChatIds = await prisma.chatMember.findMany({
      where: { userId },
      select: { chatId: true }
    });

    const chatIds = userChatIds.map((cm: { chatId: string }) => cm.chatId);

    // Build where clause with filters
    const whereClause: any = {
      chatId: chatId ? String(chatId) : { in: chatIds },
      isDeleted: false,
    };

    // Text search on content and fileName
    if (query) {
      whereClause.OR = [
        { content: { contains: query, mode: 'insensitive' } },
        { fileName: { contains: query, mode: 'insensitive' } }
      ];
    }

    // Filter by message type
    if (type) {
      const typeFilter = String(type).toUpperCase();
      switch (typeFilter) {
        case 'MEDIA':
          whereClause.type = { in: ['IMAGE', 'VIDEO', 'AUDIO', 'VOICE', 'GIF'] };
          break;
        case 'LINK':
          whereClause.OR = [
            { content: { contains: query, mode: 'insensitive' } },
            { linkPreview: { not: null } }
          ];
          break;
        case 'FILE':
          whereClause.type = { in: ['FILE'] };
          break;
        case 'PHOTO':
          whereClause.type = 'IMAGE';
          break;
        case 'VIDEO':
          whereClause.type = 'VIDEO';
          break;
        case 'AUDIO':
          whereClause.type = { in: ['AUDIO', 'VOICE'] };
          break;
        case 'DOCUMENT':
          whereClause.type = 'FILE';
          break;
        default:
          whereClause.type = typeFilter;
      }
    }

    // Filter by date range
    if (dateFrom) {
      whereClause.createdAt = {
        ...whereClause.createdAt,
        gte: new Date(String(dateFrom))
      };
    }
    if (dateTo) {
      whereClause.createdAt = {
        ...whereClause.createdAt,
        lte: new Date(String(dateTo))
      };
    }

    // Filter by sender
    if (senderId) {
      whereClause.senderId = String(senderId);
    }

    const messages = await prisma.message.findMany({
      where: whereClause,
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true
          }
        },
        chat: {
          select: {
            id: true,
            name: true,
            type: true,
            avatar: true
          }
        },
        replyTo: {
          select: {
            id: true,
            content: true,
            sender: {
              select: {
                username: true,
                displayName: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: normalizedLimit
    });

    // Save search to history (async, don't block response)
    saveSearchHistory(userId, query, { type, dateFrom, dateTo, senderId, chatId }).catch(console.error);

    res.json({ messages });
  } catch (error) {
    console.error('Search messages error:', error);
    res.status(500).json({ error: 'Failed to search messages' });
  }
};

export const searchByHashtag = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { hashtag } = req.params;

    if (!hashtag) {
      return res.status(400).json({ error: 'Hashtag is required' });
    }

    const userChatIds = await prisma.chatMember.findMany({
      where: { userId },
      select: { chatId: true }
    });

    const chatIds = userChatIds.map((cm: { chatId: string }) => cm.chatId);

    const messages = await prisma.message.findMany({
      where: {
        chatId: { in: chatIds },
        isDeleted: false,
        hashtags: { contains: hashtag }
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true
          }
        },
        chat: {
          select: {
            id: true,
            name: true,
            type: true,
            avatar: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    res.json({ messages });
  } catch (error) {
    console.error('Search by hashtag error:', error);
    res.status(500).json({ error: 'Failed to search by hashtag' });
  }
};

export const searchByMention = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const username = req.params.username || req.user?.username;

    const userChatIds = await prisma.chatMember.findMany({
      where: { userId },
      select: { chatId: true }
    });

    const chatIds = userChatIds.map((cm: { chatId: string }) => cm.chatId);

    const messages = await prisma.message.findMany({
      where: {
        chatId: { in: chatIds },
        isDeleted: false,
        mentions: { contains: username }
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true
          }
        },
        chat: {
          select: {
            id: true,
            name: true,
            type: true,
            avatar: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    res.json({ messages });
  } catch (error) {
    console.error('Search by mention error:', error);
    res.status(500).json({ error: 'Failed to search mentions' });
  }
};

// Save search query to history
async function saveSearchHistory(
  userId: string, 
  query: string, 
  filters: { type?: unknown; dateFrom?: unknown; dateTo?: unknown; senderId?: unknown; chatId?: unknown }
): Promise<void> {
  try {
    // Delete old entries if we exceed 10 searches
    const count = await prisma.searchHistory.count({
      where: { userId }
    });

    if (count >= 10) {
      // Delete the oldest entries
      const oldestEntries = await prisma.searchHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        take: count - 9,
        select: { id: true }
      });
      
      await prisma.searchHistory.deleteMany({
        where: {
          id: { in: oldestEntries.map(e => e.id) }
        }
      });
    }

    // Check if this exact query already exists (update timestamp instead of duplicate)
    const existing = await prisma.searchHistory.findFirst({
      where: { userId, query }
    });

    if (existing) {
      await prisma.searchHistory.update({
        where: { id: existing.id },
        data: { 
          createdAt: new Date(),
          filters: Object.keys(filters).length > 0 ? JSON.stringify(filters) : null
        }
      });
    } else {
      await prisma.searchHistory.create({
        data: {
          userId,
          query,
          filters: Object.keys(filters).length > 0 ? JSON.stringify(filters) : null
        }
      });
    }
  } catch (error) {
    console.error('Save search history error:', error);
  }
}

// Get search history for user
export const getSearchHistory = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const history = await prisma.searchHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        query: true,
        filters: true,
        createdAt: true
      }
    });

    res.json({ history });
  } catch (error) {
    console.error('Get search history error:', error);
    res.status(500).json({ error: 'Failed to get search history' });
  }
};

// Clear search history for user
export const clearSearchHistory = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    await prisma.searchHistory.deleteMany({
      where: { userId }
    });

    res.json({ message: 'Search history cleared' });
  } catch (error) {
    console.error('Clear search history error:', error);
    res.status(500).json({ error: 'Failed to clear search history' });
  }
};

// Delete single search history entry
export const deleteSearchHistoryItem = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { historyId } = req.params;

    await prisma.searchHistory.deleteMany({
      where: { id: historyId, userId }
    });

    res.json({ message: 'Search history item deleted' });
  } catch (error) {
    console.error('Delete search history item error:', error);
    res.status(500).json({ error: 'Failed to delete search history item' });
  }
};
