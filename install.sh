#!/bin/bash

# Определяем путь к приложению
APP_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$APP_DIR"

# Делаем скрипты исполняемыми
chmod +x start.sh
chmod +x index.js

# Если необходимо, устанавливаем права на бинарный файл
if [ -f "node_modules/node-global-key-listener/bin/MacKeyServer" ]; then
    sudo chmod +x node_modules/node-global-key-listener/bin/MacKeyServer
fi

# Создаем Launch Agent для автозапуска (по желанию пользователя)
read -p "Установить автозапуск при входе в систему? (y/n): " install_launch_agent

if [ "$install_launch_agent" = "y" ]; then
    # Создаем директорию Launch Agents, если она не существует
    mkdir -p ~/Library/LaunchAgents
    
    # Копируем и настраиваем plist файл
    PLIST_PATH=~/Library/LaunchAgents/com.whisper-mac.plist
    cp com.whisper-mac.plist "$PLIST_PATH"
    
    # Заменяем APP_PATH на реальный путь
    sed -i "" "s|APP_PATH|$APP_DIR|g" "$PLIST_PATH"
    
    # Загружаем Launch Agent
    launchctl load "$PLIST_PATH"
    
    echo "✅ Автозапуск установлен. Приложение будет запускаться при входе в систему."
    echo "📝 Логи будут сохраняться в $APP_DIR/whisper-mac.log"
else
    echo "⏭️ Автозапуск не установлен."
fi

echo ""
echo "📋 Инструкция по использованию:"
echo "1. Для запуска приложения выполните: ./start.sh"
echo "2. По умолчанию используется клавиша F6 для начала/остановки записи"
echo "3. Для изменения настроек отредактируйте файл start.sh"
echo ""
echo "✨ Установка завершена! ✨" 