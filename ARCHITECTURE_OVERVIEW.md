# 🏗️ Архитектурный обзор Stogram

## 📐 Общая архитектура системы

```
┌────────────────────────────────────────────────────────────────┐
│                     STOGRAM ECOSYSTEM                          │
└────────────────────────────────────────────────────────────────┘

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   WEB CLIENT     │  │  MOBILE CLIENT   │  │ THIRD PARTY      │
│   (React PWA)    │  │ (React Native)   │  │ (Telegram API)   │
│                  │  │                  │  │                  │
│  Vite + React 18 │  │ React Native     │  │ n8n Integration  │
│  Tailwind CSS    │  │ TypeScript       │  │ Webhooks         │
└────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
         │                     │                     │
         │                     └─────────┬───────────┘
         │                               │
         ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼

┌────────────────────────────────────────────────────────────────┐
│                        API GATEWAY                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │             Express.js Server (Port 5000)               │  │
│  │  - Rate Limiting (IP-based)                             │  │
│  │  - CORS Protection                                      │  │
│  │  - Authentication Middleware (JWT)                      │  │
│  │  - Error Handling                                       │  │
│  │  - Logging & Audit Trails                              │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘

         ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼

┌────────────────────────────────────────────────────────────────┐
│                   BUSINESS LOGIC LAYER                         │
│  ┌────────────────────────────────────────────────────────┐    │
│  │              CONTROLLERS (18)                          │    │
│  │  - Auth  - Chat  - Message  - User  - Bot             │    │
│  │  - Analytics  - Security  - Telegram  - Webhook       │    │
│  └─────────────┬────────────────────────────────────────┘     │
│                │                                              │
│  ┌─────────────▼────────────────────────────────────────┐     │
│  │              SERVICES LAYER (13)                     │     │
│  │  - AuthService         - ChatService                 │     │
│  │  - MessageService      - UserService                 │     │
│  │  - BotService          - EncryptionService           │     │
│  │  - EmailService        - PushService                 │     │
│  │  - TwoFactorService    - TelegramService             │     │
│  │  - AnalyticsService    - AuditLogService             │     │
│  │  - SchedulerService                                  │     │
│  └─────────────┬────────────────────────────────────────┘     │
│                │                                              │
│  ┌─────────────▼────────────────────────────────────────┐     │
│  │           REAL-TIME COMMUNICATION (Socket.IO)        │     │
│  │  - WebSocket Connections                             │     │
│  │  - Event Broadcasting                                │     │
│  │  - Room Management                                   │     │
│  └─────────────┬────────────────────────────────────────┘     │
└────────────────┼───────────────────────────────────────────────┘

         ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼

┌────────────────────────────────────────────────────────────────┐
│                   DATA PERSISTENCE LAYER                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              PRISMA ORM                                │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐   │   │
│  │  │ PostgreSQL   │  │ Redis Cache  │  │ File Storage│   │   │
│  │  │ Database     │  │ (Optional)   │  │ (S3/Local)  │   │   │
│  │  └──────────────┘  └──────────────┘  └─────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

---

## 🔀 API маршруты

```
/api/
├── /auth
│   ├── POST /register
│   ├── POST /login
│   ├── POST /logout
│   ├── POST /refresh-token
│   ├── POST /2fa/setup
│   └── POST /2fa/verify
│
├── /users
│   ├── GET /profile
│   ├── PUT /profile
│   ├── GET /:id
│   ├── GET /search
│   └── DELETE /:id
│
├── /chats
│   ├── GET /
│   ├── POST /
│   ├── GET /:id
│   ├── PUT /:id
│   ├── DELETE /:id
│   └── POST /:id/members
│
├── /messages
│   ├── GET /chat/:chatId
│   ├── POST /
│   ├── PUT /:id
│   ├── DELETE /:id
│   └── GET /:id/reactions
│
├── /bot
│   ├── GET /
│   ├── POST /
│   ├── PUT /:id
│   ├── DELETE /:id
│   └── POST /:id/execute
│
├── /analytics
│   ├── GET /stats
│   ├── GET /users
│   ├── GET /chats
│   └── GET /messages
│
├── /security
│   ├── GET /audit-log
│   ├── GET /sessions
│   ├── DELETE /sessions/:id
│   └── POST /check-compromised
│
├── /telegram
│   ├── POST /webhook
│   ├── GET /channels
│   └── POST /sync
│
├── /search
│   ├── GET /messages?query=&type=&dateFrom=&dateTo=&senderId=&chatId=
│   ├── GET /hashtag/:hashtag
│   ├── GET /mentions/:username?
│   ├── GET /history
│   ├── DELETE /history
│   └── DELETE /history/:historyId
│
├── /webhooks
│   ├── GET /
│   ├── POST /
│   ├── PUT /:id
│   └── DELETE /:id
│
└── /n8n
    ├── POST /execute
    ├── GET /workflows
    └── POST /trigger
