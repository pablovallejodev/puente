/**
 * Pure checks for download task id / job state helpers.
 * Run: pnpm check:model-download-job
 */

import assert from 'node:assert/strict';

import {
  createDownloadJobState,
  makeDownloadTaskId,
  parseDownloadJobState,
  parseDownloadTaskId,
  serializeDownloadJobState,
} from '../src/lib/model-download-job';

function main(): void {
  const taskId = makeDownloadTaskId('nllb-600m-q8', 'encoder_model_quantized.onnx');
  assert.equal(taskId, 'puente:nllb-600m-q8:encoder_model_quantized.onnx');

  const parsed = parseDownloadTaskId(taskId);
  assert.ok(parsed);
  assert.equal(parsed.modelId, 'nllb-600m-q8');
  assert.equal(parsed.relativePath, 'encoder_model_quantized.onnx');
  assert.equal(parseDownloadTaskId('other:x:y'), null);
  assert.equal(parseDownloadTaskId('puente:onlymodel'), null);

  const job = createDownloadJobState('whisper-base-q');
  assert.equal(job.status, 'active');
  assert.equal(job.selectOnComplete, true);
  assert.deepEqual(job.completedFiles, []);

  job.status = 'paused';
  job.completedFiles.push('model.onnx');
  job.currentFile = 'tokens.txt';
  job.bytesWritten = 12_345;

  const roundTrip = parseDownloadJobState(serializeDownloadJobState(job));
  assert.ok(roundTrip);
  assert.equal(roundTrip.status, 'paused');
  assert.equal(roundTrip.modelId, 'whisper-base-q');
  assert.deepEqual(roundTrip.completedFiles, ['model.onnx']);
  assert.equal(roundTrip.currentFile, 'tokens.txt');
  assert.equal(roundTrip.bytesWritten, 12_345);

  assert.equal(parseDownloadJobState('{'), null);
  assert.equal(parseDownloadJobState('{"modelId":"x"}'), null);

  console.log('check-model-download-job: ok');
}

main();
