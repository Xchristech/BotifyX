require('../settings');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  generateForwardMessageContent,
  generateWAMessageFromContent,
  downloadContentFromMessage,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  jidDecode,
  proto,
  Browsers
} = require('@whiskeysockets/baileys');
const fs = require('fs');
const pino = require('pino');
const chalk = require('chalk');
const path = require('path');
const axios = require('axios');
const FileType = require('file-type');
const PhoneNumber = require('awesome-phonenumber');
const {
  imageToWebp,
  imageToWebp3,
  videoToWebp,
  writeExifImg,
  writeExifImgAV,
  writeExifVid
} = require('../lib/exif');
const {
  getBuffer,
  sleep,
  smsg
} = require('../lib/myfunc');

let usePairingCode = true; // If set to true, a pairing code is used for the bot.
const store = makeInMemoryStore({
  logger: pino().child({
    level: 'silent',
    stream: 'store'
  })
});
const client = {}; // Holds all client instances by their "from" identifiers.

const jadibot = async (DinzBotz, m, from) => {
  if (Object.keys(client).includes(from)) {
    return DinzBotz.sendMessage(from, {
      text: 'You are already a bot!'
    }, {
      quoted: m
    });
  }
  
  const { state, saveCreds } = await useMultiFileAuthState(`./database/rentbot/${m.sender.split("@")[0]}`);
  
  try {
    async function connectToWhatsApp() {
      const { version, isLatest } = await fetchLatestBaileysVersion();
      client[from] = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: !usePairingCode,
        auth: state,
        version: version,
        browser: Browsers.ubuntu("Chrome"),
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        emitOwnEvents: false
      });

      if (usePairingCode && !client[from].user && !client[from].authState.creds.registered) {
        setTimeout(async () => {
          let code = await client[from].requestPairingCode(m.sender.split("@")[0]);
          code = code?.match(/.{1,4}/g)?.join("-") || code;
          let txt = `*[ 𝗝𝗔𝗗𝗜𝗕𝗢𝗧 - 𝗖𝗟𝗢𝗡𝗘 ]*\nPairing code: ${code}\n\nPlease use this code to pair with the bot.`;
          await DinzBotz.sendMessage(from, { text: txt }, { quoted: m });
        }, 2000);
      }
      
      store.bind(client[from].ev);

      client[from].ev.on('messages.upsert', async chatUpdate => {
        try {
          const mek = chatUpdate.messages[0];
          if (!mek.message) return;
          mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message;
          if (mek.key && mek.key.remoteJid === 'status@broadcast') return;
          if (!client[from].public && !mek.key.fromMe) return;
          const m = smsg(client[from], mek, store);
          require('../DinzID')(client[from], m, chatUpdate, store);
        } catch (err) {
          console.log(err);
        }
      });

      client[from].ev.on('presence.update', async () => {
        await client[from].sendPresenceUpdate('available');
      });

      client[from].ev.on('contacts.update', update => {
        update.forEach(contact => {
          const id = client[from].decodeJid(contact.id);
          if (store && store.contacts) store.contacts[id] = { id, name: contact.notify };
        });
      });

      client[from].getName = async (jid, withoutContact = false) => {
        const id = client[from].decodeJid(jid);
        const contact = store.contacts[id] || {};
        return contact.name || contact.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international');
      };

      client[from].sendContact = async (jid, contacts, quoted = '', opts = {}) => {
        let list = [];
        for (let i of contacts) {
          const name = await client[from].getName(i + '@s.whatsapp.net');
          list.push({
            displayName: name,
            vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${name}\nFN:${name}\nitem1.TEL;waid=${i}:${i}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`
          });
        }

        await client[from].sendMessage(jid, {
          contacts: {
            displayName: `${list.length} Contacts`,
            contacts: list
          },
          ...opts
        }, { quoted });
      };

      client[from].setStatus = async (status) => {
        await client[from].query({
          tag: 'iq',
          attrs: { to: '@s.whatsapp.net', type: 'set', xmlns: 'status' },
          content: [{
            tag: 'status',
            attrs: {},
            content: Buffer.from(status, 'utf-8')
          }]
        });
        return status;
      };

      client[from].public = true;
      client[from].serializeM = (m) => smsg(client[from], m, store);

      // File sending functions
      client[from].sendFile = async (jid, path, filename = '', caption = '', quoted, ptt = false, options = {}) => {
        const type = await client[from].getFile(path, true);
        let { res, data, filename: pathFile } = type;
        
        if (res && res.status !== 200 || data.length <= 65536) {
          throw { json: JSON.parse(data.toString()) };
        }
        
        let messageType = '';
        let mimetype = type.mime;

        if (/webp/.test(type.mime) || (/image/.test(type.mime) && options.asSticker)) messageType = 'sticker';
        else if (/image/.test(type.mime) || (/webp/.test(type.mime) && options.asImage)) messageType = 'image';
        else if (/video/.test(type.mime)) messageType = 'video';
        else if (/audio/.test(type.mime)) messageType = 'audio';
        else messageType = 'document';

        const message = {
          ...options,
          caption,
          ptt,
          [messageType]: { url: pathFile },
          mimetype,
          fileName: filename || pathFile.split('/').pop()
        };

        try {
          return await client[from].sendMessage(jid, message, { quoted, ...options });
        } catch (err) {
          return await client[from].sendMessage(jid, { ...message, [messageType]: data }, { quoted, ...options });
        }
      };

      // Media sending functions for images, videos, and audios (similarly handled as above)

      client[from].sendImage = async (jid, path, caption = '', quoted = '', options) => {
        let buffer = Buffer.isBuffer(path) ? path : /^https?:\/\//.test(path) ? await (await fetch(path)).buffer() : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0);
        return await client[from].sendMessage(jid, { image: buffer, caption: caption, ...options }, { quoted });
      };
    }

    connectToWhatsApp();
  } catch (err) {
    console.log('Error connecting bot:', err);
  }
};
