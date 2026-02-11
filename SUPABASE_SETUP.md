# Supabase Integration Guide for Shopify Report

## Overview

Shopify Report now uses Supabase for:
- **User Authentication**: Email/password signup and login
- **Data Persistence**: PostgreSQL database stores all user data across devices
- **Multi-Device Sync**: Automatic sync of stores, reports, and preferences

## Prerequisites

- Google account (for signing up to Supabase)
- Node.js and npm/bun installed

## Setup Instructions

### 1. Create a Supabase Project

1. Go to [Supabase Console](https://app.supabase.com)
2. Sign up or log in with your Google account
3. Click "New project"
4. Enter project name (e.g., "shopify-report")
5. Create a secure database password
6. Select a region (us-east-1 recommended)
7. Click "Create new project"
8. Wait for the project to initialize (1-2 minutes)

### 2. Create Database Tables

1. In Supabase Console, click "SQL Editor" in the left menu
2. Click "New query"
3. Copy and paste the following SQL:

```sql
-- Stores table
CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  storefront_token TEXT,
  admin_token TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Reports table
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  store_id TEXT NOT NULL,
  store_name TEXT NOT NULL,
  selected_columns JSONB DEFAULT '[]'::jsonb,
  filters JSONB DEFAULT '{}'::jsonb,
  password TEXT NOT NULL,
  share_link TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, id)
);

-- Column preferences table
CREATE TABLE IF NOT EXISTS column_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users NOT NULL,
  preferences JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE column_preferences ENABLE ROW LEVEL SECURITY;

-- Row Level Security Policies for stores
CREATE POLICY "Users can view their own stores"
  ON stores FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own stores"
  ON stores FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own stores"
  ON stores FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own stores"
  ON stores FOR DELETE USING (auth.uid() = user_id);

-- Row Level Security Policies for reports
CREATE POLICY "Users can view their own reports"
  ON reports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own reports"
  ON reports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own reports"
  ON reports FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own reports"
  ON reports FOR DELETE USING (auth.uid() = user_id);

-- Row Level Security Policies for column_preferences
CREATE POLICY "Users can view their own preferences"
  ON column_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own preferences"
  ON column_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own preferences"
  ON column_preferences FOR UPDATE USING (auth.uid() = user_id);
```

4. Click "Run"
5. You should see "Success" message

### 3. Enable Email/Password Authentication

1. In Supabase Console, click "Authentication" in the left menu
2. Click "Providers"
3. Ensure "Email" is enabled (it should be by default)
4. You can configure email templates if desired

### 4. Get Supabase Configuration

1. In Supabase Console, click "Settings" in the left menu
2. Click "API"
3. Copy these two values:
   - **Project URL** - starts with `https://your-project.supabase.co`
   - **Anon Key** - starts with `eyJh...` (about 200 characters)

### 5. Configure Environment Variables

1. Create a `.env.local` file in the project root (or copy from `.env.example`)
2. Add your Supabase credentials:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

Replace with your actual values from Step 4.

### 6. Restart Your Application

1. Stop the development server (Ctrl+C)
2. Start it again:

```bash
npm run dev
# or
bun run dev
```

## How It Works

### Data Structure

Your Supabase database is organized by user:

```
users (auth.users - managed by Supabase)
├── {user_id}
    ├── stores/
    │   ├── {store_id}
    │   │   ├── id: UUID
    │   │   ├── name: string
    │   │   ├── domain: string
    │   │   ├── storefront_token: string
    │   │   ├── admin_token: string
    │   │   └── created_at: timestamp
    │
    ├── reports/
    │   ├── {report_id}
    │   │   ├── id: string
    │   │   ├── name: string
    │   │   ├── password: string (hashed)
    │   │   ├── share_link: string
    │   │   └── filters: object
    │
    └── preferences/columns
        ├── user_id: UUID
        └── preferences: array
```

### Authentication Flow

1. **First Visit**: User sees login page
2. **New User**: Click "Sign up" to create account
3. **Login**: Enter email and password
4. **Session**: User stays logged in across browser sessions
5. **Logout**: Data remains in Supabase, ready for next login

### Data Sync

- **Stores**: Automatically saved to Supabase when added/updated/deleted
- **Reports**: Synced with Supabase on create/update/delete
- **Preferences**: Column visibility preferences saved to Supabase

## Troubleshooting

### "Supabase not initialized" error

**Solution**: Check that both environment variables are set in `.env.local`:
- `VITE_SUPABASE_URL` - Full URL with `supabase.co`
- `VITE_SUPABASE_ANON_KEY` - Long key starting with `eyJ`

### "Permission denied" error when saving data

**Solution**: 
1. Verify you're logged in with a valid Supabase account
2. Check that Row Level Security (RLS) policies are created (see Step 2)
3. Ensure all 4 tables exist (stores, reports, column_preferences)

### Changes not persisting

**Solution**: 
1. Check browser console for errors (F12 → Console tab)
2. Verify you're logged in (check top-right of dashboard)
3. Ensure `.env.local` has correct Supabase credentials
4. Verify database tables were created successfully

### Can't see data in Supabase console

**Solution**: 
1. Go to "Database" → "Tables"
2. Click each table (stores, reports, column_preferences)
3. Look for "RLS is enabled" warning
4. This is normal - Row Level Security restricts data visibility

## Demo Account

For testing before setting up Supabase:
- Email: demo@example.com
- Password: demo123

This account uses localStorage and won't persist across browser sessions.

## Next Steps

1. ✅ Supabase project created
2. ✅ Database tables created
3. ✅ Authentication enabled
4. ✅ Environment variables configured
5. ✅ Row Level Security policies applied
6. 🎯 Start using the app!

Create your account by clicking "Sign up" on the login page.

## Security Notes

- **Anon Key is public** - It's safe to include in your app's code
- **Service Role Key is secret** - Never share or include in client code
- **Row Level Security enforces access** - Users can only see their own data
- **Passwords are hashed** - Never stored in plain text
- **Admin tokens are encrypted** - Stored securely in Supabase

## Support

For Supabase issues:
- [Supabase Documentation](https://supabase.com/docs)
- [Authentication Guide](https://supabase.com/docs/guides/auth)
- [PostgreSQL Guide](https://supabase.com/docs/guides/database)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

## Reverting to localStorage (Demo Mode)

If you want to test without Supabase:
1. Remove/comment out Supabase config in `.env.local`
2. App will fall back to localStorage
3. Data won't persist across browser sessions

---

**Last Updated**: When Supabase integration was added
