const express = require('express');
const router = express.Router();


// PUT /users/:id - Update user
router.put('/users/:id', authenticateUser, async (req, res) => {
    try {
        const updatedUser = await updateUser(req.params.id, req.body);
        res.status(200).json(updatedUser);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// DELETE /users/:id - Delete user
router.delete('/users/:id', authenticateUser, authorizeAdmin, async (req, res) => {
    try {
        await deleteUser(req.params.id);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;