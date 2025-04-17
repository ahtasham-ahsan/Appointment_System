const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

const generateHtmlTemplate = (subject, message) => {
    return `
    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
            <h2 style="color: #333; border-bottom: 1px solid #ddd; padding-bottom: 10px;">${subject}</h2>
            <p style="color: #555; font-size: 16px;">${message}</p>
            <p style="margin-top: 40px; font-size: 14px; color: #999;">This is an automated email from your appointment system.</p>
        </div>
    </div>
    `;
};

const sendEmailNotification = async (recipients, subject, message) => {
    try {
        if (!Array.isArray(recipients) || recipients.length === 0) {
            console.error("Invalid recipients list:", recipients);
            return;
        }

        const html = generateHtmlTemplate(subject, message);

        const mailOptions = {
            from: `"Appointments Team" <${process.env.EMAIL_USER}>`,
            to: recipients.join(", "),
            subject: subject,
            text: message, 
            html: html,
        };

        await transporter.sendMail(mailOptions);
        console.log("Email notification sent successfully.");
    } catch (error) {
        console.error("Error sending email:", error);
    }
};

module.exports = sendEmailNotification;
