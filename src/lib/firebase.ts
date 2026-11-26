import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  disableNetwork,
  enableNetwork,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const OWNER_EMAIL = 'abrehamreigns@gmail.com';

let firestoreQuotaLocked = false;

export function isFirestoreQuotaLocked(): boolean {
  return firestoreQuotaLocked;
}

export function lockFirestoreForQuota(): void {
  if (firestoreQuotaLocked) return;
  firestoreQuotaLocked = true;
  // Stop Firestore SDK background stream retries ("Using maximum backoff delay")
  void disableNetwork(db).catch(() => {});
}

export async function unlockFirestoreForRetry(): Promise<void> {
  firestoreQuotaLocked = false;
  await enableNetwork(db);
}

export function isOwnerUser(user: User | null): boolean {
  if (!user) return false;
  return Boolean(
    user.emailVerified &&
      user.email?.toLowerCase() === OWNER_EMAIL.toLowerCase()
  );
}

export async function signInOwner(): Promise<User> {
  googleProvider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutOwner(): Promise<void> {
  await signOut(auth);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const lower = rawMessage.toLowerCase();
  if (
    lower.includes('quota exceeded') ||
    lower.includes('quota limit exceeded') ||
    lower.includes('resource-exhausted')
  ) {
    lockFirestoreForQuota();
  }

  const errInfo: FirestoreErrorInfo = {
    error: rawMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return;
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error) {
      const lower = error.message.toLowerCase();
      if (
        lower.includes('quota exceeded') ||
        lower.includes('quota limit exceeded') ||
        lower.includes('resource-exhausted')
      ) {
        lockFirestoreForQuota();
      } else if (
        error.message.includes('the client is offline') &&
        (typeof navigator === 'undefined' || navigator.onLine !== false)
      ) {
        console.error('Please check your Firebase configuration.');
      }
    }
  }
}

export const connectionCheckPromise: Promise<void> = testConnection();
