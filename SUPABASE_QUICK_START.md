# Supabase Quick Start - 10 Minutes

## 🚀 Super Fast Setup

### 1. Create Supabase Project (3 min)
```
1. Go to https://app.supabase.com
2. Sign up with Google
3. Click "New project"
4. Name: "shopify-report"
5. Create password
6. Select region (us-east-1)
7. Click "Create new project"
8. Wait 1-2 minutes
```

### 2. Run SQL Setup (2 min)
```
1. Click "SQL Editor"
2. Click "New query"
3. Copy & paste from https://github.com/yourrepo/SUPABASE_SETUP.md (SQL section)
4. Click "Run"
5. Should see "Success"
```

Or just click "New query" and paste this:

```sql
CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  storefront_token TEXT,
  admin_token TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS column_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users NOT NULL,
  preferences JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE column_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own stores"
  ON stores FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own stores"
  ON stores FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own stores"
  ON stores FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own stores"
  ON stores FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own reports"
  ON reports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own reports"
  ON reports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own reports"
  ON reports FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own reports"
  ON reports FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own preferences"
  ON column_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own preferences"
  ON column_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own preferences"
  ON column_preferences FOR UPDATE USING (auth.uid() = user_id);
```

### 3. Get Your Keys (2 min)
```
1. Click "Settings" → "API"
2. Copy "Project URL" (https://xxx.supabase.co)
3. Copy "Anon Key" (starts with eyJ...)
```

### 4. Create .env.local (2 min)
```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

### 5. Start App (1 min)
```bash
npm run dev
```

## ✅ Done!

### Next: Create Account
1. Go to http://localhost:5173/login
2. Click "Sign up"
3. Create account
4. Add stores and reports
5. Data syncs to Supabase! 🎉

---

## 🔍 Verify It Works

### Check Auth Works
1. Sign up with test@example.com / password123
2. Should see dashboard
3. Go to Supabase → Authentication → Users
4. Should see your email there

### Check Data Saves
1. Add a store
2. Go to Supabase → Database → stores
3. Should see your store

### Check RLS Works
1. Sign out
2. Sign up with different account
3. Should NOT see first account's stores
4. (Each user only sees their own data)

---

## 📊 Database Overview

```
stores - Your Shopify stores
├── id (auto UUID)
├── user_id (links to your account)
├── name (e.g., "My Store")
├── domain (e.g., "mystore.myshopify.com")
├── storefront_token (optional)
├── admin_token (optional)
└── created_at

reports - Your custom reports
├── id (unique report ID)
├── user_id (links to your account)
├── name (report name)
├── password (hashed for security)
├── share_link (for sharing)
└── created_at

column_preferences - Your column settings
├── user_id (links to your account)
├── preferences (array of columns)
└── updated_at
```

---

## 🆘 Quick Troubleshooting

| Problem | Fix |
|---------|-----|
| "Supabase not initialized" | Check `.env.local` has both keys |
| Can't sign up | Make sure Supabase is fully created (2 min) |
| Data not saving | Check RLS policies are created (Step 2) |
| Keys not working | Go to Settings → API and copy again |
| Tables don't exist | Run the SQL script in Step 2 |

---

## 🎯 Features Working Now

- ✅ User signup/login with email/password
- ✅ Data persists on page refresh
- ✅ Add/edit/delete stores
- ✅ Create/delete reports
- ✅ Column preferences saved
- ✅ Admin API tokens stored securely
- ✅ Password-protected reports
- ✅ Shareable report links

---

## 📚 Need More Help?

- **Detailed Setup**: See [SUPABASE_SETUP.md](SUPABASE_SETUP.md)
- **Migration Info**: See [SUPABASE_MIGRATION.md](SUPABASE_MIGRATION.md)
- **Config Details**: See [.env.example](.env.example)
- **Supabase Docs**: https://supabase.com/docs

---

**That's it! Your dashboard is now live with Supabase.** 🚀

Demo account (localStorage):
- Email: demo@example.com
- Password: demo123

(Won't persist across sessions - create real account for persistence!)
