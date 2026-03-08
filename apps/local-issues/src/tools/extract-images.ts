export interface ExtractedImage {
  url: string;
  alt: string;
  data: string;
  content_type: string;
}

export interface SkippedUrl {
  url: string;
  reason: string;
}

export interface ExtractImagesResult {
  images: ExtractedImage[];
  skipped_urls: SkippedUrl[];
  error?: { code: string; message: string };
}

export interface ExtractImagesParams {
  markdown: string;
  base_url?: string;
}

const IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;
const FETCH_TIMEOUT_MS = 10_000;

function isAbsoluteUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

function isDataUrl(url: string): boolean {
  return url.startsWith("data:");
}

function isRelativeUrl(url: string): boolean {
  return !isAbsoluteUrl(url) && !isDataUrl(url);
}

function parseDataUrl(url: string): { data: string; content_type: string } | null {
  const match = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { content_type: match[1]!, data: match[2]! };
}

interface ParsedImageRef {
  alt: string;
  rawUrl: string;
}

function parseMarkdownImages(markdown: string): { refs: ParsedImageRef[]; hasMalformed: boolean } {
  const refs: ParsedImageRef[] = [];
  let hasMalformed = false;

  const allImageLike = /!\[/g;
  const validImagePattern = /!\[[^\]]*\]\([^)]+\)/g;

  const allMatches = markdown.match(allImageLike);
  const validMatches = markdown.match(validImagePattern);
  if (allMatches && validMatches && allMatches.length > validMatches.length) {
    hasMalformed = true;
  }

  let match: RegExpExecArray | null;
  while ((match = IMAGE_REGEX.exec(markdown)) !== null) {
    refs.push({ alt: match[1]!, rawUrl: match[2]! });
  }
  IMAGE_REGEX.lastIndex = 0;

  return { refs, hasMalformed };
}

async function fetchImageAsBase64(
  url: string,
): Promise<{ data: string; content_type: string } | { error: string }> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { error: `HTTP ${response.status}` };
    }
    const buffer = await response.arrayBuffer();
    const data = Buffer.from(buffer).toString("base64");
    const content_type = response.headers.get("Content-Type") ?? "application/octet-stream";
    return { data, content_type };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { error: "The operation was aborted" };
    }
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function extractImages(params: ExtractImagesParams): Promise<ExtractImagesResult> {
  const { markdown, base_url } = params;
  const { refs, hasMalformed } = parseMarkdownImages(markdown);

  if (hasMalformed) {
    console.error("[WARNING] Malformed markdown image syntax detected; extracting parseable parts only");
  }

  const hasRelative = refs.some((ref) => isRelativeUrl(ref.rawUrl));
  if (hasRelative && !base_url) {
    return {
      images: [],
      skipped_urls: [],
      error: {
        code: "RELATIVE_URL_WITHOUT_BASE",
        message: "Relative URLs found in markdown but no base_url was provided",
      },
    };
  }

  const images: ExtractedImage[] = [];
  const skipped_urls: SkippedUrl[] = [];

  for (const ref of refs) {
    let resolvedUrl = ref.rawUrl;

    if (isDataUrl(resolvedUrl)) {
      const parsed = parseDataUrl(resolvedUrl);
      if (parsed) {
        images.push({
          url: resolvedUrl,
          alt: ref.alt,
          data: parsed.data,
          content_type: parsed.content_type,
        });
      } else {
        skipped_urls.push({ url: resolvedUrl, reason: "Invalid data URL format" });
      }
      continue;
    }

    if (isRelativeUrl(resolvedUrl) && base_url) {
      resolvedUrl = new URL(resolvedUrl, base_url).href;
    }

    const fetchResult = await fetchImageAsBase64(resolvedUrl);
    if ("error" in fetchResult) {
      skipped_urls.push({ url: resolvedUrl, reason: fetchResult.error });
    } else {
      images.push({
        url: resolvedUrl,
        alt: ref.alt,
        data: fetchResult.data,
        content_type: fetchResult.content_type,
      });
    }
  }

  return { images, skipped_urls };
}
