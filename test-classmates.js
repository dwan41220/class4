const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

async function test() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const User = require('./models/User');
        const user = await User.findOne();
        if (!user) {
            console.log('No user found');
            process.exit(0);
        }
        const token = jwt.sign({ userId: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });

        const res = await fetch('http://localhost:3000/api/users/classmates', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const text = await res.text();
        console.log('Status:', res.status);
        console.log('Response:', text);
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}
test();
