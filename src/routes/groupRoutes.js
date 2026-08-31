const express = require('express');
const router = express.Router();
const Group = require('../models/Group');

// Create group
router.post('/', async (req, res) => {
  const group = new Group(req.body);
  await group.save();
  res.json(group);
});

// Get all groups
router.get('/', async (req, res) => {
  const groups = await Group.find().populate('contacts');
  res.json(groups);
});

// Add contact to group
router.post('/:groupId/add/:contactId', async (req, res) => {
  const group = await Group.findById(req.params.groupId);
  group.contacts.push(req.params.contactId);
  await group.save();
  res.json(group);
});

module.exports = router;
