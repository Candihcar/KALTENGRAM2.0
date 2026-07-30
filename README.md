# KaltenGram — Telegram-подобный мессенджер

Полнофункциональный мессенджер для Vercel + Supabase.

## 🚀 Быстрый деплой (без Git)

### 1. Загрузи на GitHub
- https://github.com/new → создай репозиторий
- **Add file → Upload files** → перетащи все файлы → Commit

### 2. Настрой Supabase (база данных)
- https://supabase.com → New project
- Создай проект, сохрани пароль от БД
- В проекте: **Connect** → **ORMs** → **Prisma**
- Скопируй **Transaction Pooler** строку (порт 6543)
- Скопируй **Direct Connection** строку (порт 5432)
- Замени `[YOUR-PASSWORD]` на пароль

### 3. Деплой на Vercel
- https://vercel.com → **Add New → Project**
- Выбери репозиторий
- Добавь Environment Variables:

| Key | Value |
|---|---|
| `DATABASE_URL` | Строка с портом 6543 |
| `DIRECT_URL` | Строка с портом 5432 |
| `NEXTAUTH_SECRET` | Любой сложный текст |

- Нажми **Deploy**

### 4. Создай таблицы в БД
После деплоя открой URL приложения — таблицы создадутся автоматически при первой регистрации.

Если нужно вручную: в Supabase → **SQL Editor** → вставь код из `prisma/schema.prisma` → Run.

## ✨ Возможности
- Регистрация по email
- Личные и групповые чаты
- Отправка фото и видео
- Emoji picker
- Профили с username и био
- Аудио и видеозвонки (WebRTC)
- Статус онлайн
- Настройки профиля
- Защита от DDoS (rate-limit)

## 🛠 Стек
Next.js 14, TypeScript, Tailwind CSS, Prisma, Supabase, NextAuth, Pusher, WebRTC, Vercel Blob
