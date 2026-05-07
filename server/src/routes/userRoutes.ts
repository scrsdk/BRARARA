import { Router } from 'express';
import {
  searchUsers,
  getUserById,
  getCurrentUser,
  updateProfile,
  changePassword,
  getContacts,
  addContact,
  removeContact,
  subscribeToPush,
  updateTheme,
  updatePrivacySettings,
  getPrivacySettings,
  getNotificationPreferences,
  updateNotificationPreferences,
} from '../controllers/userController';
import {
  getSessions,
  revokeSession,
  revokeAllSessions,
} from '../controllers/sessionController';
import {
  getStorageInfo,
  clearCache,
  exportData,
  importData,
} from '../controllers/accountController';
import { authenticate } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { CacheMiddleware } from '../middleware/cache';

const router = Router();

router.use(authenticate);

// Cache user profile lookups (short TTL since status changes frequently)
router.get('/:userId', CacheMiddleware.cache({ ttl: 60, keyPrefix: 'user' }), getUserById);

// Cache current user with shorter TTL
router.get('/me', CacheMiddleware.cache({ ttl: 30, keyPrefix: 'currentUser' }), getCurrentUser);

// Search doesn't need caching (already limited to 20 results)
// Contacts can be cached for a bit longer
router.get('/contacts', CacheMiddleware.cache({ ttl: 120, keyPrefix: 'contacts' }), getContacts);

router.post('/contacts', addContact);
router.delete('/contacts/:contactId', removeContact);
router.get('/privacy', getPrivacySettings);
router.patch('/privacy', updatePrivacySettings);
router.get('/notifications', getNotificationPreferences);
router.patch('/notifications', updateNotificationPreferences);
router.patch('/profile', upload.single('avatar'), updateProfile);
router.post('/change-password', changePassword);
router.post('/push-subscription', subscribeToPush);
router.patch('/theme', updateTheme);

router.get('/sessions', getSessions);
router.delete('/sessions/:id', revokeSession);
router.delete('/sessions', revokeAllSessions);

router.get('/storage', getStorageInfo);
router.post('/storage/clear-cache', clearCache);
router.get('/export', exportData);
router.post('/import', importData);

// Export for cache invalidation
export const invalidateUserCache = async (userId: string) => {
  await CacheMiddleware.invalidate(`user:*${userId}*`);
};

export default router;
