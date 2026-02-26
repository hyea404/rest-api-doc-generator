const express = require('express');
const router = express.Router();

// GET /products - Get all products with pagination
router.get('/products', async (req, res) => {
    const { page, limit, category } = req.query;
    try {
        const products = await getProducts({ page, limit, category });
        res.status(200).json(products);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

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

// PATCH /products/:id - Partial update
router.patch('/products/:id', authenticateUser, async (req, res) => {
    try {
        const updated = await updateProduct(req.params.id, req.body);
        res.json(updated);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

module.exports = router;