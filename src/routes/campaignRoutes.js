const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const campaigns = require('../controllers/campaignController');

router.use(protect);
router.post('/', campaigns.createCampaign);
router.get('/', campaigns.getCampaigns);
router.get('/:id', campaigns.getCampaign);
router.post('/:id/send', campaigns.sendCampaign);
router.get('/:id/report', campaigns.getReport);
router.put('/:id', campaigns.updateCampaign);
router.delete('/:id', campaigns.deleteCampaign);

module.exports = router;
