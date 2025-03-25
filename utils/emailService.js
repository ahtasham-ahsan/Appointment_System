const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS, 
    },
});
/**
 * @param {string[]} recipients
 * @param {string} su
 * bject 
 * @param {string} message 
 */
const sendEmailNotification = async (recipients, subject, message) => {
    try {
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
