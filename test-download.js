const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const https = require('https');
const http = require('http');
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
        console.log(`Original fileUrl: ${worksheet.fileUrl}`);

        const reqOpts = {
            hostname: 'localhost',
            port: 3000,
            path: `/api/worksheets/${worksheet._id}/download`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        };

        const req = http.request(reqOpts, (res) => {
            console.log(`STATUS: ${res.statusCode}`);
            console.log(`HEADERS:`, res.headers);

            let data = Buffer.alloc(0);
            res.on('data', (chunk) => {
                data = Buffer.concat([data, chunk]);
            });
            res.on('end', () => {
                console.log(`Downloaded ${data.length} bytes.`);
                if (res.headers['content-type'] && res.headers['content-type'].includes('application/json')) {
                    console.log('JSON Output:', data.toString());
                } else {
                    console.log('Success - Response:', data.toString().substring(0, 100)); // Print first 100 chars
                }
                process.exit(0);
            });
        });

        req.on('error', (e) => {
            console.error(`problem with request: ${e.message}`);
            process.exit(1);
        });

        req.end();

    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

testDownload();
