const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function checkUrl() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const Worksheet = require('./models/Worksheet');

        const worksheet = await Worksheet.findOne({ fileUrl: { $regex: /\.pdf$/i } }).sort({ createdAt: -1 });
        if (!worksheet) {
            console.log('No PDF worksheet found.');
            process.exit(0);
        }

        console.log(`Original fileUrl: ${worksheet.fileUrl}`);
        console.log(`Public ID: ${worksheet.filePublicId}`);

        // Generate signed URL
        const signedUrl = cloudinary.utils.url(worksheet.filePublicId, {
            resource_type: worksheet.fileUrl.includes('/raw/') ? 'raw' : 'image',
            sign_url: true,
            secure: true
        });

        console.log(`Signed URL: ${signedUrl}`);

        const response = await fetch(signedUrl);
        console.log(`FETCH SIGNED URL STATUS: ${response.status}`);
        if (!response.ok) {
            console.log(`Error Body:`, await response.text());
        } else {
            console.log(`Success! Fetched ${response.headers.get('content-length')} bytes`);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkUrl();
