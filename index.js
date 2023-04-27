import express from "express";
import cors from "cors";

import { auth } from "./firebase-config.js";
import { signInWithEmailAndPassword } from "firebase/auth";

const app = express();
const corsOptions = {
    origin: "http://localhost:5173",
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

async function login (email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(
          auth,
          email,
          password
        );
        return userCredential;
      } catch (error) {
        console.error(error.message);
        return null;
      }

}

async function checkRole (userCredential, providedRole) {

    try {
        const user = userCredential.user;
        const tokenResult = await user.getIdTokenResult();
        const role = tokenResult.claims.role;
        return role === providedRole ? true : false ;
      } catch (error) {
        console.log(error.message);
      }
}

app.post("/auth", async (req, res) => {
    const {email, password, role:providedRole} = req.body;
    console.log(email, password, providedRole);

    const userCredential = await login(email, password);
    const validUser = await checkRole(userCredential, providedRole);

    if(validUser) { return res.send({ userCredential })}

  res.send({});
})

export { app };
