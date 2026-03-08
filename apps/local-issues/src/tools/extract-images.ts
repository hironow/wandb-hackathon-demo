export interface ExtractedImage {
  url: string;
  alt: string;
}

const IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;

export function extractImages(markdown: string): ExtractedImage[] {
  const results: ExtractedImage[] = [];

  let match: RegExpExecArray | null;
  while ((match = IMAGE_REGEX.exec(markdown)) !== null) {
    results.push({
      alt: match[1]!,
      url: match[2]!,
    });
  }

  // Reset lastIndex for reuse
  IMAGE_REGEX.lastIndex = 0;

  return results;
}
