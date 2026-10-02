import sharp from "sharp"

/**
 * Phone photos and screenshots run to several MB, while WhatsApp shows
 * images at most around 1600px and recompresses them anyway. Shrinking them
 * first makes the send faster and the stored copy a fraction of the size.
 */

const MAX_SIDE = 1600
const JPEG_QUALITY = 80

export async function optimizeImage(
  input: Buffer
): Promise<{ data: Buffer; mimeType: string }> {
  const data = await sharp(input, { failOn: "none" })
    // Phones store rotation as EXIF; bake it in before metadata is dropped.
    .rotate()
    .resize({
      width: MAX_SIDE,
      height: MAX_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    })
    // JPEG has no transparency: a transparent PNG would turn black.
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer()

  return { data, mimeType: "image/jpeg" }
}
