import { Router } from 'express';
import {
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  forwardMessage,
  markAsRead,
} from '../controllers/messageController';
import { authenticate } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { CacheMiddleware } from '../middleware/cache';

const router = Router();

router.use(authenticate);

// Cache messages with chat-specific keys
router.get('/:chatId', CacheMiddleware.cache({ ttl: 30, keyPrefix: 'messages' }), getMessages);

router.post('/:chatId', upload.single('file'), sendMessage);
router.post('/:messageId/forward', forwardMessage);
router.post('/:messageId/read', markAsRead);
router.patch('/:messageId', editMessage);
router.delete('/:messageId', deleteMessage);

// Invalidate messages cache when messages are modified
export const invalidateMessagesCache = async (chatId: string) => {
  await CacheMiddleware.invalidate(`messages:*${chatId}*`);
};

export default router;
