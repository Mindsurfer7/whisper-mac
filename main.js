const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const recorder = require('node-record-lpcm16');
const { OpenAI } = require('openai');
const clipboardy = require('clipboardy');
require('dotenv').config();

// Глобальные переменные
let mainWindow;
let tray;
let recording = null;
let isRecording = false;
const tempDir = path.join(__dirname, 'temp');
const audioFile = path.join(tempDir, 'recording.wav');

// Проверка наличия API-ключа
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ API-ключ OpenAI не найден. Создайте файл .env с вашим OPENAI_API_KEY.');
  app.quit();
}

// Инициализация OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Создание временной директории
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

// Создание основного окна
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'icon.png')
  });

  mainWindow.loadFile('index.html');
  
  // Регистрация горячих клавиш
  try {
    globalShortcut.register('F6', () => {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    });
    console.log('F6 зарегистрирован успешно');
  } catch (error) {
    console.error('Ошибка при регистрации F6:', error);
  }
}

// Создание системного трея
function createTray() {
  let iconPath;
  try {
    iconPath = path.join(__dirname, 'icon.png');
    if (!fs.existsSync(iconPath)) {
      iconPath = path.join(__dirname, 'icon.ico');
    }
  } catch (e) {
    iconPath = null;
  }

  const icon = iconPath ? nativeImage.createFromPath(iconPath) : null;
  tray = new Tray(icon || nativeImage.createEmpty());
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Запись (F6)', 
      click: () => {
        if (isRecording) {
          stopRecording();
        } else {
          startRecording();
        }
      } 
    },
    { type: 'separator' },
    { label: 'Показать окно', click: () => mainWindow.show() },
    { label: 'Выход', click: () => app.quit() }
  ]);
  
  tray.setToolTip('WhisperMac');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });
}

// Начало записи
function startRecording() {
  if (isRecording) return;
  
  isRecording = true;
  mainWindow.webContents.send('recording-status', true);
  console.log('🔴 Запись...');
  
  // Воспроизведение звукового сигнала
  exec('afplay /System/Library/Sounds/Ping.aiff');
  
  // Пробуем использовать ffmpeg, если не получается - используем node-record-lpcm16
  exec('which ffmpeg', (error) => {
    if (error) {
      console.log('⚠️ ffmpeg не найден, используем node-record-lpcm16');
      // Используем node-record-lpcm16 как резервный вариант
      recording = recorder.record({
        sampleRate: 16000,
        channels: 1,
        compress: false,
        threshold: 0.5,
        verbose: false,
      });
      
      // Сохранение в файл
      const fileStream = fs.createWriteStream(audioFile);
      recording.stream().pipe(fileStream);
      
    } else {
      console.log('✅ Используем ffmpeg для записи');
      // Используем ffmpeg
      recording = exec(`ffmpeg -f avfoundation -i ":0" -ar 16000 -ac 1 -y "${audioFile}"`);
    }
  });
  
  // Обновление меню трея
  const newContextMenu = Menu.buildFromTemplate([
    { 
      label: '⏹️ Остановить запись (F6)', 
      click: () => stopRecording() 
    },
    { type: 'separator' },
    { label: 'Показать окно', click: () => mainWindow.show() },
    { label: 'Выход', click: () => app.quit() }
  ]);
  tray.setContextMenu(newContextMenu);
}

