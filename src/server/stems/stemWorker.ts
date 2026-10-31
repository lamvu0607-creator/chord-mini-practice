import 'server-only';

// Stem jobs are processed by the shared GPU worker (one GPU job at a time across SCNet and MuScriptor).
export { enforceStemQuota, stemsBackendUrl } from './stemJobProcessor';
export { startGpuWorker as startStemWorker } from '@/server/gpu/gpuWorker';
