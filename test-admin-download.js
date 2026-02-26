const cloudinary = require('cloudinary').v2;
require('dotenv').config();

const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
const api_key = process.env.CLOUDINARY_API_KEY;
const api_secret = process.env.CLOUDINARY_API_SECRET;

async function checkUrl() {
    try {
        const public_id = 'smart-worksheet-hub/files/vnme6c37sya1bov74c82';

        const adminApiUrl = `https://api.cloudinary.com/v1_1/${cloud_name}/resources/image/upload/${encodeURIComponent(public_id)}`;

        const authHeader = 'Basic ' + Buffer.from(`${api_key}:${api_secret}`).toString('base64');
        const response = await fetch(adminApiUrl, {
            headers: { 'Authorization': authHeader }
        });

        console.log(`FETCH ADMIN API STATUS: ${response.status}`);
        if (!response.ok) {
            console.log(`Error Body:`, await response.text());
        } else {
            console.log(`Success! Fetched ${response.headers.get('content-length')} bytes`);
            console.log('Response body:', (await response.text()).substring(0, 200));
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkUrl();
