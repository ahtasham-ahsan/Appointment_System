const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS, 
    },
});

const sendEmailNotification = async (recipients, subject, message) => {
    try {
        if (!Array.isArray(recipients) || recipients.length === 0) {
            console.error("Invalid recipients list:", recipients);
            return;
          }
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: recipients.join(", "),
            subject: subject,
            text: message,
        };

        await transporter.sendMail(mailOptions);
        console.log("Email notification sent successfully.");
    } catch (error) {
        console.error("Error sending email:", error);
    }
};

module.exports = sendEmailNotification;
