# ORIX AI — Starter

A minimal ChatGPT-style AI mobile app starter with:
- Black + ice-blue UI
- Animated ORIX wave
- Chat screen
- Sidebar/history drawer
- Voice/listening button animation
- Secure Node.js backend for OpenAI Responses API

## 1. Backend
```bash
cd server
npm install
cp .env.example .env
# Put your API key in .env
npm run dev
```

## 2. Mobile app
Use Expo/React Native. Copy `app/App.tsx` into an Expo TypeScript app.

Install:
```bash
npx expo install expo-linear-gradient expo-blur expo-haptics
npm install
```

Set `API_URL` in App.tsx to your computer's LAN IP, e.g. `http://192.168.1.5:8787`.

For a physical phone, don't use `localhost` for the backend.

## 3. Production
Use HTTPS, authentication, rate limiting, logging, and a proper database before publishing. Never ship OPENAI_API_KEY in the app bundle.
