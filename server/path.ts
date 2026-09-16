/** A path segment decoded, or null when the escape is malformed (Stage 57): a bad escape is a 404, not a thrown request. */
export function decodePath(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}
