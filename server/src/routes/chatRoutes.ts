import { Router } from 'express';
import {
  createChat,
  getChats,
  getChatById,
  updateChat,
  deleteChat,
  addMember,
  removeMember,
  pinMessage,
  unpinMessage,
} from '../controllers/chatController';
import { authenticate } from '../middleware/auth';
import { CacheMiddleware } from '../middleware/cache';

const router = Router();

router.use(authenticate);

// Cache GET requests with user-specific keys
router.get('/', CacheMiddleware.cache({ ttl: 30, keyPrefix: 'chats' }), getChats);
router.get('/:chatId', CacheMiddleware.cache({ ttl: 60, keyPrefix: 'chat' }), getChatById);

router.post('/', createChat);
router.patch('/:chatId', updateChat);
router.delete('/:chatId', deleteChat);
router.post('/:chatId/members', addMember);
router.delete('/:chatId/members/:memberId', removeMember);
router.patch('/:chatId/pin', pinMessage);
router.delete('/:chatId/pin', unpinMessage);

// Invalidate chat cache when chat is updated
export const invalidateChatCache = async (chatId: string) => {
  await CacheMiddleware.invalidate(`chat:${chatId}*`);
};

export default router;
