import express, { json, query } from "express";
import cors from "cors";
import admin from "firebase-admin";
import fs from "fs";
import dotenv from "dotenv";
import { generatePassword } from "./utils.js";
import mailer from "./Mailer.js";
import * as XLSX from "xlsx";

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
app.use(express.raw({ type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));

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

// move to records
const moveToRecords = async (uidsList, dbRef) => {
  const uids = Array.isArray(uidsList) ? uidsList : Array.of(uidsList);

  try {
    for (const uid of uids) {
      const userRef = db.collection(dbRef).doc(uid);
      const userDoc = await userRef.get();
      const userData = userDoc.data();

      const batchRef = db.collection("records").doc(userData.batch);
      await batchRef.set({uid: userData.batch});
      const studentRef = batchRef.collection("students").doc(uid);
      await studentRef.set(userData);

      await userRef.delete();

    }
  } catch (error) {
    console.error("Error moving documents");
  }
}

// move placements to records
const moveToPlacementRecords = async (uidsList, dbRef) => {
  const uids = Array.isArray(uidsList) ? uidsList : Array.of(uidsList);

  try {
    for (const uid of uids) {
      const placementRef = db.collection(dbRef).doc(uid);
      const placementDoc = await placementRef.get();
      const placementData = placementDoc.data();
      const createdAtTimestamp = placementData.createdAt;
      const createdAtDate = createdAtTimestamp.toDate();
      const year = createdAtDate.getFullYear().toString();

      const batchRef = db.collection("placement_records").doc(year);
      await batchRef.set({uid: year});
      const studentRef = batchRef.collection("placements").doc(uid);
      await studentRef.set(placementData);

      await placementRef.delete();

    }
  } catch (error) {
    console.error("Error moving documents");
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
              isPlacedAt: null,
              offerLetter: null,
              salaryPackage: null,
              tempCompany: null,
              tempSalaryPackage: null,
              batch: req.body.batch,
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

// create multiple tpo at once
app.post("/addMultipleTpos", async (req, res) => {
  const workbook = XLSX.read(req.body, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 1 });

  try {
    for (const data of jsonData) {
      const [id, firstName, lastName, email, gender, contactNumber, dob] = data;
      const creds = {
        email: email,
        password: generatePassword(),
        displayName: `${firstName} ${lastName}`,
      };

      const newlyCreatedUserRecord = await admin.auth().createUser(creds);

      await admin.auth().setCustomUserClaims(newlyCreatedUserRecord.uid, {
        role: "tpo",
      });

      const userRef = db.collection("users_tpo").doc(newlyCreatedUserRecord.uid);
      await userRef.set({
        id: id,
        firstName: firstName,
        lastName: lastName,
        email: email,
        gender: gender,
        dob: dob,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        contactNumber: contactNumber,
      });

      mailer.sendWelcomeMessageWithPresetPassword(
        creds.email,
        creds.password,
        creds.displayName
      );
    }

    res.status(201).send({
      code: "success",
      message: "All users created successfully",
    });
  } catch (error) {
    console.error("Error creating users:", error);
    res.status(403).send({
      code: "general-error",
      message: "Failed to create users",
    });
  }
});

// create multiple students at once
app.post("/addMultipleStudents", async (req, res) => {
  const workbook = XLSX.read(req.body, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 1 });

  try {
    for (const data of jsonData) {
      const [rollNo, prn, firstName, lastName, batch, email, gender, contactNumber, dob] = data;
      const creds = {
        email: email,
        password: generatePassword(),
        displayName: `${firstName} ${lastName}`,
      };

      const newlyCreatedUserRecord = await admin.auth().createUser(creds);

      await admin.auth().setCustomUserClaims(newlyCreatedUserRecord.uid, {
        role: "student",
      });

      const userRef = db.collection("users_student").doc(newlyCreatedUserRecord.uid);
      await userRef.set({
              firstName: firstName,
              lastName: lastName,
              email: email,
              prn: prn,
              gender: gender,
              dob: dob,
              rollNo: rollNo,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              isPlaced: false,
              isPlacedAt: null,
              offerLetter: null,
              salaryPackage: null,
              tempCompany: null,
              tempSalaryPackage: null,
              batch: batch,
              placementsAppliedTo: [],
              tenthPercentage: null,
              twelfthPercentage: null,
              tenthYearOfPassing: null,
              twelfthYearOfPassing: null,
              ugCgpa: null,
              ugYearOfPassing: null,
              pgCgpa: null,
              pgYearOfPassing: null,
              contactNumber: contactNumber? contactNumber : null,
              resume: null,
      });

      mailer.sendWelcomeMessageWithPresetPassword(
        creds.email,
        creds.password,
        creds.displayName
      );
    }

    res.status(201).send({
      code: "success",
      message: "All users created successfully",
    });
  } catch (error) {
    console.error("Error creating users:", error);
    res.status(403).send({
      code: "general-error",
      message: "Failed to create users",
    });
  }
});

// delete students account and documents
app.delete("/permanentlyDeleteStudents", async (req, res) => {
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

// delete user students account and move their data to the records
app.delete("/deleteStudentAndMoveData", async (req, res) => {
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
      moveToRecords(studentUids, "users_student"),
    ]);

    console.log("user deleted and records moved successfully");
    return res.json({
      code: "success",
      message: "Student's account deleted and records moved successfully",
    });
  } catch (error) {
    console.error("error deleting", error);
    return res.status(500).json({
      code: "failed",
      message: "Failed to delete student's account and move records",
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
      message: "TPO's account and records deleted successfully",
    });
  } catch (error) {
    console.error("error deleting", error);
    return res.status(500).json({
      code: "failed",
      message: "Failed to delete TPO's account and records",
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
    placementDetails.studentsApplied = [];
    placementDetails.createdAt = admin.firestore.FieldValue.serverTimestamp();
    placementDetails.studentsPlaced = [];
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

// delete placement/placements permanently
app.delete("/permanentlyDeletePlacements", async (req, res) => {
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

    const placementUids = reqData.rows;

    await deleteDocuments(placementUids, "placements");

    // console.log("deleted successfully");
    return res.json({
      code: "success",
      message: "Placements deleted successfully",
    });
  } catch (error) {
    console.error("error deleting", error);
    return res.status(500).json({
      code: "failed",
      message: "Failed to delete companies",
    });
  }
});

// move placemnt data to the placement records
app.delete("/moveToPlacementRecords", async (req, res) => {
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

    const placementUids = reqData.rows;

    // Delete users and documents in parallel
    await moveToPlacementRecords(placementUids, "placements");

    console.log("Placement moved to records successfully");
    return res.json({
      code: "success",
      message: "Placement/placement's moved to records successfully",
    });
  } catch (error) {
    console.error("error deleting", error);
    return res.status(500).json({
      code: "failed",
      message: "Failed to move placement to records",
    });
  }
});

// download excel sheet of students applied for a particular placement
app.get("/downloadExcelSheet", async(req, res) => {

  try {
    const studentsUid = req.query.students.split(",");
    const placementDriveName = req.query.placementDriveName;
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet([]);
    const headerRow = ["First Name", "Last Name", "Email", "Resume link", "Roll no", "Date Of Birth", "Contact No.", "Post Graduate CGPA", "Under Graduate CGPA", "Post Graduate Year of Passing", "Under Graduate Year of Passing", "10th %", "12th %", "10th Year of passing", "12th year of passing"];

    XLSX.utils.sheet_add_aoa(worksheet, [headerRow], { origin: 0 });

    const fetchStudentData = async(uid) => {

      const docRef = db.collection("users_student").doc(uid);
      const docSnapshot = await docRef.get();
      const docData = docSnapshot.data();

      return docData;
    };

    const studentsDataPromises = studentsUid.map((uid) => fetchStudentData(uid));
    const studentsData = await Promise.all(studentsDataPromises);

    studentsData.forEach((studentData) => {
      const row = [
        studentData.firstName,
        studentData.lastName,
        studentData.email,
        studentData.resume,
        studentData.rollNo,
        `${studentData.dob.day}/${studentData.dob.month}/${studentData.dob.year}`,
        studentData.contactNumber,
        studentData.pgCgpa,
        studentData.ugCgpa,
        studentData.pgYearOfPassing,
        studentData.ugYearOfPassing,
        studentData.tenthPercentage,
        studentData.twelfthPercentage,
        studentData.tenthYearOfPassing,
        studentData.twelfthYearOfPassing
      ];

      XLSX.utils.sheet_add_aoa(worksheet, [row], { origin: -1 });
    });

    XLSX.utils.book_append_sheet(workbook, worksheet, `${placementDriveName}`);
    const excelData = XLSX.write(workbook, { type: "buffer" });

    res.setHeader("Content-Disposition", `attachment; filename=${placementDriveName}.xlsx`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    res.send(excelData);
  } catch (error) {
    console.error("Error creating Excel sheet:", error);
    res.status(500).send("Error creating Excel sheet");
  }

})

// download excel sheet of students applied for a particular placement from records
app.get("/downloadExcelSheetFromRecords", async(req, res) => {

  try {
    const studentsUid = req.query.students.split(",");
    const placementDriveName = req.query.placementDriveName;
    const studentBatch = req.query.batch;
    const year = studentBatch.toString();
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet([]);
    const headerRow = ["First Name", "Last Name", "Email", "Resume link", "Roll no", "Dob", "Contact No.", "Pg cgpa", "Ug cgpa", "Pg yop", "Ug yop", "Tenth %", "Twelfth %", "Tenth yop", "Twelfth yop"];

    XLSX.utils.sheet_add_aoa(worksheet, [headerRow], { origin: 0 });

    const fetchStudentData = async(uid) => {
      const uidToString = uid.toString().trim();
      const dbRef = db.collection(`records`).doc(year);
      const docRef = dbRef.collection("students").doc(uidToString);
      const docSnapshot = await docRef.get();
      const docData = docSnapshot.data();

      console.log(docData);

      return docData;
    };

    const studentsDataPromises = studentsUid.map((uid) => fetchStudentData(uid));
    const studentsData = await Promise.all(studentsDataPromises);

    studentsData.forEach((studentData) => {
      const row = [
        studentData.firstName,
        studentData.lastName,
        studentData.email,
        studentData.resume,
        studentData.rollNo,
        `${studentData.dob.day}/${studentData.dob.month}/${studentData.dob.year}`,
        studentData.contactNumber,
        studentData.pgCgpa,
        studentData.ugCgpa,
        studentData.pgYearOfPassing,
        studentData.ugYearOfPassing,
        studentData.tenthPercentage,
        studentData.twelfthPercentage,
        studentData.tenthYearOfPassing,
        studentData.twelfthYearOfPassing
      ];

      XLSX.utils.sheet_add_aoa(worksheet, [row], { origin: -1 });
    });

    XLSX.utils.book_append_sheet(workbook, worksheet, `${placementDriveName}`);
    const excelData = XLSX.write(workbook, { type: "buffer" });

    res.setHeader("Content-Disposition", `attachment; filename=${placementDriveName}.xlsx`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    res.send(excelData);
  } catch (error) {
    console.error("Error creating Excel sheet:", error);
    res.status(500).send("Error creating Excel sheet");
  }

})

// download excel sheet of students applied for a particular placement
app.get("/downloadExcelSheetOfStudents", async(req, res) => {

  try {
    const studentsUid = req.query.students.split(",");
    const fileName = req.query.fileName;
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet([]);
    const headerRow = ["First Name", "Last Name", "Email", "Resume link", "Roll no", "Placement Status", "Placed at", "Date Of Birth", "Contact No.", "Post Graduate CGPA", "Under Graduate CGPA", "Post Graduate Year of Passing", "Under Graduate Year of Passing", "10th %", "12th %", "10th Year of passing", "12th year of passing"];

    XLSX.utils.sheet_add_aoa(worksheet, [headerRow], { origin: 0 });

    const fetchStudentData = async(uid) => {

      const docRef = db.collection("users_student").doc(uid);
      const docSnapshot = await docRef.get();
      const docData = docSnapshot.data();

      return docData;
    };

    const studentsDataPromises = studentsUid.map((uid) => fetchStudentData(uid));
    const studentsData = await Promise.all(studentsDataPromises);

    studentsData.forEach((studentData) => {
      const row = [
        studentData.firstName,
        studentData.lastName,
        studentData.email,
        studentData.resume ? studentData.resume : "-",
        studentData.rollNo,
        studentData.isPlaced? "Placed" : "Not Placed",
        studentData.isPlacedAt ? studentData.isPlacedAt.companyName : "-",
        `${studentData.dob.day}/${studentData.dob.month}/${studentData.dob.year}`,
        studentData.contactNumber ? studentData.contactNumber : "-",
        studentData.pgCgpa ? studentData.pgCgpa : "-",
        studentData.ugCgpa ? studentData.ugCgpa : "-",
        studentData.pgYearOfPassing ? studentData.pgYearOfPassing : "-",
        studentData.ugYearOfPassing ? studentData.ugYearOfPassing : "-",
        studentData.tenthPercentage ? studentData.tenthPercentage : "-",
        studentData.twelfthPercentage ? studentData.twelfthPercentage : "-",
        studentData.tenthYearOfPassing ? studentData.tenthYearOfPassing : "-",
        studentData.twelfthYearOfPassing ? studentData.twelfthYearOfPassing : "-"
      ];

      XLSX.utils.sheet_add_aoa(worksheet, [row], { origin: -1 });
    });

    XLSX.utils.book_append_sheet(workbook, worksheet, `${fileName}`);
    const excelData = XLSX.write(workbook, { type: "buffer" });

    res.setHeader("Content-Disposition", `attachment; filename=${fileName}.xlsx`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    res.send(excelData);
  } catch (error) {
    console.error("Error creating Excel sheet:", error);
    res.status(500).send("Error creating Excel sheet");
  }

})

export { app };
