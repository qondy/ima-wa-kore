import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// NOTE: Firebase の Web 設定は秘匿情報ではなく、実質的な防御は firestore.rules 側で行う。
// （他のミニアプリと同様に、この値はコミットして良い）
const firebaseConfig = {
  apiKey: 'AIzaSyDcpseNkXPaFimhVIDZf2Zd3QqctBD1RlI',
  authDomain: 'ima-wa-kore.firebaseapp.com',
  projectId: 'ima-wa-kore',
  storageBucket: 'ima-wa-kore.firebasestorage.app',
  messagingSenderId: '1003324279975',
  appId: '1:1003324279975:web:de00aefb60250aaa2a1f82',
};

export const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
