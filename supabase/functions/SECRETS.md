# أسرار وظائف Supabase Edge

تحتاج وظائف Edge إلى المتغيرات التالية داخل إعدادات أسرار مشروع Supabase، وليس داخل ملفات الواجهة:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

يوفر Supabase عادةً `SUPABASE_URL` و`SUPABASE_ANON_KEY` و`SUPABASE_SERVICE_ROLE_KEY` للوظائف المنشورة. لا تضع مفتاح Service Role في `.env` الخاص بـ Vite، ولا في `src/` أو `public/`، ولا ترفعه إلى Git.
