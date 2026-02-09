# Appwrite Integration for Aladdin Notes

## Setup Complete ✅

I've successfully added Appwrite database integration to your Aladdin Notes project. Here's what was implemented:

### Database Setup
- **Database**: `aladdin-notes-db`
- **Scenes Collection**: Stores encrypted drawing data
- **Files Collection**: Stores binary files (images, etc.)
- **Indexes**: Unique index on roomId for fast lookups

### Files Created
1. **`data/appwrite.ts`** - Appwrite service implementation
2. **`data/databaseAdapter.ts`** - Database abstraction layer
3. **`data/databaseConfig.ts`** - Configuration management

### Key Features
- **Encryption**: All data is encrypted before storage (same as Firebase)
- **File Storage**: Binary files stored as base64 in Appwrite
- **Real-time Sync**: Compatible with existing collaboration features
- **Fallback**: Can switch between Firebase and Appwrite

## How to Use

### 1. Configure Appwrite
Update your `.env.development` or `.env.local`:

```bash
# Appwrite configuration
VITE_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=your-project-id-here
VITE_APPWRITE_DATABASE_ID=aladdin-notes-db

# Switch to Appwrite
VITE_DATABASE_PROVIDER=appwrite
```

### 2. Get Appwrite Credentials
1. Create an Appwrite project at [https://cloud.appwrite.io](https://cloud.appwrite.io)
2. Get your Project ID from the settings
3. The database is already created with ID: `aladdin-notes-db`

### 3. Test the Integration
The app will automatically use Appwrite when `VITE_DATABASE_PROVIDER=appwrite` is set.

## Database Schema

### Scenes Collection
- `roomId` (string, unique) - Collaboration room ID
- `sceneVersion` (integer) - Version for conflict resolution
- `ciphertext` (text) - Encrypted drawing data
- `iv` (text) - Encryption initialization vector
- `createdAt` (datetime) - Creation timestamp
- `updatedAt` (datetime) - Last update timestamp

### Files Collection
- `prefix` (string) - File organization prefix
- `fileId` (string) - Unique file identifier
- `data` (text) - Base64 encoded file data
- `mimeType` (string) - File MIME type
- `createdAt` (datetime) - Upload timestamp

## API Functions Available

```typescript
import { databaseAdapter } from './data';

// Save drawing data
await databaseAdapter.save(portal, elements, appState);

// Load drawing data
await databaseAdapter.load(roomId, roomKey, socket);

// Save files
await databaseAdapter.saveFiles({ prefix, files });

// Load files
await databaseAdapter.loadFiles(prefix, decryptionKey, fileIds);

// Check if saved
databaseAdapter.isSaved(portal, elements);
```

## Switching Between Databases

```bash
# Use Firebase (default)
VITE_DATABASE_PROVIDER=firebase

# Use Appwrite
VITE_DATABASE_PROVIDER=appwrite
```

The app automatically detects the provider and uses the appropriate adapter.

## Benefits of Appwrite Integration

1. **Self-hosted option**: Can run on your own infrastructure
2. **Open source**: Full control over your data
3. **Real-time capabilities**: Built-in WebSocket support
4. **Security**: End-to-end encryption maintained
5. **Scalability**: Handles large drawing files efficiently

## Next Steps

1. Set up your Appwrite project
2. Update environment variables
3. Test with a collaborative drawing session
4. Deploy to production with Appwrite backend

The integration maintains full compatibility with existing features while providing an alternative to Firebase for data persistence.
