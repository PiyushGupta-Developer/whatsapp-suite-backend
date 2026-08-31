const cron = require('node-cron');
const Campaign = require('../models/Campaign');

// Map of active jobs
const jobs = {};

const scheduleCampaign = (campaign) => {
  if (!campaign.scheduledAt) return;

  const date = new Date(campaign.scheduledAt);
  const cronExp = `${date.getMinutes()} ${date.getHours()} ${date.getDate()} ${date.getMonth() + 1} *`;

  const job = cron.schedule(cronExp, async () => {
    console.log(`Running scheduled campaign: ${campaign.name}`);
    campaign.status = 'running';
    await campaign.save();

    let sent = 0, failed = 0;
    for (const recipient of campaign.recipients) {
      try {
        let msg = campaign.message;
        campaign.variables.forEach(v => {
          msg = msg.replace(`{{${v.key}}}`, v.value);
        });
        // TODO: WhatsApp API integration
        console.log(`Sending to ${recipient.phone}: ${msg}`);
        sent++;
      } catch (err) {
        failed++;
      }
    }
    campaign.report.sent = sent;
    campaign.report.failed = failed;
    campaign.status = 'completed';
    await campaign.save();
    job.stop();
    delete jobs[campaign._id];
  });

  jobs[campaign._id] = job;
};

module.exports = { scheduleCampaign };
