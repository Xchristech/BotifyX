const fs = require('fs');
const canvafy = require("canvafy");
const { getRandom, smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetchJson, delay, sleep } = require('./myfunc');
const { isSetWelcome, getTextSetWelcome } = require('./setwelcome');
const { isSetLeft, getTextSetLeft } = require('./setleft');
const moment = require('moment-timezone');
const { proto, jidDecode, jidNormalizedUser, generateForwardMessageContent, generateWAMessageFromContent, downloadContentFromMessage } = require('@whiskeysockets/baileys');

let set_welcome_db = JSON.parse(fs.readFileSync('./database/set_welcome.json'));
let set_left_db = JSON.parse(fs.readFileSync('./database/set_left.json'));
let setting = JSON.parse(fs.readFileSync('./config.json'));

const welcomeEnabled = setting.auto_welcomeMsg;
const leaveEnabled = setting.auto_leaveMsg;

module.exports.welcome = async (isWelcome, isLeave, DinzBotz, anu) => {
  try {
    const metadata = await DinzBotz.groupMetadata(anu.id);
    const participants = anu.participants;
    const groupName = metadata.subject;
    const groupDesc = metadata.desc;

    for (let num of participants) {
      let pp_user, pp_group;

      try {
        pp_user = await DinzBotz.profilePictureUrl(num, 'image');
      } catch {
        pp_user = 'https://telegra.ph/file/c3f3d2c2548cbefef1604.jpg';
      }

      try {
        pp_group = await DinzBotz.profilePictureUrl(anu.id, 'image');
      } catch {
        pp_group = 'https://telegra.ph/file/c3f3d2c2548cbefef1604.jpg';
      }

      // Handle Member Added
      if (anu.action === 'add' && (isWelcome || welcomeEnabled)) {
        if (isSetWelcome(anu.id, set_welcome_db)) {
          const customWelcomeText = await getTextSetWelcome(anu.id, set_welcome_db);
          const withUser = customWelcomeText.replace(/@user/gi, `@${num.split('@')[0]}`);
          const finalMessage = withUser.replace(/@group/gi, groupName).replace(/@desc/gi, groupDesc);

          DinzBotz.sendMessage(anu.id, { text: `${finalMessage}` });
        } else {
          DinzBotz.sendMessage(anu.id, {
            text: `*Welcome @${num.split("@")[0]} to ${groupName}!* 👋

We’re happy to have you here. Please:
1. Read the group description
2. Follow the rules
3. Notify before leaving

📚 Stay engaged with group activities and discussions!
\`\`\`We hope you benefit from being here.\`\`\``
          });
        }
      }

      // Handle Member Removed
      else if (anu.action === 'remove' && (isLeave || leaveEnabled)) {
        if (isSetLeft(anu.id, set_left_db)) {
          const customLeftText = await getTextSetLeft(anu.id, set_left_db);
          const withUser = customLeftText.replace(/@user/gi, `@${num.split('@')[0]}`);
          const finalMessage = withUser.replace(/@group/gi, groupName).replace(/@desc/gi, groupDesc);

          DinzBotz.sendMessage(anu.id, {
            image: { url: pp_user },
            mentions: [num],
            caption: `${finalMessage}`
          });
        } else {
          DinzBotz.sendMessage(anu.id, {
            text: `*Goodbye to @${num.split("@")[0]} from our beloved group ${groupName}* 👋

We pray the knowledge shared here benefits them 🤲🏻

📌 Dear members, please remember to ask for permission before leaving.

— *Admin of ${groupName}*`
          });
        }
      }

      // Handle Promotion
      else if (anu.action === 'promote') {
        DinzBotz.sendMessage(anu.id, {
          text: `🎉 Congratulations @${num.split('@')[0]}!\nYou have been promoted in *${groupName}*.`,
          mentions: [num]
        });
      }

      // Handle Demotion
      else if (anu.action === 'demote') {
        DinzBotz.sendMessage(anu.id, {
          text: `⚠️ @${num.split('@')[0]}, you have been demoted in *${groupName}*.`,
          mentions: [num]
        });
      }
    }
  } catch (err) {
    console.error("Error in welcome handler:", err);
  }
};
