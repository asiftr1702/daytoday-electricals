/**
 * set-admin-password.js
 * ---------------------
 * Run with:  node scripts/set-admin-password.js
 *
 * Prompts for a new admin password, hashes it with SHA-256,
 * and stores the hash in Firestore at config/admin.passwordHash.
 * The plaintext password is never stored anywhere.
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc } = require('firebase/firestore');
const { createHash } = require('crypto');
const readline = require('readline');

const firebaseConfig = {
  apiKey: 'AIzaSyDSMiCMxtV3LXTQQOqxnN8rAwdbaS6ISA0',
  authDomain: 'daytoday-electricals.firebaseapp.com',
  projectId: 'daytoday-electricals',
};

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function ask(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(prompt, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const password = await ask('Enter new admin password: ');

  if (!password.trim()) {
    console.error('❌ Password cannot be empty.');
    process.exit(1);
  }

  const confirm = await ask('Confirm new admin password: ');

  if (password !== confirm) {
    console.error('❌ Passwords do not match.');
    process.exit(1);
  }

  const hash = sha256(password);

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  await setDoc(doc(db, 'config', 'admin'), { passwordHash: hash });

  console.log('✅ Admin password updated successfully.');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Failed to update password:', err.message ?? err);
  process.exit(1);
});
