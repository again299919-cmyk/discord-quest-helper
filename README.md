# Discord Quest Helper (Improved)

نسخة محسّنة من تطبيق كويستات ديسكورد، تدعم كويستات الـ 700 Orbs بشكل أفضل.

## المميزات
- تحسين استقرار `PLAY_ON_DESKTOP` و `STREAM_ON_DESKTOP`
- تحمل أعلى للـ Stall
- Heartbeats أذكى + إعادة محاولة تلقائية
- نفس التصميم الأصلي

## البناء عن طريق GitHub Actions (من Termux)

1. ارفع المشروع على GitHub (repo جديد)
2. من Termux:
```bash
pkg install gh
gh auth login
gh workflow run build-apk.yml
```
3. بعد ما يخلص البناء:
```bash
gh run download -n QuestHelper-APK
```
4. ثبّت الـ APK

## تشغيل محلي (Web فقط)
افتح `www/index.html` في المتصفح أو استخدم أي static server.