```

---

## 🔌 WebSocket Events

### Standard Events
```
CLIENT → SERVER
├── user:login
├── message:send
├── message:typing
├── message:read
├── chat:pin-message
├── chat:unpin-message
└── reaction:add

SERVER → CLIENT
├── message:new
├── message:update
├── message:delete
├── message:read
├── typing:active
├── user:online
├── user:offline
├── user:status
├── chat:updated
├── chat:pin-updated
├── notification:push
└── reaction:new
```

### Call Events (1-on-1)
```
CLIENT → SERVER
├── call:initiate
├── call:answer
├── call:reject
├── call:end
├── call:toggle-recording
├── call:save-recording
├── webrtc:offer
├── webrtc:answer
└── webrtc:ice-candidate

SERVER → CLIENT
├── call:incoming
├── call:initiated
├── call:answered
├── call:rejected
├── call:ended
├── call:missed
├── call:recording-status
└── webrtc:offer/answer/ice-candidate
```

### Group Call Events
```
CLIENT → SERVER
├── call:group:initiate
├── call:group:join
├── call:group:leave
├── call:group:end
├── call:group:invite
├── call:group:participants
├── call:group:webrtc:offer
├── call:group:webrtc:answer
├── call:group:webrtc:ice-candidate
└── call:group:webrtc:relay

SERVER → CLIENT
├── call:group:incoming
├── call:group:initiated
├── call:group:joined
├── call:group:left
├── call:group:ended
├── call:group:participant:joined
├── call:group:participant:left
├── call:group:invite
├── call:group:invited
├── call:group:participants:list
└── call:group:webrtc:offer/answer/ice-candidate
```

---

## 🗂️ Слои приложения

### 1️⃣ Presentation Layer (Клиент)

**Web (React PWA):**
- Components: Переиспользуемые React компоненты
- Pages: Страницы приложения (Home, Chat, Profile и т.д.)
- Hooks: Custom React hooks для логики
- Store: State management (Zustand/Redux)
- Services: HTTP запросы к API

**Mobile (React Native):**
- Screens: Экраны приложения
- Components: React Native компоненты
- Navigation: React Navigation управление
- Store: State management
- Services: API запросы

### 2️⃣ API Layer (Express.js)

- **Routes:** Маршруты API
- **Controllers:** Обработка запросов
- **Middleware:** Проверка аутентификации, валидация, ошибки
- **Validation:** Проверка входных данных

### 3️⃣ Business Logic Layer

- **Services:** Реализация бизнес-логики
- **Encryption:** E2E шифрование (RSA, AES)
- **Authentication:** JWT токены, 2FA
- **Authorization:** Проверка прав доступа
- **Socket.IO:** Реальное время

### 4️⃣ Data Access Layer (Prisma ORM)

- **Models:** Определение схемы БД
- **Queries:** Безопасные запросы
- **Transactions:** ACID гарантии
- **Relations:** Связи между таблицами

### 5️⃣ External Integrations

- **Telegram API:** Синхронизация с Telegram
- **Email Service:** Отправка писем
- **Push Notifications:** Push сервис
- **n8n Workflows:** Автоматизация
- **Webhooks:** Внешние интеграции

---

## 🔐 Безопасность

```
┌─────────────────────────────────────────┐
│      CLIENT REQUEST                     │
└──────────────────┬──────────────────────┘

         ▼

┌─────────────────────────────────────────┐
│      RATE LIMITING (IP-based)           │
│  - Max 100 req/min per IP               │
└──────────────────┬──────────────────────┘

         ▼

┌─────────────────────────────────────────┐
│      CORS VALIDATION                    │
│  - Allowed origins check                │
└──────────────────┬──────────────────────┘

         ▼

