const cloudinary = require('cloudinary').v2;
require('dotenv').config();
const fs = require('fs');
const path = require('path');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function testRawPDF() {
    try {
        // Create a dummy PDF file
        const dummyPath = path.join(__dirname, 'dummy.pdf');
        fs.writeFileSync(dummyPath, '%PDF-1.4\n%EOF');

        console.log('Uploading PDF as raw resource...');
        const result = await cloudinary.uploader.upload(dummyPath, {
            resource_type: 'raw',
            folder: 'smart-worksheet-hub/files-test'
        });

        console.log(`Uploaded! URL: ${result.secure_url}`);

        console.log('Fetching raw PDF...');
        const response = await fetch(result.secure_url);

        console.log(`FETCH RAW STATUS: ${response.status}`);
        if (!response.ok) {
            console.log(`Error Body:`, await response.text());
        } else {
            console.log(`Success! Fetched ${response.headers.get('content-length')} bytes`);
        }

        fs.unlinkSync(dummyPath);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

testRawPDF();
