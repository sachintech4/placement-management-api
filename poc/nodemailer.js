import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.messagingEmailId,
    pass: process.env.messagingEmailPassword,
  }
});

const mailOptions = {
  from: process.env.messagingEmailId,
  to: "sandeeptech8@gmail.com",
  subject: 'Test email from gmail',
  text: 'This is a test email sent from gmail.'
};

transporter.sendMail(mailOptions, function(error, info){
  if (error) {
    console.log(error);
  } else {
    console.log('Email sent: ' + info.response);
  }
});