┌─────────────────────────────────────────┐
│      AUTHENTICATION (JWT)               │
│  - Token verification                   │
│  - Token refresh logic                  │
└──────────────────┬──────────────────────┘

         ▼

┌─────────────────────────────────────────┐
│      2FA VERIFICATION (if enabled)      │
│  - TOTP code verification               │
│  - Backup codes                         │
└──────────────────┬──────────────────────┘

         ▼

┌─────────────────────────────────────────┐
│      AUTHORIZATION (Permissions)        │
│  - Role-based access                    │
│  - Resource-level permissions           │
└──────────────────┬──────────────────────┘

         ▼

┌─────────────────────────────────────────┐
│      INPUT VALIDATION                   │
│  - Type checking                        │
│  - Length validation                    │
│  - XSS protection                       │
└──────────────────┬──────────────────────┘

         ▼

┌─────────────────────────────────────────┐
│      ENCRYPTION (End-to-End)            │
│  - RSA-2048 for key exchange            │
│  - AES-256 for messages                 │
└──────────────────┬──────────────────────┘

         ▼

┌─────────────────────────────────────────┐
│      AUDIT LOGGING                      │
│  - Track user actions                   │
│  - Security events                      │
└─────────────────────────────────────────┘
```

---

## 🔄 Data Flow Example: Отправка сообщения

```
1. USER SENDS MESSAGE (Web Client)
   ↓
2. React Component: MessageInput.tsx
   - User types message
   - Click "Send" button
   ↓
3. State Update (Zustand/Redux)
   - Message added to local state
   - Optimistic UI update
   ↓
4. API Call (HTTP POST)
   POST /api/messages
   - Headers: Authorization: Bearer JWT
   - Body: { chatId, content, encrypted: true }
   ↓
5. Express Route Handler
   - Route: POST /api/messages
   - Middleware checks: Auth, Validation
   ↓
6. MessageController.create()
   - Validate user permissions
   - Check chat membership
   ↓
7. MessageService.create()
   - Encrypt message (AES-256)
   - Call Prisma to save
   ↓
8. Prisma ORM
   - Execute SQL INSERT
   - Save to PostgreSQL
   ↓
9. WebSocket Broadcast (Socket.IO)
   - Emit 'message:new' event
   - Send to all chat participants
   ↓
10. Other Users Receive
    - Socket listener: socket.on('message:new')
    - Decrypt message (E2E)
    - Update local state
    - Show in chat UI
    ↓
11. Response to Sender
    - 201 Created
    - Message ID, timestamp
    - Confirmation received