// Остановка записи
function stopRecording() {
  if (!isRecording) return;
  
  isRecording = false;
  mainWindow.webContents.send('recording-status', false);
  mainWindow.webContents.send('processing-status', true);
  console.log('⏹️ Запись остановлена.');
  console.log('🔄 Обработка аудио с помощью Whisper AI...');
  
  // Обновление меню трея
  const newContextMenu = Menu.buildFromTemplate([
    { 
      label: '🔄 Обработка...', 
      enabled: false 
    },
    { type: 'separator' },
    { label: 'Показать окно', click: () => mainWindow.show() },
    { label: 'Выход', click: () => app.quit() }
  ]);
  tray.setContextMenu(newContextMenu);

  // Останавливаем процесс записи
  if (recording) {
    if (recording.kill) {
      // Это процесс ffmpeg
      recording.kill('SIGTERM');
    } else if (recording.stop) {
      // Это node-record-lpcm16
      recording.stop();
    }
  }
  
  // Даём время для завершения записи
  setTimeout(async () => {
    try {
      // Проверяем размер файла
      if (!fs.existsSync(audioFile)) {
        throw new Error('Аудиофайл не был создан. Проверьте права доступа к микрофону.');
      }
      
      const stats = fs.statSync(audioFile);
      console.log(`📊 Размер аудиофайла: ${stats.size} байт`);
      
      if (stats.size < 1000) { // Слишком маленький файл
        throw new Error('Аудиофайл слишком мал или пуст. Попробуйте записать дольше или проверьте микрофон.');
      }

      // Пробуем конвертировать файл в правильный WAV формат с помощью SoX или ffmpeg
      const convertedFile = path.join(tempDir, 'converted.wav');
      
      await new Promise((resolve, reject) => {
        // Сначала пробуем ffmpeg
        exec(`ffmpeg -i "${audioFile}" -ar 16000 -ac 1 -sample_fmt s16 "${convertedFile}" -y`, (error) => {
          if (error) {
            // Если ffmpeg не работает, пробуем sox
            exec(`sox "${audioFile}" -r 16000 -c 1 -b 16 "${convertedFile}"`, (error2) => {
              if (error2) {
                console.log('⚠️ Конвертация не удалась, используем оригинальный файл');
                resolve();
              } else {
                console.log('✅ Файл сконвертирован с помощью SoX');
                // Заменяем оригинальный файл на сконвертированный
                if (fs.existsSync(convertedFile)) {
                  fs.renameSync(convertedFile, audioFile);
                }
                resolve();
              }
            });
          } else {
            console.log('✅ Файл сконвертирован с помощью ffmpeg');
            // Заменяем оригинальный файл на сконвертированный
            if (fs.existsSync(convertedFile)) {
              fs.renameSync(convertedFile, audioFile);
            }
            resolve();
          }
        });
      });

      // Отправка аудио в Whisper API
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(audioFile),
        model: 'whisper-1',
        language: 'ru',
      });

      const text = transcription.text;
      
      if (text) {
        console.log(`✅ Распознанный текст: "${text}"`);
        mainWindow.webContents.send('transcription-result', text);
        
        // Копирование в буфер обмена
        clipboardy.writeSync(text);
        console.log('📋 Текст скопирован в буфер обмена');
        
        // Оповещение об успехе
        exec('afplay /System/Library/Sounds/Hero.aiff');
      } else {
        console.log('❓ Текст не распознан');
        mainWindow.webContents.send('transcription-error', 'Текст не распознан');
      }
    } catch (error) {
      console.error('❌ Ошибка при обработке аудио:', error);
      mainWindow.webContents.send('transcription-error', error.message);
    } finally {
      // Удаление временных файлов
      [audioFile, path.join(tempDir, 'converted.wav')].forEach(file => {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      });
      
      // Восстановление нормального меню
      const defaultContextMenu = Menu.buildFromTemplate([
        { 
          label: '🎙️ Начать запись (F6)', 
          click: () => startRecording() 
        },
        { type: 'separator' },
        { label: 'Показать окно', click: () => mainWindow.show() },
        { label: 'Выход', click: () => app.quit() }
      ]);
      tray.setContextMenu(defaultContextMenu);
      
      mainWindow.webContents.send('processing-status', false);
    }
  }, 2000); // Даём 2 секунды для завершения записи
}

// Обработчики IPC сообщений
ipcMain.on('start-recording', () => {
  startRecording();
});

ipcMain.on('stop-recording', () => {
  stopRecording();
});

// Инициализация приложения
app.whenReady().then(() => {
  createWindow();
  createTray();
  
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Завершение работы приложения
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  // Отменяем регистрацию горячих клавиш
  globalShortcut.unregisterAll();
}); 