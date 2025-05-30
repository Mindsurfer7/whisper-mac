#!/bin/bash

# Определяем путь к приложению
APP_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$APP_DIR"

echo "🚀 Запуск WhisperMac..."

# Очищаем NODE_OPTIONS для совместимости с Electron
unset NODE_OPTIONS

npm start 