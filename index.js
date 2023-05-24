import express, { json, query } from "express";
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
// delete users
const deleteUsers = async (uid) => {
  const uids = Array.isArray(uid) ? uid : Array.of(uid);
  try {
    await admin.auth().deleteUsers(uids);
    console.log(`user deleted successfully`);
  } catch (error) {
    console.error(`failed to delete user`);
  }
};

// delete documents
const deleteDocuments = async (uidsList, dbRef) => {
  const uids = Array.isArray(uidsList) ? uidsList : Array.of(uidsList);
  // note: explore/learn about using async-await with loops
  try {
    for (const uid of uids) {
      const userRef = db.collection(dbRef).doc(uid);
      await userRef.delete();
    };
    console.log("Documents deleted successfully");
  } catch (error) {
    console.error("Error deleting documents");
  }
}

// todo: authenticate the requesting user's token
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
              contactNumber: null,
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

// delete students account and documents
app.delete("/deleteStudents", async (req, res) => {
  try {
    const reqData = JSON.parse(req.body);
    const idToken = reqData.token;
    // todo: put this statement in a try-catch block
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    if (decodedToken.role !== "admin") {
      return res.status(401).json({
        code: "failed",
        message: "Not authorized to delete users",
      });
    }

    const studentUids = reqData.rows;

    // Delete users and documents in parallel
    await Promise.all([
      deleteUsers(studentUids),
      deleteDocuments(studentUids, "users_student"),
    ]);

    console.log("deleted successfully");
    return res.json({
      code: "success",
      message: "Student's account and records deleted successfully",
    });
  } catch (error) {
    console.error("error deleting", error);
    return res.status(500).json({
      code: "failed",
      message: "Failed to delete student's account and records",
    });
  }
});

// delete Tpos account and documents
app.delete("/deleteTpos", async (req, res) => {
  try {
    const reqData = JSON.parse(req.body);
    const idToken = reqData.token;
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    if (decodedToken.role !== "admin") {
      return res.status(401).json({
        code: "failed",
        message: "Not authorized to delete users",
      });
    }

    const tpoUids = reqData.rows;

    // Delete users and documents in parallel
    await Promise.all([
      deleteUsers(tpoUids),
      deleteDocuments(tpoUids, "users_tpo"),
    ]);

    console.log("deleted successfully");
    return res.json({
      code: "success",
      message: "Student's account and records deleted successfully",
    });
  } catch (error) {
    console.error("error deleting", error);
    return res.status(500).json({
      code: "failed",
      message: "Failed to delete student's account and records",
    });
  }
});

// Create new company
app.post("/addNewCompany", async (req, res) => {
  try {
    const idToken = req.body.token;
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    if (decodedToken.role !== "tpo") {
      return res.status(401).json({
        code: "failed",
        message: "Not authorized to add companies",
      });
    }

    const data = req.body.details;
    data.studentsPlaced =[];
    const companiesCollectionRef = db.collection("companies");

    // Adding a new document with an auto-generated ID
    const newCompanyRef = companiesCollectionRef.doc();
    newCompanyRef.set(data);

    console.log("successfully added a new company");
    res.json({
      code: "success",
      message: "Successfully added a new company.",
    })
  } catch (error) {
    console.error("Error adding new company");
    res.json({
      code: "failed",
      message: "Failed to add a new company",
    });
  }
});

// delete company/companies
app.delete("/deleteCompanies", async (req, res) => {
  try {
    const reqData = JSON.parse(req.body);
    const idToken = reqData.token;
    // todo: put this statement in a try-catch block
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    if (decodedToken.role !== "tpo") {
      return res.status(401).json({
        code: "failed",
        message: "Not authorized to delete users",
      });
    }

    const companyUids = reqData.rows;

    await deleteDocuments(companyUids, "companies");

    // console.log("deleted successfully");
    return res.json({
      code: "success",
      message: "Companies deleted successfully",
    });
  } catch (error) {
    console.error("error deleting", error);
    return res.status(500).json({
      code: "failed",
      message: "Failed to delete companies",
    });
  }
});

// add new placement drive
app.post("/addNewPlacementDrive", async (req, res) => {
  try {
    const idToken = req.body.token;
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    if (decodedToken.role !== "tpo") {
      return res.status(401).json({
        code: "failed",
        message: "Not authorized to add companies",
      });
    }

    const placementDetails = req.body.details;
    placementDetails.isActive = false;
    const placementDriveRef = db.collection("placements");

    try{   
    const querySnapshot = await placementDriveRef.where("companyUid", "==", placementDetails.companyUid).get();

    if(!querySnapshot.empty) {
      return res.json({
        code: "failed",
        message: `Placement Drive for ${placementDetails.companyName} already exists`,
      });
    }
    } catch (error) {
      console.log("error fetching placement with same company");
    }

    // add new placement drive
    const newPlacementDriveRef = placementDriveRef.doc();
    newPlacementDriveRef.set(placementDetails);

    console.log("successfully added a new placement drive");
    res.json({
      code: "success",
      message: "Successfully added a new placement drive.",
    })
} catch (error) {
  console.error("Error adding new placement drive");
  res.json({
    code: "failed",
    message: "Failed to add a new placement drive",
  });
}
});

export { app };
