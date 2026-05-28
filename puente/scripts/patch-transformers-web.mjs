import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = process.argv[2];

if (!target) {
  console.error('Usage: node scripts/patch-transformers-web.mjs <path/to/transformers.web.js>');
  process.exit(1);
}

const RN_PATH_CHECK =
  '(apis.IS_NODE_ENV || typeof navigator !== "undefined" && navigator.product === "ReactNative")';

let contents = fs.readFileSync(target, 'utf8');

const fileResponseClass = `var FileResponse = class _FileResponse {
  /**
   * Creates a new \`FileResponse\` object backed by expo-file-system on React Native.
   * @param {string} filePath
   */
  constructor(filePath) {
    this.filePath = filePath;
    this.headers = new Headers();
    const expoFileSystem = require("expo-file-system");
    const file = new expoFileSystem.File(filePath);
    this.exists = file.exists;
    if (this.exists) {
      this.status = 200;
      this.statusText = "OK";
      this.headers.set("content-length", String(file.size));
      this.updateContentType();
      this.body = file.readableStream();
    } else {
      this.status = 404;
      this.statusText = "Not Found";
      this.body = null;
    }
  }
  /**
   * Updates the 'content-type' header property of the response based on the extension of
   * the file specified by the filePath property of the current object.
   * @returns {void}
   */
  updateContentType() {
    const extension = this.filePath.toString().split(".").pop().toLowerCase();
    this.headers.set("content-type", CONTENT_TYPE_MAP[extension] ?? "application/octet-stream");
  }
  /**
   * Clone the current FileResponse object.
   * @returns {FileResponse} A new FileResponse object with the same properties as the current object.
   */
  clone() {
    let response = new _FileResponse(this.filePath);
    response.exists = this.exists;
    response.status = this.status;
    response.statusText = this.statusText;
    response.headers = new Headers(this.headers);
    return response;
  }
  /**
   * Reads the contents of the file specified by the filePath property and returns a Promise that
   * resolves with an ArrayBuffer containing the file's contents.
   * @returns {Promise<ArrayBuffer>} A Promise that resolves with an ArrayBuffer containing the file's contents.
   * @throws {Error} If the file cannot be read.
   */
  async arrayBuffer() {
    const expoFileSystem = require("expo-file-system");
    const file = new expoFileSystem.File(this.filePath);
    return file.arrayBuffer();
  }
  /**
   * Reads the contents of the file specified by the filePath property and returns a Promise that
   * resolves with a Blob containing the file's contents.
   * @returns {Promise<Blob>} A Promise that resolves with a Blob containing the file's contents.
   * @throws {Error} If the file cannot be read.
   */
  async blob() {
    const expoFileSystem = require("expo-file-system");
    const file = new expoFileSystem.File(this.filePath);
    return file;
  }
  /**
   * Reads the contents of the file specified by the filePath property and returns a Promise that
   * resolves with a string containing the file's contents.
   * @returns {Promise<string>} A Promise that resolves with a string containing the file's contents.
   * @throws {Error} If the file cannot be read.
   */
  async text() {
    const expoFileSystem = require("expo-file-system");
    const file = new expoFileSystem.File(this.filePath);
    return file.text();
  }
  /**
   * Reads the contents of the file specified by the filePath property and returns a Promise that
   * resolves with a parsed JavaScript object containing the file's contents.
   *
   * @returns {Promise<Object>} A Promise that resolves with a parsed JavaScript object containing the file's contents.
   * @throws {Error} If the file cannot be read.
   */
  async json() {
    return JSON.parse(await this.text());
  }
};`;

const classStart = contents.indexOf('var FileResponse = class _FileResponse {');
const classEnd = contents.indexOf('\n};', contents.indexOf('async json()', classStart)) + 3;

if (classStart === -1 || classEnd <= classStart) {
  console.error('Could not locate FileResponse class in transformers.web.js');
  process.exit(1);
}

contents = contents.slice(0, classStart) + fileResponseClass + contents.slice(classEnd);

contents = contents.replaceAll('apis.IS_NODE_ENV && return_path', `${RN_PATH_CHECK} && return_path`);
contents = contents.replaceAll('!apis.IS_NODE_ENV && return_path', `!${RN_PATH_CHECK} && return_path`);
contents = contents.replaceAll(
  'return await getModelFile(pretrained_model_name_or_path, fullPath, true, options, apis.IS_NODE_ENV)',
  `return await getModelFile(pretrained_model_name_or_path, fullPath, true, options, ${RN_PATH_CHECK})`,
);
contents = contents.replaceAll('const return_path = apis.IS_NODE_ENV;', `const return_path = ${RN_PATH_CHECK};`);

fs.writeFileSync(target, contents);
console.log(`Patched ${target}`);
