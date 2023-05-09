import express, { json } from "express";
import cors from "cors";
import admin from "firebase-admin";
import fs from "fs";
import dotenv from "dotenv";
import { generatePassword } from "./utils.js";
import mailer from "./Mailer.js";

dotenv.config();

// initialize the Firebase Admin SDK
const serviceAccountPath = "./service-account.json";
const SERVICE_ACCOUNT = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
admin.initializeApp({
  credential: admin.credential.cert(SERVICE_ACCOUNT),
});

// initalize db
const db = admin.firestore();

// initialize express app
const app = express();
const corsOptions = {
  origin: "http://localhost:5173",
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// utils
const deleteUsers = async (uid) => {
  const uids = Array.isArray(uid) ? uid : Array.of(uid);
  console.log(uids);
  try {
    await admin.auth().deleteUsers(uids);
    console.log(`user deleted successfully`);
  } catch (error) {
    console.error(`failed to delete user`);
  }
};

const deleteStudentsDocuments = async (studentUids) => {
  const uids = Array.isArray(studentUids) ? studentUids : Array.of(studentUids);

  try {
    for (const uid of uids) {
      const userRef = db.collection("users_student").doc(uid);
      await userRef.delete();
    };
    console.log("Student docs deleted successfully");
  } catch (error) {
    console.error("Error deleting student docs");
  }
}

// create new user
app.post("/users", async (req, res) => {
  const {
    email,
    password = generatePassword(),
    firstName,
    lastName,
  } = req.body;

  // create a new user with the give email, password and name
  const creds = {
    email,
    password,
    displayName: `${firstName} ${lastName}`,
  };

  const setCustomUserClaims = async (uid, claims) => {
    try {
      await admin.auth().setCustomUserClaims(uid, claims);
      return true;
    } catch (error) {
      console.error(
        `failed to set custom claims for the user ${creds.displayName} (${creds.email})`
      );
      return null;
    }
  };

  let newlyCreatedUserRecord = null;
  try {
    newlyCreatedUserRecord = await admin.auth().createUser(creds);
  } catch (error) {
    // log the error details
    console.error(
      `failed to create user ${creds.displayName} (${creds.email})`
    );
    console.error(error.code);
    console.error(error);

    // prepare and send the res

    // handle "email already exists" error
    if (error.code === "auth/email-already-exists") {
      res.status(403).send({
        code: "email-already-exists",
        message: "Given email already exists for another user",
      });
      return;
    }

    // handle rest of the errors
    res.status(403).send({
      code: "general-error",
      message: `failed to create user ${creds.displayName} (${creds.email})`,
    });
  }

  if (newlyCreatedUserRecord) {
    // create a corresponding record for the user in the database
    switch (req.body.role) {
      case "tpo": {
        // set customClaims (role)
        const isRoleSet = setCustomUserClaims(newlyCreatedUserRecord.uid, {
          role: "tpo",
        });

        // create user corresponsing document in the db
        if (isRoleSet) {
          try {
            const userRef = db
              .collection("users_tpo")
              .doc(newlyCreatedUserRecord.uid);
            userRef.set({
              firstName: req.body.firstName,
              lastName: req.body.lastName,
              email: req.body.email,
              id: req.body.id,
              gender: req.body.gender,
              dob: req.body.dob,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            mailer.sendWelcomeMessageWithPresetPassword(
              creds.email,
              creds.password,
              creds.displayName
            );
            res.status(201).send({
              code: "success",
              message: `new user ${creds.displayName} created`,
            });
          } catch (error) {
            console.error(
              `failed to create the corresponding db record for the user ${creds.displayName} (${creds.email})`
            );
            await deleteUsers(newlyCreatedUserRecord.uid);
            res.send({
              code: "general-error",
              message: `failed to create user ${creds.displayName} (${creds.email})`,
            });
          }
        }
        break;
      }
      case "student": {
        // set customClaims (role)
        const isRoleSet = setCustomUserClaims(newlyCreatedUserRecord.uid, {
          role: "student",
        });

        // create user corresponsing document in the db
        if (isRoleSet) {
          try {
            const userRef = db
              .collection("users_student")
              .doc(newlyCreatedUserRecord.uid);
            userRef.set({
              firstName: req.body.firstName,
              lastName: req.body.lastName,
              email: req.body.email,
              prn: req.body.prn,
              gender: req.body.gender,
              dob: req.body.dob,
              rollNo: req.body.rollNo,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              isPlaced: false,
              batch: null,
              placementsAppliedTo: [],
              tenthPercentage: null,
              twelfthPercentage: null,
              tenthYearOfPassing: null,
              twelfthYearOfPassing: null,
              ugCgpa: null,
              ugYearOfPassing: null,
              pgCgpa: null,
              pgYearOfPassing: null,
              contactNumber: null,
              resume: null,
            });
            mailer.sendWelcomeMessageWithPresetPassword(
              creds.email,
              creds.password,
              creds.displayName
            );
            res.status(201).send({
              code: "success",
              message: `new user ${creds.displayName} created`,
            });
          } catch (error) {
            console.error(
              `failed to create the corresponding db record for the user ${creds.displayName} (${creds.email})`
            );
            await deleteUsers(newlyCreatedUserRecord.uid);
            res.send({
              code: "general-error",
              message: `failed to create user ${creds.displayName} (${creds.email})`,
            });
          }
        }
        break;
      }
      default: {
        break;
        console.error("unknown request to add new user received");
        console.log(req);
      }
    }
  }
});

app.delete("/students", async (req, res) => {
  const reqData = JSON.parse(req.body);
  const studentUids = reqData.rows;
  try {
    await deleteUsers(studentUids);
    await deleteStudentsDocuments(studentUids);
    console.log("deleted successfully");
    res.send({
      code: "success",
      message: "Student's account and records deleted successfully"
    });
  } catch (error) {
    console.error("error deleting");
    res.send({
      code: "failed",
      message: "Failed to delete student's account and records"
    });
  }
});

export { app };
