# StudyHub

Next.js + Supabase (database, login, file storage, realtime) + Gemini AI. Free to run on Supabase free, Vercel Hobby and the Gemini free tier.

## Set up
1. supabase.com > New project. SQL Editor > paste all of `supabase/schema.sql` > Run.
2. Supabase > Authentication > Providers > Email: turn off "Confirm email" while testing.
3. Supabase > Project Settings > API: copy the Project URL and the anon public key.
4. aistudio.google.com > Get API key.
5. Copy `.env.example` to `.env.local`, fill it in. Run `npm install` then `npm run dev`.
6. Push to GitHub. On vercel.com > Add New Project > import the repo > add the same 4 environment variables > Deploy.
