export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getDatabase } = await import('@/server/persistence/database');
    const { bootstrapLocalAudioMetadata, startLocalAudioMaintenance } = await import('@/services/storage/localAudioStorageService');
    const { startStemWorker } = await import('@/server/stems/stemWorker');
    getDatabase();
    await bootstrapLocalAudioMetadata();
    startLocalAudioMaintenance();
    startStemWorker();
  }
}
