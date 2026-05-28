import { File } from 'expo-file-system';

const CONTENT_TYPE_MAP: Record<string, string> = {
  txt: 'text/plain',
  html: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  onnx: 'application/octet-stream',
  model: 'application/octet-stream',
};

function toExpoFile(filePath: string): File {
  return new File(filePath);
}

function resolveModelPath(file: File): string {
  return file.uri;
}

export class FileResponse {
  filePath: string;
  headers: Headers;
  exists: boolean;
  status: number;
  statusText: string;
  body: ReadableStream<Uint8Array> | null;

  constructor(filePath: string) {
    const file = toExpoFile(filePath);
    this.filePath = resolveModelPath(file);
    this.headers = new Headers();
    this.exists = file.exists;

    if (this.exists) {
      this.status = 200;
      this.statusText = 'OK';
      this.headers.set('content-length', String(file.size));
      this.updateContentType();
      this.body = file.readableStream();
    } else {
      this.status = 404;
      this.statusText = 'Not Found';
      this.body = null;
    }
  }

  updateContentType(): void {
    const extension = this.filePath.split('.').pop()?.toLowerCase() ?? '';
    this.headers.set('content-type', CONTENT_TYPE_MAP[extension] ?? 'application/octet-stream');
  }

  clone(): FileResponse {
    const response = new FileResponse(this.filePath);
    response.exists = this.exists;
    response.status = this.status;
    response.statusText = this.statusText;
    response.headers = new Headers(this.headers);
    return response;
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    const file = toExpoFile(this.filePath);
    return file.arrayBuffer();
  }

  async blob(): Promise<Blob> {
    const file = toExpoFile(this.filePath);
    return file;
  }

  async text(): Promise<string> {
    const file = toExpoFile(this.filePath);
    return file.text();
  }

  async json(): Promise<unknown> {
    return JSON.parse(await this.text());
  }
}
