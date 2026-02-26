const { google } = require('googleapis');
const stream = require('stream');

let drive = null;

try {
    if (process.env.GOOGLE_DRIVE_CREDENTIALS) {
        let credentials;
        try {
            // First try parsing as direct JSON
            credentials = JSON.parse(process.env.GOOGLE_DRIVE_CREDENTIALS);
        } catch (e) {
            // Fallback to base64 decode if it's base64 encoded
            const decoded = Buffer.from(process.env.GOOGLE_DRIVE_CREDENTIALS, 'base64').toString('utf-8');
            credentials = JSON.parse(decoded);
        }

        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/drive.file'], // Restrict scope to only files created by the app
        });

        drive = google.drive({ version: 'v3', auth });
        console.log('Google Drive API initialized successfully.');
    } else {
        console.warn('Google Drive API NOT initialized. GOOGLE_DRIVE_CREDENTIALS missing.');
    }
} catch (err) {
    console.error('Failed to initialize Google Drive API:', err.message);
}

/**
 * Uploads a file buffer to Google Drive.
 * @param {Buffer} buffer The file buffer to upload
 * @param {string} filename The name of the file
 * @param {string} mimeType The mime type of the file
 * @returns {Promise<{fileId: string, webContentLink: string, webViewLink: string}>}
 */
async function uploadToGoogleDrive(buffer, filename, mimeType) {
    if (!drive) throw new Error('Google Drive API is not initialized.');

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (!folderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID is missing from environment variables.');

    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);

    const fileMetadata = {
        name: filename,
        parents: [folderId],
    };

    const media = {
        mimeType: mimeType,
        body: bufferStream,
    };

    try {
        // 1. Upload the file
        const res = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, webViewLink, webContentLink',
        });

        const fileId = res.data.id;

        // 2. Make the file publicly accessible to anyone with the link
        await drive.permissions.create({
            fileId: fileId,
            requestBody: {
                role: 'reader',
                type: 'anyone',
            },
        });

        // 3. Return the exact links needed for the frontend
        return {
            fileId: res.data.id,
            webContentLink: res.data.webContentLink, // direct download link
            webViewLink: res.data.webViewLink // viewing link
        };
    } catch (err) {
        console.error('Failed to upload to Google Drive:', err);
        throw err;
    }
}

/**
 * Deletes a file from Google Drive.
 * @param {string} fileId The ID of the file to delete
 */
async function deleteFromGoogleDrive(fileId) {
    if (!drive) throw new Error('Google Drive API is not initialized.');
    try {
        await drive.files.delete({ fileId });
    } catch (err) {
        console.error(`Failed to delete file ${fileId} from Google Drive:`, err.message);
    }
}

module.exports = { drive, uploadToGoogleDrive, deleteFromGoogleDrive };
