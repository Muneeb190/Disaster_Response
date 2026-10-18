import { openDB } from 'idb';

const DATABASE_NAME = 'resqnet-voice-recordings';
const STORE_NAME = 'recordings';

export interface LocalVoiceRecording {
  id: string;
  audio: Blob;
  createdAt: string;
}

async function getDatabase() {
  return openDB(DATABASE_NAME, 1, {
    upgrade(database) {
      database.createObjectStore(STORE_NAME, { keyPath: 'id' });
    },
  });
}

export async function saveLocalVoiceRecording(audio: Blob): Promise<LocalVoiceRecording> {
  const recording: LocalVoiceRecording = {
    id: crypto.randomUUID(),
    audio,
    createdAt: new Date().toISOString(),
  };
  const database = await getDatabase();
  await database.put(STORE_NAME, recording);
  return recording;
}

export async function getLocalVoiceRecordings(): Promise<LocalVoiceRecording[]> {
  const database = await getDatabase();
  return database.getAll(STORE_NAME);
}

export async function removeLocalVoiceRecording(id: string): Promise<void> {
  const database = await getDatabase();
  await database.delete(STORE_NAME, id);
}
