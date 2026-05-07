import fs from 'fs';
import path from 'path';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';

const uploadRoot = path.resolve(process.cwd(), process.env.UPLOAD_DIR || './uploads');

const normalizeUploadPath = (rawPath: string) => {
  const withoutPrefix = rawPath.replace(/\\/g, '/').replace(/^\/?uploads\//, '');
  const normalized = path.posix.normalize(withoutPrefix).replace(/^(\.\.(\/|\\|$))+/, '');

  if (!normalized || normalized.startsWith('../') || path.isAbsolute(normalized)) {
    return null;
  }

  const absolutePath = path.resolve(uploadRoot, normalized);
  if (!absolutePath.startsWith(uploadRoot + path.sep) && absolutePath !== uploadRoot) {
    return null;
  }

  return {
    mediaPath: `/uploads/${normalized}`,
    absolutePath,
  };
};

const userCanAccessUploadedPath = async (mediaPath: string, userId: string) => {
  const message = await prisma.message.findFirst({
    where: {
      OR: [
        { fileUrl: mediaPath },
        { thumbnailUrl: mediaPath },
        { originalFileUrl: mediaPath },
      ],
      chat: {
        members: {
          some: { userId },
        },
      },
    },
    select: { id: true },
  });

  if (message) {
    return true;
  }

  const chatAvatar = await prisma.chat.findFirst({
    where: {
      avatar: mediaPath,
      members: {
        some: { userId },
      },
    },
    select: { id: true },
  });

  if (chatAvatar) {
    return true;
  }

  const userAvatar = await prisma.user.findFirst({
    where: {
      avatar: mediaPath,
      OR: [
        { id: userId },
        {
          chatMembers: {
            some: {
              chat: {
                members: {
                  some: { userId },
                },
              },
            },
          },
        },
      ],
    },
    select: { id: true },
  });

  if (userAvatar) {
    return true;
  }

  const publicSticker = await prisma.sticker.findFirst({
    where: {
      imageUrl: mediaPath,
      pack: {
        OR: [
          { isPublic: true },
          { creatorId: userId },
        ],
      },
    },
    select: { id: true },
  });

  if (publicSticker) {
    return true;
  }

  const stickerPack = await prisma.stickerPack.findFirst({
    where: {
      thumbnail: mediaPath,
      OR: [
        { isPublic: true },
        { creatorId: userId },
      ],
    },
    select: { id: true },
  });

  return Boolean(stickerPack);
};

export const serveUploadedMedia = async (req: AuthRequest, res: Response) => {
  try {
    const requestedPath = req.params[0];
    const userId = req.userId!;
    const resolved = normalizeUploadPath(requestedPath);

    if (!resolved || !fs.existsSync(resolved.absolutePath)) {
      return res.status(404).json({ error: 'Media not found' });
    }

    if (!(await userCanAccessUploadedPath(resolved.mediaPath, userId))) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const stat = fs.statSync(resolved.absolutePath);
    const fileSize = stat.size;
    const lastModified = stat.mtime.toUTCString();
    const etag = `W/"${fileSize}-${stat.mtimeMs}"`;

    // Set cache and ETag headers
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', lastModified);
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('Vary', 'Accept-Encoding');

    // Check if client has a matching ETag (conditional request)
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch && ifNoneMatch === etag) {
      return res.status(304).end();
    }

    // Check Last-Modified (fallback for browsers that don't support ETag)
    const ifModifiedSince = req.headers['if-modified-since'];
    if (ifModifiedSince && new Date(ifModifiedSince) >= stat.mtime) {
      return res.status(304).end();
    }

    if (req.query.download === '1') {
      return res.download(resolved.absolutePath);
    }

    return res.sendFile(resolved.absolutePath);
  } catch (error) {
    console.error('Serve media error:', error);
    return res.status(500).json({ error: 'Failed to serve media' });
  }
};
