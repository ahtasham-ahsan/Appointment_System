const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  participants: [{ type: String, required: true }],
  status: { type: String, enum: ['Scheduled', 'Rescheduled', 'Canceled', 'Updated'], default: 'Scheduled' },
  attachment: {
    url: String,
    filename: String,
    mimetype: String
  },
  contentPreview: { type: String },
  owner: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Appointment', appointmentSchema);
