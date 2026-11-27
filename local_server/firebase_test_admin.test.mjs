import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { createFirebaseTestWriter } from './firebase_test_admin.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

test('requires distinct valid Firebase test and production project IDs', async () => {
  await assert.rejects(createFirebaseTestWriter({
    testProjectId: 'test-project',
    productionProjectId: 'test-project',
    credentialsPath: 'unused',
    repositoryRoot
  }), /Distinct valid/);
});

test('rejects credentials stored in the repository before parsing them', async () => {
  await assert.rejects(createFirebaseTestWriter({
    testProjectId: 'test-project',
    productionProjectId: 'prod-project',
    credentialsPath: path.join(repositoryRoot, 'local_server', 'package.json'),
    repositoryRoot
  }), /stored outside the repository/);
});

test('requires an external service-account path', async () => {
  await assert.rejects(createFirebaseTestWriter({
    testProjectId: 'test-project',
    productionProjectId: 'prod-project',
    credentialsPath: '',
    repositoryRoot
  }), /GOOGLE_APPLICATION_CREDENTIALS/);
});

test('creates an emulator writer without service-account credentials', async () => {
  const previousHost = process.env.FIRESTORE_EMULATOR_HOST;
  delete process.env.FIRESTORE_EMULATOR_HOST;
  try {
    const writer = await createFirebaseTestWriter({
      testProjectId: 'demo-fault-tolerant-iot',
      productionProjectId: '',
      useEmulator: true,
      emulatorHost: '127.0.0.1:8080',
      credentialsPath: '',
      repositoryRoot
    });
    assert.equal(typeof writer, 'function');
    assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  } finally {
    if (previousHost === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
    else process.env.FIRESTORE_EMULATOR_HOST = previousHost;
  }
});

test('restricts emulator connections to loopback and demo project IDs', async () => {
  const commonOptions = {
    productionProjectId: '',
    useEmulator: true,
    credentialsPath: '',
    repositoryRoot
  };
  await assert.rejects(createFirebaseTestWriter({
    ...commonOptions,
    testProjectId: 'demo-fault-tolerant-iot',
    emulatorHost: 'firestore.example.com:8080'
  }), /loopback address/);
  await assert.rejects(createFirebaseTestWriter({
    ...commonOptions,
    testProjectId: 'test-project',
    emulatorHost: '127.0.0.1:8080'
  }), /demo- project ID/);
});
