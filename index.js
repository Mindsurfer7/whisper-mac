#!/usr/bin/env node

require('dotenv').config();
const recorder = require('node-record-lpcm16');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { OpenAI } = require('openai');
const clipboardy = require('clipboardy');
const { Command } = require('commander');
const { GlobalKeyboardListener } = require('node-global-key-listener');

const program = new Command();
program
  .name('whisper-mac')
  .description('Записывает голос, преобразует в текст с помощью Whisper AI и копирует результат')
  .version('1.0.0')
  .option('-c, --clipboard', 'Копировать текст в буфер обмена (по умолчанию)')
  .option('-t, --type', 'Имитировать ввод текста с клавиатуры')
  .option('-d, --duration <seconds>', 'Длительность записи в секундах', '5')
  .option('-k, --hotkey', 'Режим записи по горячим клавишам (нажмите F6 для начала, F6 снова для остановки)')
  .option('-s, --shortcut <keys>', 'Задать свою горячую клавишу (например, "alt+r")', 'F6')
  .parse(process.argv);

const options = program.opts();

// Проверка наличия API-ключа
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ API-ключ OpenAI не найден. Создайте файл .env с вашим OPENAI_API_KEY.');
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

const audioFile = path.join(tempDir, 'recording.wav');
let recording = null;
let isRecording = false;

// Функция для обработки записанного аудио
async function processAudio() {
  console.log('⏹️ Запись остановлена.');
  console.log('🔄 Обработка аудио с помощью Whisper AI...');

  // Сохранение аудио файла
  const file = fs.createWriteStream(audioFile);
  recording.stream().pipe(file);

  file.on('finish', async () => {
    try {
      // Отправка аудио в Whisper API
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(audioFile),
        model: 'whisper-1',
        language: 'ru',
      });

      const text = transcription.text;
      
      if (text) {
        console.log(`✅ Распознанный текст: "${text}"`);

        if (options.type) {
          // Имитация ввода с клавиатуры с помощью AppleScript
          const escapedText = text.replace(/[\\'"]/g, '\\$&');
          exec(`osascript -e 'tell application "System Events" to keystroke "${escapedText}"'`, (error) => {
            if (error) {
              console.error('❌ Ошибка при вводе текста:', error);
            } else {
              console.log('⌨️ Текст введен с клавиатуры');
            }
            if (options.hotkey) {
              console.log(`\n🎤 Нажмите ${options.shortcut} для новой записи или Ctrl+C для выхода...`);
            } else {
              process.exit(0);
            }
          });
        } else {
          // Копирование в буфер обмена
          clipboardy.writeSync(text);
          console.log('📋 Текст скопирован в буфер обмена');
          if (options.hotkey) {
            console.log(`\n🎤 Нажмите ${options.shortcut} для новой записи или Ctrl+C для выхода...`);
          } else {
            process.exit(0);
          }
        }
      } else {
        console.log('❓ Текст не распознан');
        if (options.hotkey) {
          console.log(`\n🎤 Нажмите ${options.shortcut} для новой записи или Ctrl+C для выхода...`);
        } else {
          process.exit(0);
        }
      }
    } catch (error) {
      console.error('❌ Ошибка при обработке аудио:', error);
      if (options.hotkey) {
        console.log(`\n🎤 Нажмите ${options.shortcut} для новой записи или Ctrl+C для выхода...`);
      } else {
        process.exit(1);
      }
    } finally {
      // Удаление временного файла
      if (fs.existsSync(audioFile)) {
        fs.unlinkSync(audioFile);
      }
    }
  });
}

// Функция для начала записи
function startRecording() {
  if (isRecording) return;
  
  isRecording = true;
  console.log('🔴 Запись...');
  console.log(`Нажмите ${options.shortcut} снова для остановки записи`);
  
  // Воспроизведение звукового сигнала
  exec('afplay /System/Library/Sounds/Ping.aiff');
  
  recording = recorder.record({
    sampleRate: 16000,
    channels: 1,
    audioType: 'wav',
  });
}

// Функция для остановки записи
function stopRecording() {
  if (!isRecording) return;
  
  isRecording = false;
  recording.stop();
  processAudio();
}

// Режим с горячими клавишами
if (options.hotkey) {
  const keyboard = new GlobalKeyboardListener();
  
  console.log(`🎙️ Режим записи по горячим клавишам активирован`);
  console.log(`Нажмите ${options.shortcut} для начала/остановки записи или Ctrl+C для выхода`);
  
  // Парсинг настраиваемой горячей клавиши
  let shortcutKey = options.shortcut;
  if (shortcutKey.toLowerCase() === 'f6') {
    shortcutKey = 'F6';
  }
  
  keyboard.addListener(function(e) {
    // Обработка нажатия клавиши F6 или указанной пользователем
    const keyName = e.name || '';
    const altPressed = e.altKey || false;
    const ctrlPressed = e.ctrlKey || false;
    const shiftPressed = e.shiftKey || false;
    
    // Проверка для обычной клавиши F6
    if (shortcutKey === 'F6' && keyName === 'F6' && !altPressed && !ctrlPressed && !shiftPressed && e.state === 'DOWN') {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    }
    // Проверка для комбинаций вида "alt+r"
    else if (shortcutKey.includes('+')) {
      const parts = shortcutKey.toLowerCase().split('+');
      const modifiers = parts.slice(0, -1);
      const key = parts[parts.length - 1];
      
      if (keyName.toLowerCase() === key && 
          (!modifiers.includes('alt') || altPressed) &&
          (!modifiers.includes('ctrl') || ctrlPressed) &&
          (!modifiers.includes('shift') || shiftPressed) &&
          e.state === 'DOWN') {
        if (isRecording) {
          stopRecording();
        } else {
          startRecording();
        }
      }
    }
    // Для простых клавиш без модификаторов
    else if (keyName.toLowerCase() === shortcutKey.toLowerCase() && 
             !altPressed && !ctrlPressed && !shiftPressed && 
             e.state === 'DOWN') {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    }
  });
} 
// Стандартный режим с фиксированной длительностью
else {
  console.log(`🎤 Запись голоса начнется через 1 секунду (${options.duration} сек)...`);
  console.log('Говорите после звукового сигнала');

  // Воспроизведение звукового сигнала
  exec('afplay /System/Library/Sounds/Ping.aiff');

  setTimeout(() => {
    // Начало записи
    console.log('🔴 Запись...');
    
    recording = recorder.record({
      sampleRate: 16000,
      channels: 1,
      audioType: 'wav',
    });

    // Остановка записи через указанное время
    setTimeout(() => {
      recording.stop();
      processAudio();
    }, parseInt(options.duration) * 1000);
  }, 1000);
} 