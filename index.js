import express from "express";
import cors from "cors";

const app = express();
const corsOptions = {
  origin: "http://localhost:5173",
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

app.post("/auth", (req, res) => {
  console.log(req.body);

  // todo
  // 1. get the creds from the body
  // 2. use the API (client?) to authenticated the given credentials.
  // note: pass the role along with email and pwd if possible (we won't need to pass relay the request here if this is possible)
  // 3. match authenticated user role with the supplied role cred
  // 4. send appropriate response

  res.send({});
})

export { app };
