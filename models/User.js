const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    timezone: { type: String, required: true, default: 'UTC' } 
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
