#!/bin/bash

# Определяем путь к приложению
APP_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$APP_DIR"

# Устанавливаем права на исполняемый файл MacKeyServer, если он есть
if [ -f "node_modules/node-global-key-listener/bin/MacKeyServer" ]; then
    sudo chmod +x node_modules/node-global-key-listener/bin/MacKeyServer
fi

# Запускаем приложение с правами sudo
echo "🚀 Запуск WhisperMac в режиме горячих клавиш (F6)..."
sudo node index.js -k

# Если вы хотите использовать другие параметры, замените строку выше на нужную:
# sudo node index.js -k -t    # режим с вводом текста вместо буфера обмена
# sudo node index.js -k -s "alt+r"    # с другой горячей клавишей 