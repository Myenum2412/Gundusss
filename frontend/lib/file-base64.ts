/**
 * Read a File into its base64 payload (no data-URL prefix) so it can be
 * embedded in a JSON POST body for WhatsApp media sends.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? "")
      const comma = result.indexOf(",")
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"))
    reader.readAsDataURL(file)
  })
}
