import fs from 'node:fs';
import path from 'node:path';

const soundPath = path.resolve(
  process.cwd(),
  'android/app/src/main/res/raw/kelani_rest_timer_quiet.wav'
);

function readPcm16PeakRatio(wav) {
  expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
  expect(wav.toString('ascii', 8, 12)).toBe('WAVE');

  let offset = 12;
  let format = null;
  let samples = null;

  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = Math.min(dataStart + size, wav.length);

    if (id === 'fmt ') {
      format = {
        encoding: wav.readUInt16LE(dataStart),
        channels: wav.readUInt16LE(dataStart + 2),
        sampleRate: wav.readUInt32LE(dataStart + 4),
        bitsPerSample: wav.readUInt16LE(dataStart + 14),
      };
    } else if (id === 'data') {
      samples = wav.subarray(dataStart, dataEnd);
    }

    offset = dataStart + size + (size % 2);
  }

  expect(format).toEqual({
    encoding: 1,
    channels: 1,
    sampleRate: 44100,
    bitsPerSample: 16,
  });
  expect(samples).not.toBeNull();

  let peak = 0;
  for (let index = 0; index + 1 < samples.length; index += 2) {
    peak = Math.max(peak, Math.abs(samples.readInt16LE(index)));
  }

  return peak / 32767;
}

test('rest timer notification sound is audible without approaching clipping', () => {
  const peakRatio = readPcm16PeakRatio(fs.readFileSync(soundPath));

  expect(peakRatio).toBeGreaterThanOrEqual(0.65);
  expect(peakRatio).toBeLessThanOrEqual(0.8);
});
