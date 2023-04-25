// POC: how to set custom claims on a user
/**
 * note: there are two different class of packages for firebase
 * 1. for client side
 * 2. for server side
 * 
 * difference between firebase/app and firebase-admin
 * 
firebase/app is the client-side Firebase SDK that can be used in web and mobile applications to interact with Firebase services such as Authentication, Realtime Database, Cloud Firestore, Storage, and more. It is designed to run in the browser or on mobile devices and it allows developers to build apps that can authenticate users, store and retrieve data, and handle real-time events.

On the other hand, firebase-admin is the server-side SDK for Firebase. It is designed to be used in server environments such as Node.js and provides access to Firebase services such as Authentication, Realtime Database, Cloud Firestore, Cloud Storage, and more. It allows developers to perform administrative tasks like managing users, sending notifications, and executing server-side code. It also provides features such as custom authentication, custom claims, and App Check, which are not available in the client-side SDK.

The key difference between these two SDKs is that firebase/app is used to access Firebase services from a client-side application (such as a web or mobile app), while firebase-admin is used to access Firebase services from a server-side application (such as a Node.js app).
 * 
*/

/**
 * this script was used to setup "role" custom claim of "admin" on a user
 * note: this used the server package
 */

import admin from "firebase-admin";
import fs from 'fs';
const serviceAccountPath = "./service-account.json";
const SERVICE_ACCOUNT = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

// Initialize the Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(SERVICE_ACCOUNT)
});

const email = "sandeeptech8@gmail.com";

let user = null;

// fetch the user
try {
  user = await admin.auth().getUserByEmail(email);
} catch (error) {
  console.error(`:: Error fetching user with email "${email}" ::`);
  console.error(error);
}

// // set "custom claim" the "role" to "admin"
// if (user) {
//   admin.auth().setCustomUserClaims(user.uid, { role: "admin" });
//   console.log(":: INFO: custom claim added ::");
// }

// log the custom claims proprty on user
console.log(user.customClaims);
