import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createFirestoreTestWriter } from './test_event_delivery.mjs';

const APP_NAME = 'local-server-firebase-test-events';
const PROJECT_ID_PATTERN = /^[a-z0-9-]{6,30}$/;
const LOOPBACK_EMULATOR_HOST_PATTERN = /^(localhost|127\.0\.0\.1|\[::1\]):([0-9]{1,5})$/i;

function isWithinDirectory(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return relative === '' || (!path.isAbsolute(relative)
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`));
}

export async function createFirebaseTestWriter({
  testProjectId,
  productionProjectId,
  useEmulator = false,
  emulatorHost = '',
  credentialsPath,
  repositoryRoot
}) {
  if (typeof testProjectId !== 'string' || !PROJECT_ID_PATTERN.test(testProjectId)) {
    throw new Error('A valid Firebase test project ID is required.');
  }
  if (useEmulator) {
    if (!testProjectId.startsWith('demo-')
      || (productionProjectId
        && (!PROJECT_ID_PATTERN.test(productionProjectId)
          || testProjectId === productionProjectId))) {
      throw new Error('Firestore emulator mode requires a demo- project ID distinct from production.');
    }

    const emulatorMatch = typeof emulatorHost === 'string'
      ? LOOPBACK_EMULATOR_HOST_PATTERN.exec(emulatorHost)
      : null;
    const emulatorPort = Number(emulatorMatch?.[2]);
    if (!emulatorMatch || !Number.isInteger(emulatorPort)
      || emulatorPort < 1 || emulatorPort > 65535) {
      throw new Error('FIRESTORE_EMULATOR_HOST must use localhost or a loopback address and valid port.');
    }
    process.env.FIRESTORE_EMULATOR_HOST = emulatorHost;
  } else {
    if (typeof productionProjectId !== 'string'
      || !PROJECT_ID_PATTERN.test(productionProjectId)
      || testProjectId === productionProjectId
      || testProjectId.startsWith('demo-')) {
      throw new Error('Distinct valid cloud test and production Firebase project IDs are required.');
    }
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      throw new Error('FIRESTORE_EMULATOR_HOST is set while Firestore emulator mode is disabled.');
    }
    if (typeof credentialsPath !== 'string' || credentialsPath.trim() === '') {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS must point to a test-project service account file.');
    }
  }

  let serviceAccount;
  if (!useEmulator) {
    const credentialFile = await realpath(credentialsPath);
    const repositoryPath = await realpath(repositoryRoot);
    if (isWithinDirectory(repositoryPath, credentialFile)) {
      throw new Error('Firebase test credentials must be stored outside the repository.');
    }

    try {
      serviceAccount = JSON.parse(await readFile(credentialFile, 'utf8'));
    } catch {
      throw new Error('Firebase test service account file is unreadable or malformed.');
    }
    if (serviceAccount.project_id !== testProjectId
      || typeof serviceAccount.client_email !== 'string'
      || typeof serviceAccount.private_key !== 'string') {
      throw new Error('Firebase test service account does not match the configured test project.');
    }
  }

  const existingApp = getApps().find((app) => app.name === APP_NAME);
  const appOptions = { projectId: testProjectId };
  if (!useEmulator) appOptions.credential = cert(serviceAccount);
  const app = existingApp || initializeApp(appOptions, APP_NAME);
  if (app.options.projectId !== testProjectId) {
    throw new Error('Firebase Admin app is configured for a different project.');
  }

  return createFirestoreTestWriter(getFirestore(app));
}
