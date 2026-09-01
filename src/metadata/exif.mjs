import exifr from 'exifr'

export async function readPhotoMetadata(buffer, browserLastModified = null) {
  try {
    const exif = await exifr.parse(buffer, { tiff: true, exif: true, gps: true })
    const capture = exif?.DateTimeOriginal || exif?.CreateDate || exif?.ModifyDate
    return {
      width: exif?.ImageWidth || exif?.ExifImageWidth || null,
      height: exif?.ImageHeight || exif?.ExifImageHeight || null,
      orientation: exif?.Orientation || null,
      exifCaptureDate: capture instanceof Date ? capture.toISOString() : capture || null,
      exifGps: Number.isFinite(exif?.latitude) && Number.isFinite(exif?.longitude)
        ? { latitude: exif.latitude, longitude: exif.longitude }
        : null,
      browserLastModified: browserLastModified || null,
      metadataError: null
    }
  } catch (error) {
    return {
      width: null,
      height: null,
      orientation: null,
      exifCaptureDate: null,
      exifGps: null,
      browserLastModified: browserLastModified || null,
      metadataError: String(error.message || error)
    }
  }
}
