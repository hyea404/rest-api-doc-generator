const express = require('express');
const router = express.Router();

// GET /products/:id - Get product by ID
router.get('/products/:id', async (req, res) => {
    try {
        const product = await getProductById(req.params.id);
        res.json(product);
    } catch (error) {
        res.status(404).json({ message: 'Product not found' });
    }
});

// POST /products - Create product
router.post('/products', authenticateUser, validateProduct, async (req, res) => {
    try {
        const product = await createProduct(req.body);
        res.status(201).json(product);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

module.exports = router;