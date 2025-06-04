const axios = require('axios');

const headers = {
    authority: 'api.sylica.eu.org',
    origin: 'https://www.kauruka.com',
    referer: 'https://www.kauruka.com/',
    'user-agent': 'Postify/1.0.0'
};

// Extracts ID from a Terabox share link
async function extractId(link) {
    const match = link.match(/s\/([a-zA-Z0-9]+)$|surl=([a-zA-Z0-9]+)$/);
    return match ? (match[1] || match[2]) : null;
}

// Formats the API response
async function formatResponse(data, includeDownloadLink = false) {
    const res = {
        filename: data.filename,
        size: data.size,
        shareid: data.shareid,
        uk: data.uk,
        sign: data.sign,
        timestamp: data.timestamp,
        createTime: data.create_time,
        fsId: data.fs_id,
        message: data.message || 'Unknown error 🤷‍♂️'
    };

    if (includeDownloadLink) {
        res.dlink = data.downloadLink;
    }
    return res;
}

// Terabox API functions
const terabox = {
    // Get file details
    detail: async function (link) {
        const id = await extractId(link);
        if (!id) throw new Error("Please provide a valid Terabox link!");

        try {
            const { data } = await axios.get(`https://api.sylica.eu.org/terabox/?id=${id}`, { headers });
            return await formatResponse(data.data);
        } catch (error) {
            console.error(error);
            throw new Error("Failed to fetch Terabox file details.");
        }
    },

    // Get download link
    dl: async function (link) {
        const id = await extractId(link);
        if (!id) throw new Error("Please provide a valid Terabox link!");

        try {
            const { data } = await axios.get(`https://api.sylica.eu.org/terabox/?id=${id}&download=1`, { headers });
            return await formatResponse(data.data, true);
        } catch (error) {
            console.error(error);
            throw new Error("Failed to fetch Terabox download link.");
        }
    }
};

module.exports = { terabox };
