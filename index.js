import express from "express";

const app = express();

app.get("/", (req, res) => {
  res.send("hello world");
})

app.get("/message", (req, res) => {
  res.send(req.query.message || "no message");
})

export { app as hey };
