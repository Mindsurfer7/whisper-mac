const { contextBridge, ipcRenderer } = require('electron');

// Экспорт API для использования в рендерере
contextBridge.exposeInMainWorld('whisperAPI', {
  // Отправка событий на основной процесс
  startRecording: () => ipcRenderer.send('start-recording'),
  stopRecording: () => ipcRenderer.send('stop-recording'),
  
  // Подписка на события от основного процесса
  onRecordingStatusChange: (callback) => 
    ipcRenderer.on('recording-status', (_, status) => callback(status)),
    
  onProcessingStatusChange: (callback) => 
    ipcRenderer.on('processing-status', (_, status) => callback(status)),
    
  onTranscriptionResult: (callback) => 
    ipcRenderer.on('transcription-result', (_, result) => callback(result)),
    
  onTranscriptionError: (callback) => 
    ipcRenderer.on('transcription-error', (_, error) => callback(error))
}); 