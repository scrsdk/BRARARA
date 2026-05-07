import express from 'express';
import { auth } from '../middleware/auth';
import {
  searchMessages,
  searchByHashtag,
  searchByMention,
  getSearchHistory,
  clearSearchHistory,
  deleteSearchHistoryItem
} from '../controllers/searchController';
import { CacheMiddleware } from '../middleware/cache';

const router = express.Router();

// Search endpoints - don't cache results as they're user-specific and dynamic
router.get('/messages', auth, searchMessages);
router.get('/hashtag/:hashtag', auth, searchByHashtag);
router.get('/mentions/:username?', auth, searchByMention);

// Search history endpoints - cache for a short time
router.get('/history', CacheMiddleware.cache({ ttl: 30, keyPrefix: 'searchHistory' }), auth, getSearchHistory);
router.delete('/history', auth, clearSearchHistory);
router.delete('/history/:historyId', auth, deleteSearchHistoryItem);

export default router;
