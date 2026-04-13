# 🎭 Mafia Game — Online Multiplayer

Полностью автоматизированная онлайн-игра «Мафия» с реальным временем через WebSocket.

---

## 📋 Суть проекта

Веб-приложение для игры в Мафию с друзьями. Создаёшь комнату — приглашаешь — играешь. Бэкенд управляет логикой, фронтенд reacts в реальном времени.

**Стек:**
| Слой | Технология |
|------|-----------|
| Frontend | React 19 + Vite + Socket.IO Client |
| Backend | Express 5 + Socket.IO 4 |
| Realtime DB | Firebase Firestore |
| Роутинг | React Router DOM |
| QR-коды | qrcode.react |

---

## 🏗 Архитектура

```
kkkkkkkk/
├── backend/
│   ├── index.js        # Socket.IO сервер + обработчики событий
│   ├── gameLogic.js    # Генерация кодов комнат + раздача ролей
│   └── firebase.js     # Инициализация Firestore
├── frontend/
│   └── src/
│       ├── App.jsx     # Роуты: Home, Room, Join
│       ├── components/
│       │   ├── Home.jsx      # Создание/вход в комнату
│       │   └── Room.jsx      # Игровой интерфейс (lobby, night, day, vote, game over)
│       └── socket.js   # Socket.IO клиент
├── run.js              # Concurrent запуск backend + frontend
└── test-game.js        # Автоматический тест игрового потока
```

---

## 🎮 Игровой поток

### 1. Lobby
- Хост создаёт комнату → получает 4-значный код + QR
- Игроки входят по коду или ссылке `/join/:code`
- Хост настраивает: кол-во мафии, наличие доктора/шерифа

### 2. Game Start
- Роли распределяются случайно (`gameLogic.js::distributeRoles`)
- Состояние → `PLAYING_NIGHT`

### 3. Night Phase
- Мафия голосует за жертву (ручной режим через хоста)
- `night_kill` → жертва добавляется в `eliminated`

### 4. Day Phase
- Голосование всех живых игроков
- Каждый выбирает цель → `submit_vote`
- Хост подсчитывает → `end_day_vote`
- При ничьей — runoff (логика готова, UI ожидает)

### 5. Win Conditions
- **Citizens Win** — вся мафия устранена
- **Mafia Win** — мафия ≥ не-мафия
- После победы комната автоудаляется из Firestore через 20с

---

## 🚀 Запуск

```bash
npm start
```

Это запустит:
- **Backend** — `node backend/index.js` (порт `3001`)
- **Frontend** — `npm run dev` в `frontend/` (Vite, порт `5173`)

---

## 🧪 Тестирование

```bash
node test-game.js
```

Автоматически: создаёт комнату → подключает 3 игроков → запускает игру → проверяет получение ролей.

---

## 🔧 Firebase

Конфигурация в `firebase.js`. Используется Firestore для хранения состояния комнат в реальном времени через `onSnapshot` listeners.

> ⚠️ API-ключи закоммичены — для продакшена вынести в `.env`.

---

## 📝 Известные ограничения

- Нет автоматических фаз — хост вручную переключает night/day/vote
- Нет runoff UI — логика есть, кнопка отсутствует
- Хост = модератор (не играет)
- Нет чата/обсуждения

---

## 📄 Version History

Полная история изменений и инструкции по откату — в [`version_history.md`](./version_history.md).

Отчёт по автоматизации — в [`automated_mafia_report.md`](./automated_mafia_report.md).
 