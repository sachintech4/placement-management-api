// login the using client side package

// import { auth } from "./firebase-config.js";
// import { signInWithEmailAndPassword } from "firebase/auth";

// async function login(email, password) {
//   try {
//     const userCredential = await signInWithEmailAndPassword(
//       auth,
//       email,
//       password
//     );
//     return userCredential;
//   } catch (error) {
//     console.error(error.message);
//     return null;
//   }
// }

// async function validateRole(user, role) {
//   try {
//     const tokenResult = await user.getIdTokenResult();
//     const role = tokenResult.claims.role;
//     return role === providedRole ? true : false;
//   } catch (error) {
//     console.error(error.message);
//   }
// }

// app.post("/auth", async (req, res) => {
//   const { email, password, role: providedRole } = req.body;

//   const userCredential = await login(email, password);
//   if (userCredential) {
//     const isRoleValid = validateRole(userCredential.user, providedRole);

//   }
//   const validUser = await checkRole(userCredential, providedRole);

//   if (validUser) {
//     return res.send({ userCredential });
//   }

//   res.send({});
// });