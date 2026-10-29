import {
  deleteLocalDocuments,
  getLocalDocument,
  listLocalDocuments,
  setLocalDocument,
  type LocalDocumentCollection,
} from './jsonDocumentRepository';

export async function getDocument<T>(collection: LocalDocumentCollection, key: string): Promise<T | null> {
  return getLocalDocument<T>(collection, key);
}

export async function setDocument(collection: LocalDocumentCollection, key: string, value: Record<string, unknown>): Promise<void> {
  setLocalDocument(collection, key, value);
}

export async function listDocuments<T>(collection: LocalDocumentCollection, limit?: number): Promise<T[]> {
  return listLocalDocuments<T>(collection, limit);
}

export async function deleteDocuments(collection: LocalDocumentCollection, keys: string[]): Promise<number> {
  return deleteLocalDocuments(collection, keys);
}
