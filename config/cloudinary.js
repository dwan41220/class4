const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const fileStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: 'smart-worksheet-hub/files',
        resource_type: 'auto',
        allowed_formats: ['pdf', 'png', 'jpg', 'jpeg', 'docx', 'doc'],
    },
});

const imageStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: 'smart-worksheet-hub/thumbnails',
        resource_type: 'image',
        allowed_formats: ['png', 'jpg', 'jpeg', 'webp'],
        transformation: [{ width: 600, height: 400, crop: 'fill' }],
    },
});

const uploadFile = multer({ storage: fileStorage, limits: { fileSize: 120 * 1024 * 1024 } });
const uploadImage = multer({ storage: imageStorage, limits: { fileSize: 10 * 1024 * 1024 } });

module.exports = { cloudinary, uploadFile, uploadImage };
