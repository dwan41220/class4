const { google } = require('googleapis');
const stream = require('stream');

function getOAuth2Client() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    // For Render we construct the redirect URI.
    const redirectUri = process.env.BASE_URL ? `${process.env.BASE_URL}/api/admin/gdrive/callback` : 'http://localhost:3000/api/admin/gdrive/callback';

    if (!clientId || !clientSecret) {
        return null;
    }

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getAuthUrl(state) {
    const oauth2Client = getOAuth2Client();
    if (!oauth2Client) return null;

    return oauth2Client.generateAuthUrl({
        access_type: 'offline', // Requires refresh token
        prompt: 'consent', // Force consent screen to get refresh token
        scope: ['https://www.googleapis.com/auth/drive.file'],
        state: state // Pass the admin JWT here so callback can verify
    });
}

async function uploadToGoogleDrive(buffer, filename, mimeType, tokens) {
    const oauth2Client = getOAuth2Client();
    if (!oauth2Client) throw new Error('Google OAuth2 Client is not configured.');

    oauth2Client.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

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
        const res = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, webViewLink, webContentLink',
        });

        const fileId = res.data.id;

        // Make the file publicly accessible to anyone with the link
        await drive.permissions.create({
            fileId: fileId,
            requestBody: {
                role: 'reader',
                type: 'anyone',
            },
        });

        return {
            fileId: res.data.id,
            webContentLink: res.data.webContentLink,
            webViewLink: res.data.webViewLink
        };
    } catch (err) {
        console.error('Failed to upload to Google Drive:', err);
        throw err;
    }
}

async function deleteFromGoogleDrive(fileId, tokens) {
    const oauth2Client = getOAuth2Client();
    if (!oauth2Client) throw new Error('Google OAuth2 Client is not configured.');

    oauth2Client.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    try {
        await drive.files.delete({ fileId });
    } catch (err) {
        console.error(`Failed to delete file ${fileId} from Google Drive:`, err.message);
    }
}

module.exports = { getOAuth2Client, getAuthUrl, uploadToGoogleDrive, deleteFromGoogleDrive };
