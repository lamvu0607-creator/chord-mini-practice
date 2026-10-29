import { isUploadSourceId, toUploadSourceId, UPLOAD_SOURCE_ID_PREFIX } from '@/utils/uploadSourceId';

describe('uploadSourceId', () => {
  it('builds upload_ ids from the first 24 hex chars of a digest', () => {
    const id = toUploadSourceId('ABCDEF0123456789abcdef0123456789ffff');
    expect(id).toBe(`${UPLOAD_SOURCE_ID_PREFIX}abcdef0123456789abcdef01`);
    expect(isUploadSourceId(id)).toBe(true);
  });

  it('does not treat YouTube ids or malformed values as uploads', () => {
    expect(isUploadSourceId('dQw4w9WgXcQ')).toBe(false);
    expect(isUploadSourceId('upload_123')).toBe(false);
    expect(isUploadSourceId('upload_0123456789ABCDEF01234567')).toBe(false);
    expect(isUploadSourceId(null)).toBe(false);
    expect(isUploadSourceId(undefined)).toBe(false);
  });
});