```

---

## 📦 Deployment Architecture

```
┌─────────────────────────────────────────┐
│         RAILWAY PLATFORM                │
│  (https://railway.app)                  │
└──────────────┬──────────────────────────┘

         ▼

┌─────────────────────────────────────────┐
│      GITHUB REPOSITORY                  │
│  - Main branch deployment               │
│  - Auto-deploy on push                  │
└──────────────┬──────────────────────────┘

         ▼

┌─────────────────────────────────────────┐
│      DOCKER IMAGES                      │
│  ├── Client: Node + Nginx               │
│  ├── Server: Node + Express             │
│  └── Database: PostgreSQL               │
└──────────────┬──────────────────────────┘

         ▼

┌─────────────────────────────────────────┐
│      KUBERNETES / DOCKER SWARM          │
│  - Container orchestration              │
│  - Load balancing                       │
│  - Auto-scaling                         │
└──────────────┬──────────────────────────┘

         ▼

┌─────────────────────────────────────────┐
│      CDN / REVERSE PROXY                │
│  - Cloudflare or similar                │
│  - Static content caching               │
│  - DDoS protection                      │
└──────────────┬──────────────────────────┘

         ▼

┌─────────────────────────────────────────┐
│      PRODUCTION SERVICES                │
│  ├── https://stogram.app (Web)          │
│  ├── iOS/Android Apps                   │
│  └── API: https://api.stogram.app       │
└─────────────────────────────────────────┘
```

---

## 🧪 Testing Strategy

```
┌─────────────────────────────┐
│   UNIT TESTS (Jest)         │
│   - Services                │
│   - Utils                   │
│   - Helpers                 │
└──────────┬──────────────────┘

┌──────────▼──────────────────┐
│   COMPONENT TESTS (Vitest)  │
│   - React Components        │
│   - Component Behavior      │
└──────────┬──────────────────┘

┌──────────▼──────────────────┐
│   INTEGRATION TESTS (Jest)  │
│   - API Routes              │
│   - Database Queries        │
│   - Third-party APIs        │
└──────────┬──────────────────┘

┌──────────▼──────────────────┐
│   E2E TESTS (Cypress/Playwright) │
│   - User workflows          │
│   - Full app testing        │
│   - Cross-browser           │
└─────────────────────────────┘
```

---

## 🎨 Design System

```
┌────────────────────────────────────┐
│      TAILWIND CSS CONFIGURATION    │
│  ├── Colors & Themes               │
│  ├── Spacing & Sizing              │
│  ├── Typography                    │
│  └── Responsive Design             │
└────────┬───────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│      COMPONENT LIBRARY             │
│  ├── Button, Input, Modal          │
│  ├── Card, List, Badge             │
│  ├── Avatar, Icon, Loader          │
│  └── Form Elements                 │
└────────┬───────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│      PAGE LAYOUTS                  │
│  ├── Chat Layout                   │
│  ├── Settings Layout               │
│  ├── Profile Layout                │
│  └── Admin Layout                  │
└────────────────────────────────────┘
```

---

## 📊 Database Schema Overview

```
Users
├── id (UUID)
├── email
├── username
├── password (hashed)
├── publicKey (RSA)
├── 2FA settings
└── Profile info

Chats
├── id (UUID)
├── name
├── type (direct/group)
├── members []
└── settings

Messages
├── id (UUID)
├── chatId (FK)
├── senderId (FK)
├── content (encrypted)
├── attachments []
├── createdAt
└── updatedAt

Reactions
├── id (UUID)
├── messageId (FK)
├── userId (FK)
├── emoji
└── createdAt

Bots
├── id (UUID)
├── name
├── token
├── webhook URL
└── settings

AuditLogs
├── id (UUID)
├── userId (FK)
├── action
├── resource
└── timestamp

SearchHistory
├── id (UUID)
├── userId (FK)
├── query
├── filters (JSON)
└── createdAt
```

---

## ✨ Key Features

✅ End-to-End Encryption (RSA-2048, AES-256)  
✅ 2FA Authentication (TOTP, Backup Codes)  
✅ Real-time Messaging (Socket.IO)  
✅ Bot Integration (Custom Bots, n8n)  
✅ Telegram Integration (Sync, Webhook)  
✅ Analytics & Monitoring  
✅ Audit Logging (Security)  
✅ PWA Support (Offline, Install)  
✅ Mobile Apps (iOS, Android)  
✅ File Uploads & Compression  

---

## 🔗 External Integrations

| Service | Usage | Status |
|---------|-------|--------|
| **Telegram API** | Channel/Bot integration | ✅ Active |
| **n8n** | Workflow automation | ✅ Active |
| **Email Service** | Notifications, 2FA | ✅ Active |
| **Push Notifications** | Real-time alerts | ✅ Active |
| **File Storage** | Uploads (S3/Local) | ✅ Active |

---

## 📈 Performance Optimization

### Implemented Optimizations

1. **API Response Caching (Redis)**
   - Chat lists: 30s TTL
   - Individual chat: 60s TTL
   - Messages: 30s TTL
   - User profiles: 60s TTL
   - Current user: 30s TTL
   - Contacts: 120s TTL
   - Cache invalidation on data mutations

2. **Database Query Optimization**
   - Batch fetching for last messages (avoids N+1)
   - Batch fetching for pinned messages
   - Selective field loading with `select` instead of nested `include`
   - Cursor-based pagination for messages
   - Offset-based pagination for chat lists

3. **ETag/Last-Modified Headers**
   - Media responses include ETag based on file size+mtime
   - Conditional requests (304 Not Modified)
   - Last-Modified fallback for browsers
   - Vary: Accept-Encoding header

4. **Frontend Optimization**
   - Code splitting (Vite)
   - Lazy loading components
   - Image compression
   - Service Worker caching

5. **Backend Optimization**
   - Middleware optimization
   - Async/await for I/O
   - Request batching
   - Compression (gzip)

---

