const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

async function testDownload() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const User = require('./models/User');
        const Worksheet = require('./models/Worksheet');

        const user = await User.findOne();
        if (!user) {
            console.log('No user found');
            process.exit(0);
        }

        const worksheet = await Worksheet.findOne();
        if (!worksheet) {
            console.log('No worksheet found to test downloading');
            process.exit(0);
        }

        const token = jwt.sign({ userId: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });

        console.log(`Testing download for worksheet ID: ${worksheet._id}`);

        // Pass a dummy Authorization header as if it was forwarded to Cloudinary
        const reqOpts = {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        };

        const res = await fetch(worksheet.fileUrl, reqOpts);
        console.log(`Cloudinary DIRECT fetch STATUS: ${res.status}`);
        const text = await res.text();
        console.log(`Response: ${text.substring(0, 100)}`);

    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

testDownload();
