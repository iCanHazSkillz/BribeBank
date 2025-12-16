import sharp from 'sharp';

/**
 * Process and compress an avatar image
 * - Converts to JPEG format
 * - Resizes to max 200x200 pixels (maintaining aspect ratio)
 * - Compresses to reduce file size
 * - Returns as base64 data URL
 */
export async function processAvatar(base64DataUrl: string): Promise<string> {
  try {
    // Extract the base64 data from the data URL
    const matches = base64DataUrl.match(/^data:image\/([a-zA-Z+]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error('Invalid image data URL format');
    }

    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // Process the image: resize to 200x200 max, convert to JPEG, compress
    const processedBuffer = await sharp(buffer)
      .resize(200, 200, {
        fit: 'inside', // Maintain aspect ratio, fit within 200x200
        withoutEnlargement: true, // Don't enlarge smaller images
      })
      .jpeg({
        quality: 85, // Good quality while reducing file size
        progressive: true,
      })
      .toBuffer();

    // Convert back to base64 data URL
    const processedBase64 = processedBuffer.toString('base64');
    return `data:image/jpeg;base64,${processedBase64}`;
  } catch (error) {
    console.error('Error processing avatar image:', error);
    throw new Error('Failed to process image');
  }
}
