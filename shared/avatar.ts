import { z } from "zod";

export const MAX_AVATAR_LENGTH = 8192;
export const AVATAR_SIZE = 96;

// Only bounded, square JPEG thumbnails are accepted; no remote URLs or SVG.
export function isAvatarImage(value: string): boolean {
  if (
    value.length > MAX_AVATAR_LENGTH ||
    !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    return false;
  try {
    const bytes = atob(value.slice("data:image/jpeg;base64,".length));
    const byte = (i: number) => bytes.charCodeAt(i);
    if (
      byte(0) !== 255 ||
      byte(1) !== 216 ||
      byte(bytes.length - 2) !== 255 ||
      byte(bytes.length - 1) !== 217
    )
      return false;
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (byte(offset++) !== 255) return false;
      while (byte(offset) === 255) offset++;
      const marker = byte(offset++);
      if (marker === 218 || marker === 217) return false;
      const length = (byte(offset) << 8) | byte(offset + 1);
      if (length < 2 || offset + length > bytes.length) return false;
      if (marker === 192 || marker === 194) {
        if (length < 8) return false;
        const height = (byte(offset + 3) << 8) | byte(offset + 4);
        const width = (byte(offset + 5) << 8) | byte(offset + 6);
        return width === height && width >= 16 && width <= 128;
      }
      offset += length;
    }
  } catch {}
  return false;
}
export const avatarSchema = z.union([
  z.number().int().min(0).max(7),
  z
    .string()
    .max(MAX_AVATAR_LENGTH)
    .refine(isAvatarImage, "请选择有效的头像缩略图"),
]);
export type Avatar = z.infer<typeof avatarSchema>;
