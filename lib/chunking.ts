export function splitIntoChunks(
  text: string,
  chunkSize = 500,
  overlap = 50,
): string[] {
  const normalizedText = text.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();

  if (!normalizedText) {
    return [];
  }

  const sentences = normalizedText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences.length ? sentences : [normalizedText]) {
    if (!current) {
      current = sentence;
      continue;
    }

    if (`${current} ${sentence}`.length <= chunkSize) {
      current = `${current} ${sentence}`;
      continue;
    }

    chunks.push(current);
    const overlapText = current.slice(Math.max(0, current.length - overlap)).trim();
    current = overlapText ? `${overlapText} ${sentence}` : sentence;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks
    .flatMap((chunk) => splitLongChunk(chunk, chunkSize, overlap))
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function splitLongChunk(chunk: string, chunkSize: number, overlap: number) {
  if (chunk.length <= chunkSize) {
    return [chunk];
  }

  const parts: string[] = [];
  let start = 0;

  while (start < chunk.length) {
    const end = Math.min(start + chunkSize, chunk.length);
    parts.push(chunk.slice(start, end).trim());

    if (end >= chunk.length) {
      break;
    }

    start = Math.max(end - overlap, start + 1);
  }

  return parts;
}
